# Data Model: Knowledge Base Tools Interface (MCP Server)

**Branch**: `001-mcp-server` | **Date**: 2026-03-07

---

## Entities

The MCP server is stateless — it owns no persistent data. All state lives in Qdrant (vectors) and Neo4j (graph). This document describes the data shapes that flow through the MCP server: tool inputs, tool outputs, and the structures passed to/from backend services.

---

### Notebook

The primary scope unit. All tools that touch content are scoped to a notebook.

```
Notebook (enum)
├── name: "kong" | "personal" | "music"
```

**Validation**: Must be one of the three defined values. Any other value is rejected at the tool input schema level.

---

### Tool Inputs

#### ingest_document input

```
IngestDocumentInput
├── source_type: "pdf" | "url" | "markdown" | "gdrive"  [required]
├── notebook: Notebook                                    [required]
├── title: string (min 1 char)                            [required]
├── content: string                                       [optional — for markdown/pdf text]
├── url: string (valid URL)                               [optional — for url/gdrive]
└── file_id: string                                       [optional — for gdrive]
```

**Validation rules**:
- If `source_type = "url"`, then `url` must be present.
- If `source_type = "gdrive"`, then `file_id` must be present.
- If `source_type = "markdown"`, then `content` must be present.
- `pdf` accepts either `content` (base64 or text) or `url`.

---

#### query input

```
QueryInput
├── question: string (min 1 char)  [required]
├── notebook: Notebook              [required]
└── top_k: integer (1–20)          [optional, default: 5]
```

---

#### search_concepts input

```
SearchConceptsInput
├── query: string (min 1 char)     [required]
├── notebook: Notebook              [optional — omit to search across all]
└── limit: integer (1–50)          [optional, default: 10]
```

---

#### add_relationship input

```
AddRelationshipInput
├── from_concept: string (min 1 char)                            [required]
├── relationship: "RELATED_TO" | "BROADER_THAN" | "LINKS_TO"    [required]
├── to_concept: string (min 1 char)                              [required]
└── notebook: Notebook                                           [optional]
```

---

#### list_notebooks input

```
ListNotebooksInput  (empty — no fields required)
```

---

#### get_document_graph input

```
GetDocumentGraphInput
├── document_title: string (min 1 char)  [required]
└── depth: integer (1–3)                 [optional, default: 2]
```

---

#### audio_overview input

```
AudioOverviewInput
├── notebook: Notebook           [required]
└── topic: string (min 1 char)  [required]
```

---

### Tool Outputs

#### ingest_document output

```
IngestDocumentOutput
├── status: "ok"
├── chunks_ingested: integer (≥0)
├── concepts_extracted: integer (≥0)
└── title: string
```

---

#### query output

```
QueryOutput
├── answer: string
├── citations: Citation[]
└── concepts_used: string[]

Citation
├── chunk_id: string (UUID)
├── document_title: string
├── chunk_text: string
├── score: number (0.0–1.0)
└── source_url: string (optional)
```

---

#### search_concepts output

```
SearchConceptsOutput
└── concepts: ConceptResult[]

ConceptResult
├── name: string
├── notebooks: string[]
└── relationship_count: integer (≥0)
```

---

#### add_relationship output

```
AddRelationshipOutput
├── status: "ok"
└── relationship_id: string
```

---

#### list_notebooks output

```
ListNotebooksOutput
└── notebooks: NotebookStats[]

NotebookStats
├── name: string
├── chunk_count: integer (≥0)
├── document_count: integer (≥0)
└── concept_count: integer (≥0)
```

---

#### get_document_graph output

```
GetDocumentGraphOutput
├── document: DocumentNode
├── chunks: ChunkNode[]
├── concepts: ConceptNode[]
└── relationships: RelationshipEdge[]

DocumentNode
├── id: string (UUID)
├── title: string
├── source_type: string
├── source_url: string (optional)
├── notebook: string
└── ingested_at: string (ISO8601)

ChunkNode
├── id: string (UUID)
├── chunk_index: integer
├── notebook: string
└── ingested_at: string (ISO8601)

ConceptNode
├── name: string
└── notebooks: string[]

RelationshipEdge
├── from_id: string
├── to_id: string
├── type: string
└── weight: number (optional)
```

---

#### audio_overview output

```
AudioOverviewOutput
├── script: string (min 200 chars)
├── audio_path: string (local file path)
└── duration_seconds: number (>0)
```

---

### Error Shape

All tool errors follow the MCP error response format. The MCP SDK surfaces these as `McpError` with a `code` and `message`.

```
McpError
├── code: McpErrorCode (enum — from SDK)
│   ├── InvalidParams     — input validation failed
│   ├── InternalError     — backend service failure
│   └── MethodNotFound    — tool not registered (should never occur)
└── message: string       — human-readable; never exposes stack traces
```

**Error mapping**:
- Zod validation failure → `InvalidParams` with field-level message
- FastAPI 4xx → `InvalidParams` with forwarded message
- FastAPI 5xx / network error → `InternalError` with safe message (no internals)
- Neo4j / Qdrant unavailable → `InternalError`
- Missing required backend response field → `InternalError`

---

### State Transitions

The MCP server itself is stateless. The only state transitions are:

1. **Startup**: `UNCONFIGURED` → (config validation) → `READY` | `FAILED` (exit)
2. **Transport**: `READY` → `LISTENING` (stdio attached or SSE port bound)
3. **Tool call**: `LISTENING` → (handler) → `LISTENING` (stateless; no per-call state retained)
