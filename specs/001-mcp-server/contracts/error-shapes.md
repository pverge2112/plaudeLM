# Error Contracts: Knowledge Base Tools Interface

**Branch**: `001-mcp-server` | **Date**: 2026-03-07

---

## MCP Error Response

The MCP SDK defines a standard error shape. Tool handlers must throw `McpError` (from `@modelcontextprotocol/sdk/types.js`) — never raw `Error`, never plain strings.

```typescript
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Correct — always use McpError
throw new McpError(ErrorCode.InvalidParams, 'notebook must be one of: kong, personal, music');

// Wrong — raw Error leaks internals and is not MCP-compliant
throw new Error('notebook invalid');
```

---

## Error Codes

| Code | When to Use |
|------|-------------|
| `ErrorCode.InvalidParams` | Zod validation failure; missing required input; value out of range; FastAPI 4xx |
| `ErrorCode.InternalError` | FastAPI 5xx; network timeout; Neo4j/Qdrant unavailable; unexpected backend shape |
| `ErrorCode.MethodNotFound` | (Never thrown manually — SDK handles unregistered tools) |

---

## Error Message Rules

1. Messages must be human-readable and actionable — tell the user what was wrong and how to fix it.
2. Messages must NEVER include: stack traces, internal service URLs, raw database errors, or environment variable values.
3. Messages SHOULD include: the field name that failed, the constraint violated, and valid alternatives where applicable.

**Good examples**:
```
"notebook must be one of: kong, personal, music"
"question is required and must not be empty"
"top_k must be between 1 and 20"
"query service unavailable — check that the query service is running"
"document not found: 'My Article' — verify the exact title"
```

**Bad examples**:
```
"ZodError: [{ code: 'invalid_enum_value', ... }]"       ← raw Zod output
"fetch failed: ECONNREFUSED http://localhost:8000"        ← exposes internal URL
"Neo4jError: ServiceUnavailable: WebSocket connection failed"  ← raw driver error
```

---

## Per-Tool Error Scenarios

### `ingest_document`
| Scenario | Code | Message |
|----------|------|---------|
| Missing `url` when source_type="url" | InvalidParams | "url is required when source_type is 'url'" |
| Missing `file_id` when source_type="gdrive" | InvalidParams | "file_id is required when source_type is 'gdrive'" |
| Missing `content` when source_type="markdown" | InvalidParams | "content is required when source_type is 'markdown'" |
| Unknown notebook | InvalidParams | "notebook must be one of: kong, personal, music" |
| Ingest service unavailable | InternalError | "ingest service unavailable — check that the query service is running" |

### `query`
| Scenario | Code | Message |
|----------|------|---------|
| Empty question | InvalidParams | "question is required and must not be empty" |
| top_k out of range | InvalidParams | "top_k must be between 1 and 20" |
| Query service unavailable | InternalError | "query service unavailable — check that the query service is running" |
| No content found | (not an error) | Returns empty citations array with answer noting no content found |

### `search_concepts`
| Scenario | Code | Message |
|----------|------|---------|
| Empty query | InvalidParams | "query is required and must not be empty" |
| limit out of range | InvalidParams | "limit must be between 1 and 50" |
| Neo4j unavailable | InternalError | "graph store unavailable — check that Neo4j is running" |
| No matches | (not an error) | Returns empty concepts array |

### `add_relationship`
| Scenario | Code | Message |
|----------|------|---------|
| Empty from_concept or to_concept | InvalidParams | "from_concept and to_concept must not be empty" |
| Invalid relationship type | InvalidParams | "relationship must be one of: RELATED_TO, BROADER_THAN, LINKS_TO" |
| Neo4j unavailable | InternalError | "graph store unavailable — check that Neo4j is running" |

### `list_notebooks`
| Scenario | Code | Message |
|----------|------|---------|
| Qdrant unavailable | InternalError | "vector store unavailable — check that Qdrant is running" |
| Neo4j unavailable | InternalError | "graph store unavailable — check that Neo4j is running" |

### `get_document_graph`
| Scenario | Code | Message |
|----------|------|---------|
| Empty document_title | InvalidParams | "document_title is required and must not be empty" |
| depth out of range | InvalidParams | "depth must be between 1 and 3" |
| Document not found | InvalidParams | "document not found: '{title}' — verify the exact title" |
| Neo4j unavailable | InternalError | "graph store unavailable — check that Neo4j is running" |

### `audio_overview`
| Scenario | Code | Message |
|----------|------|---------|
| Empty topic | InvalidParams | "topic is required and must not be empty" |
| Audio service unavailable | InternalError | "audio overview service unavailable — check that the query service is running" |
| Script too short (<200 chars) | InternalError | "audio overview generation failed — script was too short" |
