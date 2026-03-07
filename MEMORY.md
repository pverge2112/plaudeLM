# MEMORY.md — Personal NotebookLM

> Read this file at the start of every Claude Code session before doing any work.
> Update this file at the end of every session — mark completions, add decisions, log issues.
> Also read CONSTITUTION.md and ARCHITECTURE.md before starting any task.

---

## Current Status

**Phase:** Architecture complete → Spec writing next  
**Last updated:** 2026-03-07  
**Next action:** Write specs (GitHub Issues) for Neo4j setup, MCP server, and Query service before any implementation begins (CONSTITUTION.md Article I.1)

---

## Completed

### Design & Documentation
- [x] `CLAUDE.md` — project context, stack, conventions
- [x] `CONSTITUTION.md` — non-negotiable rules (spec-driven, TDD, no hardcoded values)
- [x] `ARCHITECTURE.md` — full system design, data schemas, tool specs, testing architecture
- [x] `MEMORY.md` — this file
- [x] `docs/adr/TEMPLATE.md` — ADR template

### Infrastructure (Docker Compose — foundation)
- [x] `docker-compose.yml` — Qdrant + Ollama + n8n with healthchecks
- [x] `.env.example` — all required variables documented
- [x] `scripts/pull-models.sh` — pulls `nomic-embed-text` + `llama3.2`
- [x] `scripts/init-qdrant.py` — creates `kong`, `personal`, `music` collections (768-dim, Cosine)

### Ingest Pipeline (n8n — foundation)
- [x] `n8n/workflows/ingest-pipeline.json` — importable n8n workflow
  - Source routing: PDF, URL, Markdown, Google Drive
  - Chunking: 500 words, 50-word overlap
  - Auto-tag + summarize via llama3.2
  - Embed via nomic-embed-text
  - Store in Qdrant with metadata payload
  - ⚠️ Does NOT yet include graph extraction step (Neo4j) — needs update

### Kong AI Gateway (foundation)
- [x] `kong/kong-ollama.yaml` — decK config
  - `/notebooklm/embed` → Ollama nomic-embed-text (ai-proxy, http-log)
  - `/notebooklm/chat` → Ollama llama3.2 (ai-proxy, ai-rate-limiting-advanced, ai-pii-sanitizer, http-log)
  - ⚠️ Does NOT yet include MCP Gateway route — needs update

---

## In Progress

Nothing — spec writing must happen before implementation resumes.

---

## Backlog (prioritized)

### SPEC WRITING FIRST — create GitHub Issues before any implementation

**Spec #1 — Neo4j Infrastructure**
- Add Neo4j to `docker-compose.yml`
- `scripts/init-neo4j.py` — constraints + indexes
- Update `.env.example` with Neo4j vars
- Acceptance: Neo4j starts healthy, constraints verified via Cypher

**Spec #2 — n8n Graph Extraction Step**
- Add graph extraction node to ingest pipeline after summarization
- llama3.2 prompt returns `{ concepts[], relationships[], events[] }` JSON
- Write to Neo4j: Document, Chunk, Concept nodes + edges
- Fix Qdrant point IDs to use UUIDs (link to neo4j_chunk_id)
- Acceptance: ingest markdown → verify Concept nodes in Neo4j

**Spec #3 — Query Service (FastAPI + GraphRAG)**
- `query/models.py` — Pydantic v2: QueryRequest, QueryResponse, Citation
- `query/rag.py` — Qdrant vector retrieval
- `query/graph.py` — Neo4j concept extraction + graph traversal
- `query/hybrid.py` — merge + re-rank (formula in ARCHITECTURE.md)
- `query/main.py` — FastAPI endpoints (query, health, collections, graph CRUD)
- `query/Dockerfile`
- Add to `docker-compose.yml`
- Acceptance: E2E — ingest doc → query → get citation with neo4j_chunk_id

**Spec #4 — MCP Server**
- `mcp/src/index.ts` — entry point, transport selection (stdio/sse)
- `mcp/src/server.ts` — tool registry
- `mcp/src/tools/` — all 7 tools (ingest, query, search_concepts, add_relationship, list_notebooks, get_document_graph, audio_overview)
- `mcp/src/clients/` — FastAPI, Qdrant, Neo4j clients
- `mcp/src/config.ts` — env var validation (fail-fast)
- `mcp/Dockerfile`
- Add to `docker-compose.yml`
- `claude_desktop_config.json` snippet
- Acceptance: all 7 tools callable from Claude Desktop via stdio

**Spec #5 — Kong MCP Gateway Route**
- Add `/notebooklm/mcp/*` route to `kong/kong-ollama.yaml`
- Plugins: ai-mcp-proxy, key-auth, http-log
- Acceptance: tool call via Kong SSE returns same result as stdio

**Spec #6 — Test Suite**
- MCP: Jest unit + integration + contract tests for all 7 tools
- Query: pytest unit + integration tests for rag, graph, hybrid modules
- E2E: 3 tests (one per notebook) — ingest → query → verify citation
- Acceptance: `npm test` and `pytest` both pass green

**Spec #7 — Audio Overview**
- `query/audio.py` — llama3.2 podcast script generation (host + guest format)
- TTS via local Coqui TTS or Ollama TTS
- `POST /audio-overview` FastAPI endpoint
- `audio_overview` MCP tool
- Acceptance: returns valid audio file path, script > 200 words

### Later Backlog

**k3s Migration**
- [ ] `k8s/qdrant.yaml` — Deployment + PVC + Service
- [ ] `k8s/ollama.yaml` — Deployment + PVC + Service
- [ ] `k8s/n8n.yaml` — Deployment + PVC + Service
- [ ] `k8s/neo4j.yaml` — Deployment + PVC + Service (Neo4j Helm chart)
- [ ] `k8s/query.yaml` — Deployment + Service
- [ ] `k8s/mcp.yaml` — Deployment + Service
- [ ] `k8s/configmap.yaml` + `k8s/secrets.yaml`

**Graph Curation**
- [ ] Confidence scoring on auto-extracted relationships
- [ ] Batch re-extraction on existing chunks with improved prompt
- [ ] Review workflow via Claude+Cowork

**Cowork Integration**
- [ ] Task template: trigger ingest via MCP tool
- [ ] Task template: run notebook query via MCP tool
- [ ] Task template: graph concept review session

---

## Architecture Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-03-07 | Ollama for all LLM + embeddings | Fully local, no API costs, CPU-only home lab |
| 2026-03-07 | llama3.2 (3B) for ingest tagging | Good quality/speed tradeoff on CPU |
| 2026-03-07 | nomic-embed-text for embeddings | Best OSS embedding model for CPU; 768-dim |
| 2026-03-07 | One Qdrant collection per notebook | Clean scoping; avoids metadata filter complexity |
| 2026-03-07 | Docker Compose first, k3s later | Faster iteration; service names preserved for migration |
| 2026-03-07 | No custom frontend | MCP tools are the interface; avoid frontend complexity |
| 2026-03-07 | Kong AI Gateway in front of all Ollama calls | Observability, rate limiting, PII sanitization |
| 2026-03-07 | Neo4j for knowledge graph | Mature graph DB, Cypher, strong Python driver, k3s Helm chart |
| 2026-03-07 | Single unified Neo4j graph | Concepts span notebooks; cross-notebook traversal is a feature |
| 2026-03-07 | GraphRAG hybrid retrieval | Vector finds similar; graph finds connected — LLM gets richer context |
| 2026-03-07 | Auto-extract relationships at ingest, manual review later | Bootstrap graph automatically; curation improves quality over time |
| 2026-03-07 | MERGE (not CREATE) for Concept nodes | Prevents duplicates; accumulates relationships across documents |
| 2026-03-07 | Python FastAPI for query service (not Rust) | Bottleneck is Ollama inference, not server; faster iteration |
| 2026-03-07 | TypeScript MCP server (official SDK) | Official SDK, best compatibility with Claude + Kong MCP Gateway |
| 2026-03-07 | Dual transport: stdio + SSE | stdio for local Claude clients; SSE for Kong MCP Gateway proxying |
| 2026-03-07 | MCP tools call FastAPI for complex ops, direct for simple | FastAPI owns GraphRAG logic; direct clients avoid unnecessary hops |
| 2026-03-07 | Spec-driven development + TDD | Quality, testability, and traceability from day one |
| 2026-03-07 | Jest (TS) + pytest (Python) | Best-in-class for each language; separate concerns cleanly |
| 2026-03-07 | All four test layers (unit/integration/contract/e2e) | Each layer catches different failure modes; contract tests protect MCP schema stability |

---

## Known Issues / Watch Out For

- **Qdrant point IDs** must be unsigned integers or UUIDs. Current n8n workflow uses string composite IDs — fix in Spec #2 to use `crypto.randomUUID()`. UUID also becomes Neo4j Chunk `id`.
- **llama3.2 JSON reliability** — graph extraction prompt may produce malformed JSON on edge cases. Add retry logic + JSON validation in n8n Code node. Consider wrapping with Zod parse + fallback.
- **llama3.2 CPU speed** — ~5-10 tok/s on CPU. Ingest is async so acceptable. For interactive query, cap `max_tokens` to keep latency reasonable.
- **Neo4j Community Edition** — no multiple databases. All notebooks share one database, scoped by node properties. Fine for this design.
- **Neo4j memory** — tune `NEO4J_server_memory_heap_max__size` and `pagecache_size` in docker-compose for home lab constraints. Start with 1G heap, 512M pagecache.
- **Google Drive ingest** — requires Google OAuth 2.0 app. Set up at console.cloud.google.com; credentials go in `.env` and n8n Credentials UI.
- **PDF ingest via n8n** — requires multipart/form-data (binary), not JSON. Document this clearly in MCP `ingest_document` tool error messages.
- **MCP transport switching** — when `MCP_TRANSPORT=sse`, the stdio handler must not be initialized (and vice versa). Validate at startup in `config.ts`.
- **Kong MCP Gateway** — `ai-mcp-proxy` plugin config needs to match the MCP server's SSE endpoint path exactly. Test with `deck diff` before `deck sync`.

---

## Session Notes

### 2026-03-07 — Initial build session
- Full stack designed and scaffolded
- Foundation files generated (docker-compose, n8n workflow, Kong config, init scripts)

### 2026-03-07 — Knowledge graph design session
- Decided on Neo4j + GraphRAG hybrid retrieval
- Designed all node types, relationship types, scoping strategy
- Established re-ranking formula (60% vector, 40% graph)

### 2026-03-07 — MCP server + constitution session
- Designed full MCP server architecture (7 tools, dual transport, TypeScript)
- Established spec-driven development + TDD mandate
- Created CONSTITUTION.md, ARCHITECTURE.md, updated CLAUDE.md + MEMORY.md
- **Next session must start by writing GitHub Issue specs before any code**
- Suggested order: Spec #1 (Neo4j) → Spec #2 (graph extraction) → Spec #3 (query service) → Spec #4 (MCP server)
