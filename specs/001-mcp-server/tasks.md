# Tasks: Knowledge Base Tools Interface (MCP Server)

**Input**: Design documents from `/specs/001-mcp-server/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: TDD is MANDATORY per CONSTITUTION Article II.1. Test tasks appear BEFORE their implementation tasks within each phase. Tests must be committed in a failing state before any implementation begins.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Create the `mcp/` project from scratch with correct tooling, structure, and build config.

- [ ] T001 Create `mcp/` directory structure per plan.md (`src/tools/`, `src/clients/`, `tests/unit/tools/`, `tests/unit/clients/`, `tests/integration/tools/`, `tests/contract/tools/`)
- [ ] T002 Initialize `mcp/package.json` with all dependencies: `@modelcontextprotocol/sdk`, `zod`, `neo4j-driver`, `@qdrant/js-client-rest`; devDeps: `typescript`, `ts-jest`, `jest`, `@types/node`, `prettier`
- [ ] T003 [P] Create `mcp/tsconfig.json` with `"strict": true`, `"module": "ESNext"`, `"target": "ES2022"`, path aliases for `src/`
- [ ] T004 [P] Create `mcp/jest.config.ts` with three project configs: `unit` (no tags), `integration` (testPathPattern `@integration`), `contract` (testPathPattern `contract/`)
- [ ] T005 [P] Create `mcp/.prettierrc` with `printWidth: 100`, `singleQuote: true` per CLAUDE.md conventions
- [ ] T006 Create `mcp/Dockerfile`: Node.js 20 Alpine base, `npm ci`, `npm run build`, `CMD ["node", "dist/index.js"]`

**Checkpoint**: `mcp/` skeleton exists; `npm install` runs clean; `npm run build` reports no source files yet (expected).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config validation, backend clients, and MCP server scaffold. MUST complete before any user story.

**⚠️ CRITICAL**: No user story work begins until T016 is complete.

- [ ] T007 Write failing unit tests for `config.ts` in `mcp/tests/unit/config.test.ts`: (a) missing env var → throws error naming the missing var; (b) all vars present → returns typed Config object; (c) partial missing → error lists ALL missing vars
- [ ] T008 Implement `mcp/src/config.ts`: validate all required env vars at module load, collect missing names, throw single error listing all if any absent; export typed `Config` object; `throwMissing(name: string): never` helper
- [ ] T009 [P] Write failing unit tests for `fastapi.ts` client in `mcp/tests/unit/clients/fastapi.test.ts`: (a) successful 2xx → returns typed response; (b) 4xx → throws `FastApiError` with `InvalidParams` code; (c) 5xx → throws `FastApiError` with `InternalError` code; (d) network failure → throws `FastApiError`
- [ ] T010 [P] Write failing unit tests for `qdrant.ts` client in `mcp/tests/unit/clients/qdrant.test.ts`: (a) `getCollectionStats(name)` → returns `{ chunk_count, document_count }`; (b) Qdrant unavailable → throws typed error
- [ ] T011 [P] Write failing unit tests for `neo4j.ts` client in `mcp/tests/unit/clients/neo4j.test.ts`: (a) `runQuery(cypher, params)` → returns typed records; (b) `runWrite(cypher, params)` → returns summary; (c) Neo4j unavailable → throws typed error; (d) session closes in finally block
- [ ] T012 Implement `mcp/src/clients/fastapi.ts`: typed `FastApiClient` class using native `fetch`; base URL from `Config`; `post<T>(path, body)` method; throws `McpError(ErrorCode.InternalError)` on 5xx/network; `McpError(ErrorCode.InvalidParams)` on 4xx
- [ ] T013 [P] Implement `mcp/src/clients/qdrant.ts`: `QdrantClient` wrapper using `@qdrant/js-client-rest`; `getCollectionStats(name)` returning `{ chunk_count, document_count }`; throws `McpError(ErrorCode.InternalError)` on failure
- [ ] T014 [P] Implement `mcp/src/clients/neo4j.ts`: `Neo4jClient` class using `neo4j-driver`; `runQuery<T>(cypher, params)` and `runWrite(cypher, params)` methods; session created per call, closed in `finally`; throws `McpError(ErrorCode.InternalError)` on failure
- [ ] T015 Implement `mcp/src/server.ts`: instantiate `McpServer` from `@modelcontextprotocol/sdk`; export `registerTools(server)` function (empty initially — tools registered in their story phases); export `createServer()` factory
- [ ] T016 Implement `mcp/src/index.ts`: read `MCP_TRANSPORT` from Config; if `stdio` → attach `StdioServerTransport`; if `sse` → create `http.Server`, attach `SSEServerTransport` on `MCP_PORT`; call `registerTools`; connect and start
- [ ] T016a Write failing unit test for `mcp/src/index.ts` SSE transport path in `mcp/tests/unit/index.test.ts`: (a) `MCP_TRANSPORT=sse` → `http.Server` created and bound on `MCP_PORT`; (b) `MCP_TRANSPORT=stdio` → no HTTP server created; (c) invalid `MCP_TRANSPORT` value → process exits with descriptive error
- [ ] T016b Verify T016a passes; fix transport selection logic in `index.ts` if needed

**Checkpoint**: `npm run build` succeeds with zero TS errors. `npm test` (unit only) passes after T008 is implemented (T007's tests are green). Server starts in stdio mode without crashing when all env vars set.

---

## Phase 3: User Story 1 — Query the Knowledge Base (Priority: P1) 🎯 MVP

**Goal**: The `query` tool is registered and callable from Claude Desktop. Paul can ask a question against a notebook and receive a grounded answer with citations.

**Independent Test**: Ask Claude "What is Kong's rate limiting strategy?" against the `kong` notebook. Claude must return an answer with at least one citation.

### Tests (Red Phase — commit before implementing T021)

- [ ] T017 [P] [US1] Write failing contract tests for `query` tool in `mcp/tests/contract/tools/query.test.ts`: (a) valid input parses `QueryInputSchema`; (b) empty question → `InvalidParams`; (c) invalid notebook → `InvalidParams`; (d) `top_k=0` → `InvalidParams`; (e) `top_k=21` → `InvalidParams`; (f) valid mock response parses `QueryOutputSchema`
- [ ] T018 [P] [US1] Write failing unit tests for `query` tool handler in `mcp/tests/unit/tools/query.test.ts`: (a) valid input → calls `FastApiClient.post('/query', ...)` with correct payload; (b) FastAPI returns answer + citations → tool returns formatted output; (c) FastAPI `InternalError` → propagates as `McpError`; (d) empty citations → returns answer with empty array (not error)

### Implementation (Green Phase)

- [ ] T019 [US1] Implement `mcp/src/tools/query.ts`: define `QueryInputSchema` and `QueryOutputSchema` Zod schemas per `contracts/tool-schemas.md`; handler calls `fastapi.post('/query', input)`; maps response to `QueryOutputSchema`; register tool in `server.ts` via `registerTools`
- [ ] T020 [US1] Write failing integration test for `query` tool in `mcp/tests/integration/tools/query.test.ts` (`@integration`): (a) real FastAPI running → tool call returns `{ answer, citations, concepts_used }`; (b) FastAPI down → tool returns `McpError(InternalError)`
- [ ] T021 [US1] Verify integration test passes against live query service; fix any response mapping issues in `query.ts`

**Checkpoint**: `query` tool callable from Claude Desktop via stdio. Contract + unit tests green. Integration test green against live stack.

---

## Phase 4: User Story 2 — Add a Document to the Knowledge Base (Priority: P2)

**Goal**: The `ingest_document` tool is registered and callable. Paul can ask Claude to ingest a URL or markdown document and receive confirmation with chunk/concept counts.

**Independent Test**: Ask Claude to ingest a URL into the `personal` notebook. Claude must confirm ingestion and report `chunks_ingested` > 0.

### Tests (Red Phase — commit before implementing T026)

- [ ] T022 [P] [US2] Write failing contract tests for `ingest_document` in `mcp/tests/contract/tools/ingest.test.ts`: (a) valid url input passes schema; (b) missing `url` when `source_type="url"` → `InvalidParams`; (c) missing `file_id` when `source_type="gdrive"` → `InvalidParams`; (d) missing `content` when `source_type="markdown"` → `InvalidParams`; (e) valid output shape parses `IngestDocumentOutputSchema`
- [ ] T023 [P] [US2] Write failing unit tests for `ingest_document` handler in `mcp/tests/unit/tools/ingest.test.ts`: (a) valid url input → calls `FastApiClient.post('/ingest', ...)`; (b) FastAPI returns `{ status, chunks_ingested, concepts_extracted, title }` → tool returns mapped output; (c) FastAPI 5xx → `McpError(InternalError)`; (d) FastAPI 4xx → `McpError(InvalidParams)`

### Implementation (Green Phase)

- [ ] T024 [US2] Implement `mcp/src/tools/ingest.ts`: define `IngestDocumentInputSchema` with `.refine()` cross-field validation per `contracts/tool-schemas.md`; handler calls `fastapi.post('/ingest', input)`; register in `server.ts`
- [ ] T025 [US2] Write failing integration test for `ingest_document` in `mcp/tests/integration/tools/ingest.test.ts` (`@integration`): (a) real FastAPI + n8n running → tool call returns `{ status: 'ok', chunks_ingested, concepts_extracted, title }`; (b) n8n down → tool returns `McpError(InternalError)` with safe message
- [ ] T026 [US2] Verify integration test passes; fix any response mapping issues in `ingest.ts`

**Checkpoint**: `ingest_document` tool callable from Claude Desktop. Contract + unit tests green. Integration test green against live stack.

---

## Phase 5: User Story 3 — Browse and Curate Knowledge Graph Concepts (Priority: P3)

**Goal**: `search_concepts`, `add_relationship`, and `get_document_graph` tools are registered and callable. Paul can explore and manually enrich the knowledge graph via Claude.

**Independent Test**: Ask Claude to search for "API gateway" concepts and then add a RELATED_TO relationship between two returned concepts. Both calls must succeed.

### Tests (Red Phase — commit before implementing T033)

- [ ] T027 [P] [US3] Write failing contract tests for `search_concepts` in `mcp/tests/contract/tools/concepts.test.ts`: (a) valid input passes schema; (b) empty query → `InvalidParams`; (c) valid output shape parses; (d) empty results array is valid output
- [ ] T028 [P] [US3] Write failing contract tests for `add_relationship` in `mcp/tests/contract/tools/concepts.test.ts`: (a) valid input passes; (b) invalid `relationship` type → `InvalidParams`; (c) empty `from_concept` → `InvalidParams`; (d) valid output shape parses
- [ ] T029 [P] [US3] Write failing contract tests for `get_document_graph` in `mcp/tests/contract/tools/graph.test.ts`: (a) valid input passes; (b) `depth=0` → `InvalidParams`; (c) `depth=4` → `InvalidParams`; (d) valid output shape parses
- [ ] T030 [P] [US3] Write failing unit tests for `concepts.ts` handler in `mcp/tests/unit/tools/concepts.test.ts`: `search_concepts` → calls Neo4j full-text index query; `add_relationship` → calls Neo4j MERGE write; both propagate Neo4j errors as `McpError(InternalError)`
- [ ] T031 [P] [US3] Write failing unit tests for `graph.ts` handler in `mcp/tests/unit/tools/graph.test.ts`: valid title → calls Neo4j traversal query; document not found → `McpError(InvalidParams)` with title in message; Neo4j down → `McpError(InternalError)`

### Implementation (Green Phase)

- [ ] T032 [US3] Implement `mcp/src/tools/concepts.ts`: `search_concepts` handler — full-text Cypher query on `Concept.name`; `add_relationship` handler — MERGE Cypher write; both use `Neo4jClient`; both registered in `server.ts`
- [ ] T033 [US3] Implement `mcp/src/tools/graph.ts`: `get_document_graph` handler — Neo4j traversal from `(:Document {title})` at specified depth; maps nodes/relationships to `GetDocumentGraphOutputSchema`; registered in `server.ts`
- [ ] T034 [US3] Write failing integration tests for graph tools in `mcp/tests/integration/tools/concepts.test.ts` and `graph.test.ts` (`@integration`): real Neo4j → search returns results; MERGE creates relationship; graph traversal returns document structure
- [ ] T035 [US3] Verify integration tests pass against live Neo4j; fix Cypher queries as needed

**Checkpoint**: All three graph tools callable from Claude Desktop. Contract + unit + integration tests green.

---

## Phase 6: User Story 4 — Inspect Notebook Status (Priority: P4)

**Goal**: `list_notebooks` tool is registered. Paul can ask Claude "What's in my knowledge base?" and receive chunk, document, and concept counts for all three notebooks.

**Independent Test**: Ask Claude "List my knowledge base notebooks." Claude must return stats for `kong`, `personal`, and `music` — including zero counts for empty notebooks.

### Tests (Red Phase — commit before implementing T039)

- [ ] T036 [P] [US4] Write failing contract tests for `list_notebooks` in `mcp/tests/contract/tools/notebooks.test.ts`: (a) empty input passes schema; (b) output with three notebooks passes `ListNotebooksOutputSchema`; (c) output with empty `notebooks: []` is also valid
- [ ] T037 [P] [US4] Write failing unit tests for `notebooks.ts` handler in `mcp/tests/unit/tools/notebooks.test.ts`: (a) calls `QdrantClient.getCollectionStats` for each of the 3 notebooks; (b) calls Neo4j for concept/document counts per notebook; (c) Qdrant down → `McpError(InternalError)`; (d) Neo4j down → `McpError(InternalError)`; (e) empty collection → notebook appears with zero counts

### Implementation (Green Phase)

- [ ] T038 [US4] Implement `mcp/src/tools/notebooks.ts`: query Qdrant for chunk counts per collection; query Neo4j for `Document` and `Concept` node counts scoped by `notebook` property; merge into `NotebookStats[]`; register in `server.ts`
- [ ] T039 [US4] Write failing integration test for `list_notebooks` in `mcp/tests/integration/tools/notebooks.test.ts` (`@integration`): real Qdrant + Neo4j → all three notebooks returned with counts ≥ 0; empty collection → zero counts (not missing)
- [ ] T040 [US4] Verify integration test passes against live stack; fix stat queries as needed

**Checkpoint**: All 6 tools (query, ingest, search_concepts, add_relationship, get_document_graph, list_notebooks) callable from Claude Desktop. Full test suite green.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: `audio_overview` tool (FR-007), Docker Compose integration, startup validation, and quickstart verification.

- [ ] T041a [P] Write failing contract tests for `audio_overview` in `mcp/tests/contract/tools/audio.test.ts`: valid input passes `AudioOverviewInputSchema`; empty topic → `InvalidParams`; valid mock response passes `AudioOverviewOutputSchema`; `script.length < 200` → `InternalError`
- [ ] T041b [P] Write failing unit tests for `audio_overview` handler in `mcp/tests/unit/tools/audio.test.ts`: valid input → calls `FastApiClient.post('/audio-overview')`; service down → `McpError(InternalError)`; `script.length < 200` in response → `McpError(InternalError)`
- [ ] T042 Implement `mcp/src/tools/audio.ts`: calls `fastapi.post('/audio-overview', input)`; validates `script.length >= 200`; returns `AudioOverviewOutputSchema`; register in `server.ts`
- [ ] T043 Add `plaudelm-mcp` service to `docker-compose.yml`: `build: ./mcp`, env vars from `.env`, `depends_on: [query]`, `restart: unless-stopped`, healthcheck: `curl -f http://localhost:3000/health` (SSE mode only — omit healthcheck for stdio-only deployments)
- [ ] T044 [P] Verify `npm run build` produces zero TypeScript errors and `npm test` (unit + contract) is fully green
- [ ] T045 [P] Run quickstart.md validation: start full stack, connect Claude Desktop, verify all 7 tools appear and respond correctly; document any deviations from quickstart.md

**Checkpoint**: All 7 tools deployed and working. Full Docker Compose stack starts cleanly. `npm test` (unit + contract) green. Integration tests green against live stack.
> ⚠️ **e2e tests are deferred to Spec #6** (CONSTITUTION Article II.3). This spec is not constitutionally complete until Spec #6 e2e tests cover at minimum the `query` tool end-to-end.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Requires Phase 1 complete — **blocks all user stories**
- **US1 Query (Phase 3)**: Requires Phase 2 complete — no dependency on other stories
- **US2 Ingest (Phase 4)**: Requires Phase 2 complete — no dependency on other stories
- **US3 Concepts (Phase 5)**: Requires Phase 2 complete — no dependency on other stories
- **US4 Notebooks (Phase 6)**: Requires Phase 2 complete — no dependency on other stories
- **Polish (Phase 7)**: Requires all user story phases complete

### Within Each Phase (TDD Order)

1. Contract test tasks [P] — write and commit in FAILING state
2. Unit test tasks [P] — write and commit in FAILING state
3. Implementation tasks — implement until tests turn green
4. Integration test tasks — write in FAILING state, then fix until green
5. Verify checkpoint before moving to next phase

### Parallel Opportunities

- T003, T004, T005 can run in parallel (Phase 1)
- T009, T010, T011 can run in parallel (Phase 2 — test writing)
- T016a is sequential after T016 (same file)
- T013, T014 can run in parallel (Phase 2 — client implementations)
- T017, T018 can run in parallel (Phase 3 — test writing)
- T022, T023 can run in parallel (Phase 4 — test writing)
- T027, T028, T029, T030, T031 can run in parallel (Phase 5 — test writing)
- T036, T037 can run in parallel (Phase 6 — test writing)
- Phases 3–6 can be worked in parallel by different developers once Phase 2 is done

---

## Parallel Example: Phase 2 Foundation

```bash
# Run in parallel — different files, no interdependencies:
T009: Write failing unit tests for fastapi.ts client
T010: Write failing unit tests for qdrant.ts client
T011: Write failing unit tests for neo4j.ts client

# Then run in parallel:
T012: Implement fastapi.ts
T013: Implement qdrant.ts
T014: Implement neo4j.ts
```

## Parallel Example: Phase 5 (US3 Concepts)

```bash
# Run in parallel — different files:
T027: Contract tests for search_concepts
T028: Contract tests for add_relationship
T029: Contract tests for get_document_graph
T030: Unit tests for concepts.ts handler
T031: Unit tests for graph.ts handler

# Then sequentially:
T032: Implement concepts.ts
T033: Implement graph.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 Query
4. **STOP and VALIDATE**: `query` tool works from Claude Desktop with live knowledge base
5. Proceed to US2 only after MVP validation

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 Query → `query` tool live (MVP — primary value delivered)
3. US2 Ingest → `ingest_document` tool live
4. US3 Concepts → graph curation tools live
5. US4 Notebooks → operational visibility live
6. Polish → `audio_overview` + Docker Compose

### Story Completion Criteria (per CONSTITUTION II.2)

A user story is NOT complete until:
- [ ] All contract tests green
- [ ] All unit tests green (≥80% line coverage)
- [ ] All integration tests green against live services
- [ ] Tool callable from Claude Desktop in stdio mode

---

## Notes

- `[P]` tasks touch different files — safe to run in parallel
- `[Story]` label maps every task to its user story for traceability
- TDD is mandatory (CONSTITUTION II.1): every test file must be committed in a failing state before the implementation file it covers is created
- `jest --passWithNoTests` is FORBIDDEN (CONSTITUTION II.2)
- Never hardcode URLs, ports, or credentials — all from `Config` (CONSTITUTION III.1)
- Commit after each logical group: `test:` commit (red) → `feat:` commit (green) → `refactor:` commit
