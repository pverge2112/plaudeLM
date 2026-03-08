# Research: Knowledge Base Tools Interface (MCP Server)

**Branch**: `001-mcp-server` | **Date**: 2026-03-07

---

## Decision 1: MCP SDK Transport Architecture

**Decision**: Use `@modelcontextprotocol/sdk` `StdioServerTransport` for stdio mode and `SSEServerTransport` (via an Express or raw `http.Server`) for SSE mode, selected at startup by reading `MCP_TRANSPORT` env var.

**Rationale**: The official SDK provides first-class transports for both modes. `StdioServerTransport` pipes through stdin/stdout — no network config needed for Claude Desktop. `SSEServerTransport` opens an HTTP server on `MCP_PORT` that Kong MCP Gateway can proxy to. Both transports share the same `McpServer` instance and tool registry, so tool behavior is identical across both modes.

**Alternatives Considered**:
- Custom WebSocket transport: rejected — SDK does not natively support WebSocket; would require a non-standard client adapter.
- Always-on SSE with stdio disabled: rejected — Claude Desktop only supports stdio transport for local MCP servers; SSE requires a running HTTP server, which is unnecessary overhead for local use.

---

## Decision 2: Tool-to-Backend Routing

**Decision**: Route 3 tools to the FastAPI query service (ingest_document, query, audio_overview) and 4 tools to direct database clients (search_concepts, add_relationship, list_notebooks, get_document_graph).

**Rationale**: FastAPI owns the GraphRAG pipeline logic — embedding, graph traversal, re-ranking, and LLM answer generation. Reimplementing any of that in the MCP server would violate the service boundary principle (CONSTITUTION IV.1). Direct client access for simple CRUD-style graph and collection operations avoids unnecessary network hops through FastAPI for operations that don't need pipeline logic.

**Alternatives Considered**:
- All tools via FastAPI: rejected — adds unnecessary latency for simple reads; FastAPI would need endpoints for every graph operation.
- All tools via direct clients: rejected — GraphRAG pipeline logic (rag.py, graph.py, hybrid.py) would need to be duplicated in TypeScript.

---

## Decision 3: Zod as Schema Source of Truth

**Decision**: Define all tool input and output shapes as Zod schemas in each tool file. The MCP tool registration uses `zodToJsonSchema(inputSchema)` for the MCP manifest. Validation runs against the Zod schema before the handler executes.

**Rationale**: Zod provides runtime type safety (validates actual values, not just types) plus TypeScript type inference from the schema. This satisfies CONSTITUTION IV.5 (schema-first) and III.4 (strict TypeScript) simultaneously — the inferred types flow through handler code with no `any` casts needed.

**Alternatives Considered**:
- Manual JSON Schema + TypeScript types: rejected — no runtime validation; schema and types diverge silently.
- io-ts / Effect Schema: rejected — smaller ecosystems; Zod is the dominant choice in the MCP SDK examples and TypeScript community.

---

## Decision 4: Neo4j Client Pattern

**Decision**: Use `neo4j-driver`'s async `Driver` (not `AsyncGraphDatabase` — that is a Python concept). In TypeScript, open a `Driver` via `neo4j.driver(uri, auth)`, create sessions with `driver.session()`, and run Cypher with `session.run()`. Close sessions in `finally` blocks.

**Rationale**: The `neo4j-driver` npm package uses a callback-free async API that integrates cleanly with `async/await`. Sessions are created per-request (not pooled globally) to avoid state leakage between tool calls.

**Alternatives Considered**:
- `neo4j-driver-lite`: rejected — missing some features; full driver is appropriate for a server-side service.
- Connection pool per session: overkill — driver manages its own internal connection pool; session-per-request is the recommended pattern.

---

## Decision 5: Qdrant Client Pattern

**Decision**: Use `@qdrant/js-client-rest` for Qdrant operations. The `QdrantClient` class wraps REST calls. For `list_notebooks`, call `client.getCollection(name)` for each of the 3 known collections to retrieve vector and point counts.

**Rationale**: Official Qdrant JS client; typed responses; no need for raw `fetch` calls. The REST client is sufficient — gRPC adds complexity without meaningful performance gain for low-frequency tool calls.

**Alternatives Considered**:
- Raw `fetch` against Qdrant REST API: rejected — no type safety; reinventing the client.
- gRPC client: rejected — additional proto compilation step; not justified for home-lab usage patterns.

---

## Decision 6: FastAPI Client Pattern

**Decision**: Implement a thin typed wrapper around `fetch` (Node.js 20 native). The `FastApiClient` class exposes typed methods: `query()`, `ingest()`, `audioOverview()`. All methods use `async/await` and throw a typed `FastApiError` on non-2xx responses.

**Rationale**: No external HTTP client library needed — Node.js 20 ships `fetch`. A thin wrapper provides typed request/response objects without the overhead of axios or got, keeping the dependency count low.

**Alternatives Considered**:
- `axios`: rejected — adds a dependency for functionality now native to Node.js 20.
- Direct `fetch` calls in each tool handler: rejected — duplicates error handling; no central point to set base URL and default headers.

---

## Decision 7: Config Validation Pattern

**Decision**: `config.ts` exports a validated `Config` object. At module load time, it reads all required env vars, collects missing names, and throws a single error listing all missing vars if any are absent. Uses a `throwMissing(name)` helper that TypeScript infers as `never` so downstream code sees the var as `string` (not `string | undefined`).

**Rationale**: Fail-fast validation (CONSTITUTION III.2) with a single clear error message listing all missing vars — not one-at-a-time failures. TypeScript narrowing via `throwMissing` means no `!` non-null assertions needed elsewhere.

**Alternatives Considered**:
- `dotenv` + manual checks: rejected — `dotenv` is for local dev file loading, not validation; still needs the same manual checks.
- `zod.object({ VAR: z.string() }).parse(process.env)`: viable alternative, but adds complexity vs. a simple `throwMissing` for a small env var set.

---

## Decision 8: Docker Compose Service

**Decision**: Add `notebooklm-mcp` service to `docker-compose.yml`. Build from `./mcp`. Environment: all required env vars from `.env`. Healthcheck: `curl -f http://localhost:3000/health` (SSE mode) or skip (stdio mode — no HTTP port). `depends_on`: `query` service.

**Rationale**: Service name `notebooklm-mcp` is already defined in ARCHITECTURE.md and must remain stable for future k3s migration (CONSTITUTION IV.4). Depends on `query` service (FastAPI) being healthy before starting.

**Alternatives Considered**:
- Run MCP server outside Docker: rejected — inconsistent with rest of stack; no reproducible environment.
- Separate Dockerfile in root: rejected — `mcp/Dockerfile` co-locates the build definition with the source.

---

## Resolved Clarifications

No `[NEEDS CLARIFICATION]` items were present in the spec. All decisions above were resolvable from `ARCHITECTURE.md`, `CONSTITUTION.md`, and `CLAUDE.md`.
