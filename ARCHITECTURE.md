# ARCHITECTURE.md — Personal NotebookLM

> This document is the authoritative reference for system architecture.
> All implementation decisions must be consistent with this document.
> Changes to architecture require an ADR in `docs/adr/`.

---

## System Overview

Personal NotebookLM is a fully local, self-hosted **GraphRAG** knowledge base.
It combines vector similarity search (Qdrant) with knowledge graph traversal (Neo4j)
to provide richer, more connected retrieval than either system alone.

All LLM and embedding inference runs locally via Ollama.
All LLM traffic is routed through Kong AI Gateway for observability and control.
The primary interface is Claude (Desktop, Code, or claude.ai) via an MCP server.
No custom frontend. No external AI APIs.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Clients                              │
│          Claude Desktop  │  Claude Code  │  claude.ai           │
└──────────────┬───────────┴──────┬────────┴──────────────────────┘
               │ stdio            │ stdio
               │                  │         ┌──────────────────────┐
               │                  │         │   Kong MCP Gateway   │
               │                  │         │  (HTTP/SSE proxy)    │
               │                  │         └──────────┬───────────┘
               │                  │                    │ SSE
               └──────────────────┴────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │     MCP Server             │
                    │   (TypeScript, port 3000)  │
                    │                            │
                    │  Tools:                    │
                    │  • ingest_document         │
                    │  • query                   │
                    │  • search_concepts         │
                    │  • add_relationship        │
                    │  • list_notebooks          │
                    │  • get_document_graph      │
                    │  • audio_overview          │
                    └──────┬──────────┬──────────┘
                           │          │
              ┌────────────▼──┐  ┌────▼──────────────────┐
              │  FastAPI       │  │  Direct clients        │
              │  Query Service │  │  (Qdrant, Neo4j)       │
              │  (Python :8000)│  └──────┬──────┬──────────┘
              └────────┬───────┘         │      │
                       │                 │      │
         ┌─────────────▼─────────────────▼──┐   │
         │         Kong AI Gateway           │   │
         │  /notebooklm/chat  (llama3.2)     │   │
         │  /notebooklm/embed (nomic-embed)  │   │
         └─────────────────┬─────────────────┘   │
                           │                     │
                    ┌──────▼──────┐               │
                    │   Ollama    │               │
                    │  llama3.2   │         ┌─────▼──────┐  ┌──────────┐
                    │  nomic-embed│         │   Qdrant   │  │  Neo4j   │
                    └─────────────┘         │ (vectors)  │  │ (graph)  │
                                            └────────────┘  └──────────┘

                    ┌─────────────────────────────────────────────┐
                    │              n8n (Ingest Pipeline)           │
                    │  PDF │ URL │ Markdown │ Google Drive         │
                    │  → chunk → summarize → extract graph         │
                    │  → embed → store Qdrant + Neo4j              │
                    └─────────────────────────────────────────────┘
```

---

## Services

### MCP Server (`mcp/`)
**Language:** TypeScript  
**SDK:** `@modelcontextprotocol/sdk` (official)  
**Transport:** stdio (local) | HTTP/SSE (Kong-proxied) — selected via `MCP_TRANSPORT` env var  
**Port:** 3000 (SSE mode only)  
**Responsibility:** Expose all NotebookLM capabilities as MCP tools. Route tool calls to the appropriate backend (FastAPI for complex ops, direct clients for simple reads/writes).

### Query Service (`query/`)
**Language:** Python 3.11+  
**Framework:** FastAPI + Pydantic v2  
**Port:** 8000  
**Responsibility:** GraphRAG hybrid retrieval. Owns the logic for combining Qdrant vector search with Neo4j graph traversal, re-ranking, and constructing the final LLM prompt.

### Ingest Pipeline (`n8n/`)
**Platform:** n8n  
**Port:** 5678  
**Responsibility:** Orchestrate document ingestion from all source types. Chunk, summarize, extract graph entities, embed, and persist to Qdrant + Neo4j.

### Kong AI Gateway (`kong/`)
**Platform:** Kong Gateway with AI plugins  
**Ports:** 8000 (proxy), 8001 (admin)  
**Responsibility:** Route all LLM/embedding calls to Ollama. Enforce rate limiting, PII sanitization, and request logging on all AI traffic.

### Qdrant
**Image:** `qdrant/qdrant:latest`  
**Ports:** 6333 (REST), 6334 (gRPC)  
**Responsibility:** Store and search 768-dim embedding vectors. One collection per notebook.

### Neo4j
**Image:** `neo4j:5-community`  
**Ports:** 7474 (browser), 7687 (Bolt)  
**Responsibility:** Store the knowledge graph. Single database, nodes scoped by `notebook` property.

### Ollama
**Image:** `ollama/ollama:latest`  
**Port:** 11434  
**Models:** `llama3.2` (chat/summarization/extraction), `nomic-embed-text` (embeddings)  
**Responsibility:** Local LLM inference. CPU-only. Never called directly — always via Kong.

---

## Data Architecture

### Qdrant Collections

| Collection | Dimensions | Distance | Contents |
|---|---|---|---|
| `kong` | 768 | Cosine | Kong/work knowledge base chunks |
| `personal` | 768 | Cosine | Personal research & notes chunks |
| `music` | 768 | Cosine | Music & creative project chunks |

**Point payload schema:**
```json
{
  "chunk_text": "string",
  "summary": "string",
  "tags": ["string"],
  "title": "string",
  "source_type": "pdf | url | markdown | gdrive",
  "source_url": "string",
  "chunk_index": 0,
  "total_chunks": 10,
  "ingested_at": "ISO8601",
  "neo4j_chunk_id": "uuid"
}
```

The `neo4j_chunk_id` field links every Qdrant point to its corresponding Neo4j `(:Chunk)` node,
enabling the hybrid retrieval merge step.

### Neo4j Graph Schema

**Node types:**
```cypher
(:Document {
  id: String,           // UUID
  title: String,
  source_type: String,
  source_url: String,
  notebook: String,     // "kong" | "personal" | "music"
  ingested_at: DateTime
})

(:Chunk {
  id: String,           // UUID — same as Qdrant point ID
  chunk_index: Integer,
  notebook: String,
  ingested_at: DateTime
})

(:Concept {
  name: String,         // normalized lowercase
  notebooks: [String]   // accumulates as concept appears across notebooks
})

(:Event {
  name: String,
  date: Date,           // nullable
  notebook: String
})
```

**Relationship types:**
```cypher
(:Chunk)-[:PART_OF]->(:Document)
(:Chunk)-[:MENTIONS]->(:Concept)
(:Concept)-[:RELATED_TO {weight: Float}]->(:Concept)
(:Concept)-[:BROADER_THAN]->(:Concept)
(:Document)-[:LINKS_TO]->(:Document)
(:Chunk)-[:REFERENCES]->(:Event)
(:Event)-[:PRECEDES]->(:Event)
```

**Constraints and indexes:**
```cypher
CREATE CONSTRAINT ON (c:Concept)  ASSERT c.name IS UNIQUE;
CREATE CONSTRAINT ON (d:Document) ASSERT d.id   IS UNIQUE;
CREATE CONSTRAINT ON (ch:Chunk)   ASSERT ch.id  IS UNIQUE;
CREATE INDEX FOR (ch:Chunk)   ON (ch.notebook);
CREATE INDEX FOR (co:Concept) ON (co.notebooks);
```

---

## GraphRAG Hybrid Retrieval

The query pipeline combines two retrieval strategies and merges their results:

```
Question
    │
    ├─► [1] Embed question (nomic-embed-text via Kong)
    │         └─► Qdrant cosine search → top-5 chunks (with scores)
    │
    ├─► [2] Extract concepts from question (llama3.2 via Kong)
    │         └─► Neo4j Cypher traversal (1-2 hops from matched concepts)
    │               └─► related Chunk IDs + graph paths
    │
    ├─► [3] Merge + deduplicate results
    │         └─► Score = (qdrant_score × 0.6) + (1/hop_distance × 0.4)
    │
    ├─► [4] Re-rank → top-8 merged chunks
    │
    └─► [5] Build grounded prompt → llama3.2 → answer + citations
```

**Re-ranking formula:**
- Qdrant-only hits: `score = qdrant_cosine_score × 0.6`
- Graph-only hits: `score = (1 / hop_distance) × 0.4`
- Both: `score = (qdrant_cosine_score × 0.6) + (1/hop_distance × 0.4)`

---

## MCP Tool Specifications

### `ingest_document`
```typescript
input:  { source_type: 'pdf'|'url'|'markdown'|'gdrive', notebook: Notebook,
          title: string, content?: string, url?: string, file_id?: string }
output: { status: 'ok', chunks_ingested: number, concepts_extracted: number, title: string }
backend: FastAPI → n8n webhook
```

### `query`
```typescript
input:  { question: string, notebook: Notebook, top_k?: number }
output: { answer: string, citations: Citation[], concepts_used: string[] }
backend: FastAPI /query (full GraphRAG pipeline)
```

### `search_concepts`
```typescript
input:  { query: string, notebook?: Notebook, limit?: number }
output: { concepts: Array<{ name: string, notebooks: string[], relationship_count: number }> }
backend: Neo4j direct (full-text index search on Concept.name)
```

### `add_relationship`
```typescript
input:  { from_concept: string, relationship: RelType, to_concept: string, notebook?: Notebook }
output: { status: 'ok', relationship_id: string }
backend: Neo4j direct (MERGE relationship)
```

### `list_notebooks`
```typescript
input:  {}
output: { notebooks: Array<{ name: string, chunk_count: number, document_count: number,
                             concept_count: number }> }
backend: Qdrant direct (collection stats) + Neo4j direct (node counts)
```

### `get_document_graph`
```typescript
input:  { document_title: string, depth?: number }
output: { document: DocumentNode, chunks: ChunkNode[], concepts: ConceptNode[],
          relationships: RelationshipEdge[] }
backend: Neo4j direct (graph traversal from Document node)
```

### `audio_overview`
```typescript
input:  { notebook: Notebook, topic: string }
output: { script: string, audio_path: string, duration_seconds: number }
backend: FastAPI /audio-overview
```

---

## MCP Transport Architecture

```
┌──────────────────────────────────────────────────┐
│                  MCP Server                       │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │              Tool Registry                  │  │
│  │  ingest_document | query | search_concepts  │  │
│  │  add_relationship | list_notebooks          │  │
│  │  get_document_graph | audio_overview        │  │
│  └─────────────────────────────────────────────┘  │
│                        │                          │
│         ┌──────────────┼──────────────┐           │
│         │              │              │           │
│  ┌──────▼──────┐  ┌────▼────┐  ┌─────▼──────┐   │
│  │ stdio       │  │FastAPI  │  │ Direct     │   │
│  │ transport   │  │ client  │  │ clients    │   │
│  │             │  │         │  │ Qdrant     │   │
│  │ HTTP/SSE    │  │         │  │ Neo4j      │   │
│  │ transport   │  │         │  │            │   │
│  └─────────────┘  └─────────┘  └────────────┘   │
└──────────────────────────────────────────────────┘

MCP_TRANSPORT=stdio → Claude Desktop / Claude Code
MCP_TRANSPORT=sse   → Kong MCP Gateway
```

---

## Ingest Pipeline Detail

```
Source (PDF | URL | Markdown | GDrive)
    │
    ▼
[n8n] Extract raw text
    │
    ▼
[n8n] Normalize → raw_text, title, source_type, source_url, notebook
    │
    ▼
[n8n] Chunk (500 words, 50-word overlap) → generates chunk_id (UUID)
    │
    ├─► [Ollama via Kong] Summarize + auto-tag → summary, tags[]
    │
    ├─► [Ollama via Kong] Extract graph entities →
    │       { concepts[], relationships[], events[] }
    │         │
    │         └─► [Neo4j]
    │               MERGE (:Document {id, title, ...})
    │               MERGE (:Chunk {id: chunk_id, ...})
    │               CREATE (:Chunk)-[:PART_OF]->(:Document)
    │               MERGE (:Concept {name}) ON CREATE SET notebooks=[]
    │               CREATE (:Chunk)-[:MENTIONS]->(:Concept)
    │               MERGE (:Concept)-[:RELATED_TO]->(:Concept)
    │
    └─► [Ollama via Kong] Embed chunk_text → 768-dim vector
              │
              └─► [Qdrant] PUT /collections/{notebook}/points
                    { id: chunk_id, vector: [...], payload: { ...metadata, neo4j_chunk_id } }
```

---

## Testing Architecture

```
tests/
├── e2e/                          # Full stack: ingest → query → citation
│   ├── kong.e2e.test.ts
│   ├── personal.e2e.test.ts
│   └── music.e2e.test.ts
│
mcp/
├── tests/
│   ├── unit/                     # Jest, all deps mocked
│   │   ├── tools/
│   │   └── clients/
│   ├── integration/              # Jest, real services
│   │   └── tools/
│   └── contract/                 # Jest + Zod schema validation
│       └── tools/
│
query/
├── tests/
│   ├── unit/                     # pytest, all deps mocked
│   │   ├── test_rag.py
│   │   ├── test_graph.py
│   │   └── test_hybrid.py
│   └── integration/              # pytest, real services
│       ├── test_qdrant.py
│       ├── test_neo4j.py
│       └── test_query_endpoint.py
```

**Test environment isolation:**
- Integration tests use `TEST_QDRANT_COLLECTION=test_{notebook}` collections
- Integration tests use `TEST_NEO4J_DATABASE=test` (Neo4j Enterprise) or label-scoped nodes
- E2E tests run against full Docker Compose stack with `--profile test`
- Never run integration or E2E tests against production collections

---

## Environment Variables Reference

| Variable | Service | Required | Description |
|---|---|---|---|
| `OLLAMA_BASE_URL` | all | yes | Ollama base URL (never called directly — via Kong) |
| `QDRANT_URL` | query, mcp, n8n | yes | Qdrant REST API URL |
| `NEO4J_URI` | query, mcp, n8n | yes | Neo4j Bolt URI |
| `NEO4J_USER` | query, mcp, n8n | yes | Neo4j username |
| `NEO4J_PASSWORD` | query, mcp, n8n | yes | Neo4j password |
| `KONG_PROXY_URL` | query, mcp, n8n | yes | Kong AI Gateway proxy URL |
| `MCP_TRANSPORT` | mcp | yes | `stdio` or `sse` |
| `MCP_PORT` | mcp | sse only | Port for SSE server (default: 3000) |
| `QUERY_SERVICE_URL` | mcp | yes | FastAPI query service URL |
| `N8N_WEBHOOK_URL` | mcp | yes | n8n ingest webhook base URL |
| `N8N_ENCRYPTION_KEY` | n8n | yes | n8n encryption key (openssl rand -hex 32) |
| `TEST_QDRANT_URL` | tests | integration | Qdrant URL for test isolation |
| `TEST_NEO4J_URI` | tests | integration | Neo4j URI for test isolation |

---

## Kong AI Gateway Routes

| Route | Upstream | Plugins |
|---|---|---|
| `POST /notebooklm/embed` | Ollama `nomic-embed-text` | ai-proxy, http-log |
| `POST /notebooklm/chat` | Ollama `llama3.2` | ai-proxy, ai-rate-limiting-advanced, ai-pii-sanitizer, http-log |
| `ANY /notebooklm/mcp/*` | MCP Server SSE (port 3000) | ai-mcp-proxy, key-auth, http-log |

---

## Migration Path: Docker Compose → k3s

| Docker Compose | k3s |
|---|---|
| Service names | Kubernetes Service names (identical) |
| Named volumes | PersistentVolumeClaims (local-path-provisioner) |
| `.env` vars | ConfigMap (non-sensitive) + Sealed Secrets (sensitive) |
| `depends_on` healthchecks | `readinessProbe` |
| `build: ./mcp` | Container image pushed to local registry |
| Kong config via decK | Kong Helm chart + KongPlugin CRDs |
| Neo4j Community | Neo4j Helm chart (community) |

k3s manifests will live in `k8s/` when migration begins.
A migration spec (GitHub Issue) is required before any k3s work starts.

---

## ADR Index

| ADR | Title | Status |
|---|---|---|
| [ADR-001](docs/adr/ADR-001-local-ollama.md) | Use Ollama for all LLM inference | Accepted |
| [ADR-002](docs/adr/ADR-002-graphrag-hybrid.md) | GraphRAG hybrid retrieval pattern | Accepted |
| [ADR-003](docs/adr/ADR-003-neo4j-single-graph.md) | Single unified Neo4j graph across notebooks | Accepted |
| [ADR-004](docs/adr/ADR-004-mcp-typescript.md) | MCP server in TypeScript with dual transport | Accepted |
| [ADR-005](docs/adr/ADR-005-python-query-service.md) | Python FastAPI for query service (not Rust) | Accepted |
| [ADR-006](docs/adr/ADR-006-spec-driven-tdd.md) | Spec-driven development + TDD with Jest+pytest | Accepted |
