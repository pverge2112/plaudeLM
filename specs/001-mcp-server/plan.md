# Implementation Plan: Knowledge Base Tools Interface (MCP Server)

**Branch**: `001-mcp-server` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-mcp-server/spec.md`

## Summary

Build a TypeScript MCP server that exposes 7 knowledge base tools to Claude clients via dual transport (stdio for local use, HTTP/SSE for Kong-proxied access). The server validates configuration at startup, routes tool calls to appropriate backends (FastAPI query service for complex GraphRAG operations, direct Qdrant/Neo4j clients for simple reads/writes), and runs as a containerized service in Docker Compose.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS
**Primary Dependencies**: `@modelcontextprotocol/sdk` (official MCP SDK), `zod` (schema validation), `neo4j-driver` (async Neo4j client), `@qdrant/js-client-rest` (Qdrant REST client), `node-fetch` / native `fetch` (FastAPI HTTP client)
**Storage**: N/A (server is stateless — Qdrant and Neo4j are owned by other services)
**Testing**: Jest (unit + integration + contract), `ts-jest`
**Target Platform**: Node.js 20 LTS, Docker (linux/amd64), local macOS (dev)
**Project Type**: MCP server / service
**Performance Goals**: Tool calls complete within the Ollama inference bound (~60s for query, ~90s for ingest); config validation completes at startup in <1s
**Constraints**: stdio transport only when `MCP_TRANSPORT=stdio`; SSE on `MCP_PORT` when `MCP_TRANSPORT=sse`; no `any` in TypeScript; all I/O async/await; all config from env vars
**Scale/Scope**: Single-user home lab; 3 notebooks; ~7 tool handlers; ~3 backend clients

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Rule | Status | Notes |
|---------|------|--------|-------|
| I.1 | No code without spec | ✅ PASS | `spec.md` committed before any implementation |
| I.3 | Acceptance criteria testable | ✅ PASS | All 11 FRs map to specific scenarios |
| II.1 | Red → Green → Refactor | ✅ REQUIRED | Failing tests must be committed before implementation files |
| II.2 | Never merge failing tests | ✅ REQUIRED | CI gate; all tests green before PR merge |
| II.3 | All four test layers | ✅ REQUIRED | unit + integration + contract in `mcp/tests/`; e2e in Spec #6 |
| III.1 | No hardcoded values | ✅ REQUIRED | `config.ts` must use `throwMissing()` pattern for all env vars |
| III.2 | Env var validation at startup | ✅ REQUIRED | Process must exit with descriptive error if any required var missing |
| III.3 | Explicit error handling | ✅ REQUIRED | No empty catch blocks; all errors logged + re-thrown or structured |
| III.4 | Strict TypeScript | ✅ REQUIRED | `"strict": true` in tsconfig; no `any`; no `as unknown as X` |
| III.5 | Async consistency | ✅ REQUIRED | All I/O async/await; no callbacks; no `.then()` chains |
| IV.2 | LLM calls via Kong only | ✅ N/A | MCP server does not call Ollama directly; FastAPI/query service owns LLM calls |
| IV.3 | No external AI APIs | ✅ PASS | All inference via local Ollama through Kong |
| IV.5 | Schema-first for MCP tools | ✅ REQUIRED | Zod schemas are source of truth; tool handlers conform to schemas |

**Constitution Check Result**: PASS — no violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-mcp-server/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── tool-schemas.md  # Zod input/output schemas for all 7 tools
│   └── error-shapes.md  # MCP error response shapes
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
mcp/
├── src/
│   ├── index.ts              # Entry point — transport selection (stdio / SSE)
│   ├── server.ts             # McpServer instantiation + tool registry
│   ├── config.ts             # Env var validation; throwMissing() helper
│   ├── tools/
│   │   ├── ingest.ts         # ingest_document tool handler
│   │   ├── query.ts          # query tool handler
│   │   ├── concepts.ts       # search_concepts + add_relationship handlers
│   │   ├── notebooks.ts      # list_notebooks handler
│   │   ├── graph.ts          # get_document_graph handler
│   │   └── audio.ts          # audio_overview handler
│   └── clients/
│       ├── fastapi.ts        # FastAPI query service client
│       ├── qdrant.ts         # Qdrant REST client wrapper
│       └── neo4j.ts          # Neo4j async driver wrapper
├── tests/
│   ├── unit/
│   │   ├── tools/            # One test file per tool; all deps mocked
│   │   └── clients/          # Client error handling tests; deps mocked
│   ├── integration/
│   │   └── tools/            # Real services; @integration tag
│   └── contract/
│       └── tools/            # Zod schema validation; all 7 tools
├── package.json
├── tsconfig.json
└── Dockerfile
```

**Structure Decision**: Single-service structure. MCP server is a standalone Node.js process; no frontend. Test structure mirrors source: `unit/tools/` and `unit/clients/` for isolation, `integration/tools/` for real-service tests, `contract/tools/` for schema validation.

## Complexity Tracking

No constitution violations requiring justification.
