# Tasks: Kong MCP Gateway Route

**Input**: Design documents from `/specs/002-kong-mcp-gateway/`
**Prerequisites**: spec.md ✅, plan.md ✅, research.md ✅
**Branch**: `002-kong-mcp-gateway`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths in all descriptions

## Notes on Prior Work

The following were completed in the previous session and are marked accordingly:
- `docker-compose.yml` — `notebooklm-mcp` service entry added; `query` host port changed from `8000:8000` → `8081:8000`
- `.env.example` — `QUERY_SERVICE_URL` internal port corrected

## Remediation Notes (from speckit.analyze)

- **I2 fixed**: T007 (was single route, `strip_path: false`) → split into two explicit routes (SSE + messages) with `strip_path: true`; this is required because MCP server listens at `/sse` and `/messages`, not at the Kong prefix path
- **F1 fixed**: Added T006 (plugin availability check) and T010 (ai-mcp-proxy conditional task) to cover FR-005
- **B1 fixed**: T009 specifies concrete http-log endpoint options — no longer a placeholder
- **A1 fixed**: `deck validate` (T013) now precedes `POST /config` apply (T014)
- **C1 fixed**: T006 is the explicit ai-mcp-proxy availability verification step from research.md R3

---

## Phase 1: Setup (Infrastructure Prerequisites)

**Purpose**: Ensure all config files and env vars are in place before writing any tests or Kong config.

- [ ] T001 Verify `docker-compose.yml` `notebooklm-mcp` service entry is complete — confirm presence of: `restart: unless-stopped`, `depends_on.query.condition: service_healthy`, healthcheck (`GET http://localhost:3000/health`), `MCP_TRANSPORT=sse`, `MCP_PORT`, `QUERY_SERVICE_URL`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `QDRANT_URL` injected from env
- [ ] T002 [P] Add `KONG_MCP_API_KEY` to `.env.example` with description comment (value: `changeme-mcp-api-key` as placeholder; warn to rotate before use)
- [ ] T003 Create `kong/kong.yaml` skeleton — `_format_version: "3.0"` with two stub services for Ollama (`/notebooklm/embed` and `/notebooklm/chat` pointing to `http://ollama:11434`) — no plugins, no MCP route yet — just enough for Kong to start cleanly without config errors

---

## Phase 2: Foundational — TDD Red Phase

**Purpose**: Write integration tests in FAILING state before any Kong MCP config exists. Constitution II.1 requires tests committed and failing before implementation.

**⚠️ CRITICAL**: These tests MUST be committed in a failing state (Kong returns 404 — route does not exist). Do not implement the MCP route in `kong.yaml` until these are committed and confirmed failing.

- [ ] T004 Create `mcp/tests/integration/tools/kong-sse.test.ts` with 5 `@integration` tests — skip gracefully when Kong unreachable (same pattern as existing integration tests):
  - **T4-1**: `GET http://localhost:8000/notebooklm/mcp/sse` with no API key → 401 (will fail with 404 until route + auth exist)
  - **T4-2**: `GET http://localhost:8000/notebooklm/mcp/sse` with valid `apikey` header → SSE connection established (200, `Content-Type: text/event-stream`)
  - **T4-3**: `list_notebooks` tool call via Kong SSE endpoint returns response object with `notebooks` array matching direct stdio schema
  - **T4-4**: `GET http://localhost:8000/notebooklm/mcp/sse` with invalid API key → 401
  - **T4-5**: After any successful tool call via Kong, Kong request log contains an entry (check via `GET http://localhost:8001/requests` or log file)
- [ ] T005 Start Docker Compose stack (`docker compose up -d`) and run `npm run test:integration -- --testPathPattern=kong-sse` — confirm all 5 tests FAIL with 404 (expected — route not yet configured); commit tests in this failing state

**Checkpoint**: Failing tests committed. Plugin availability check and green phase can begin.

---

## Phase 3: User Story 1 — Route MCP Tool Calls Through Kong (Priority: P1) 🎯 MVP

**Goal**: All 7 MCP tools reachable via Kong SSE with identical behavior to direct stdio.

**Independent Test**: `list_notebooks` via Kong SSE returns same schema as direct stdio call — verified by T4-3 integration test.

- [ ] T006 Verify `ai-mcp-proxy` plugin availability on the running Kong instance — run `curl -s http://localhost:8001/plugins/schema/ai-mcp-proxy`; if response is a schema (not 404), plugin is available; document result (available/unavailable) — this determines whether T010 uses `ai-mcp-proxy` or the fallback path
- [ ] T007 [US1] Add MCP `service` block to `kong/kong.yaml` — name: `notebooklm-mcp`, url: `http://notebooklm-mcp:3000`, `connect_timeout: 120000`, `read_timeout: 120000`, `write_timeout: 120000`
- [ ] T008 [US1] Add TWO MCP route blocks to the `notebooklm-mcp` service in `kong/kong.yaml`:
  - Route 1 — SSE connection: name `notebooklm-mcp-sse`, paths: `[/notebooklm/mcp/sse]`, methods: `[GET]`, `strip_path: true` (upstream receives `GET /sse`)
  - Route 2 — Message posting: name `notebooklm-mcp-messages`, paths: `[/notebooklm/mcp/messages]`, methods: `[POST]`, `strip_path: true` (upstream receives `POST /messages`)
  - Note: `strip_path: true` is required — MCP server listens at `/sse` and `/messages`, not at the Kong prefix paths
- [ ] T009 [US1] Add `http-log` plugin to MCP service in `kong/kong.yaml` — service-level plugin; choose ONE concrete log endpoint:
  - **Option A** (preferred for local dev): Add `go-httpbin` service to `docker-compose.yml` (`mccutchen/go-httpbin:latest`, port 8088) and set `http_endpoint: http://go-httpbin:80/post`
  - **Option B** (simpler, no extra container): Replace with `file-log` plugin writing to `/dev/stdout` inside the Kong container (note: FR-007 requires log capture; `file-log` satisfies the intent if `http-log` endpoint is unavailable)
  - Do NOT leave endpoint as a placeholder — Kong will fail to apply config if endpoint is unreachable at startup
- [ ] T010 [US1] Add `ai-mcp-proxy` plugin to MCP service in `kong/kong.yaml` (conditional on T006 result):
  - **If available**: add plugin block `{name: ai-mcp-proxy}` to the service plugins list
  - **If unavailable**: add a comment in `kong/kong.yaml` documenting that `ai-mcp-proxy` was checked and is not available on this Kong version; standard SSE proxying via `key-auth` + `http-log` provides the required functionality

**Checkpoint (US1)**: Kong routes `/notebooklm/mcp/sse` and `/notebooklm/mcp/messages` to `notebooklm-mcp:3000`. Tool calls reachable — not yet authenticated.

---

## Phase 4: User Story 2 — Authenticated MCP Access (Priority: P2)

**Goal**: All requests without a valid API key rejected at Kong with HTTP 401. Authenticated clients reach all 7 tools normally.

**Independent Test**: Send `GET /notebooklm/mcp/sse` with no key → 401; with invalid key → 401; with valid key → SSE connection established. Verified by T4-1, T4-2, T4-4.

- [ ] T011 [US2] Add `key-auth` plugin to MCP service in `kong/kong.yaml` — `config.key_names: [apikey]`; add as the first plugin in the service plugin list (evaluated before http-log and ai-mcp-proxy)
- [ ] T012 [US2] Add `consumers` block to `kong/kong.yaml` — consumer username: `paul`; `keyauth_credentials: [{key: "${KONG_MCP_API_KEY}"}]` (decK env var interpolation syntax — requires `--env-var-expansion` flag on deck commands)
- [ ] T013 [US2] Run `deck validate --env-var-expansion kong/kong.yaml` — must pass with zero errors; fix any syntax issues before proceeding to apply
- [ ] T014 [US2] Apply updated `kong/kong.yaml` to running Kong — `curl -sX POST http://localhost:8001/config -F config=@kong/kong.yaml`; verify response indicates success; check `curl http://localhost:8001/services` shows `notebooklm-mcp` service
- [ ] T015 [US2] Run full integration test suite — `npm run test:integration -- --testPathPattern=kong-sse` — all 5 tests must be GREEN; fix any failures before proceeding

**Checkpoint (US2)**: All 5 integration tests green. Kong auth enforced. Tool parity verified. Log capture confirmed.

---

## Phase 5: User Story 3 — MCP Service in Docker Compose (Priority: P3)

**Goal**: Full stack starts with single `docker compose up -d`; `notebooklm-mcp` starts automatically, passes healthcheck, restarts on crash.

**Independent Test**: `docker compose down && docker compose up -d`; wait for all healthchecks; confirm `notebooklm-mcp` container is running and tool call via Kong succeeds.

- [ ] T016 [US3] Cold-start full stack — `docker compose down` then `docker compose up -d`; watch `docker compose ps` until all services healthy; confirm `notebooklm-mcp` starts only after `query` is healthy (check startup ordering in `docker compose logs notebooklm-mcp`)
- [ ] T017 [US3] Verify restart policy — `docker compose kill notebooklm-mcp` then wait 15s; confirm container restarts automatically (`docker compose ps` shows it running again with a new start time)
- [ ] T018 [US3] Re-run integration tests after cold start — `npm run test:integration -- --testPathPattern=kong-sse` — all 5 must remain green; confirms Kong correctly routes to freshly started `notebooklm-mcp` after a cold boot

**Checkpoint (US3)**: Full stack brings up cleanly. Auto-restart verified. All integration tests green post cold-start.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T019 [P] Run `deck diff --env-var-expansion --kong-addr http://localhost:8001` — output must show zero unexpected changes; `kong/kong.yaml` is the single source of truth for all Kong config
- [ ] T020 [P] Create `specs/002-kong-mcp-gateway/quickstart.md` with: (a) Claude Desktop MCP config JSON snippet pointing to `http://localhost:8000/notebooklm/mcp/sse` with `apikey` header, (b) Claude Code `claude mcp add` command, (c) manual verification steps (`list_notebooks` expected output)
- [ ] T021 Update `MEMORY.md` — mark Spec #5 complete in Completed section; move `plaudeLM-y0x` to closed; update Known Issues (remove warnings about kong/ being empty); log any new architecture decisions from this session

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Red Phase)**: Requires Phase 1 complete (`kong/kong.yaml` skeleton must exist for Kong to start)
- **Phase 3 (US1)**: Requires Phase 2 complete (tests committed in failing state); T006 runs first (plugin check informs T010)
- **Phase 4 (US2)**: Requires Phase 3 complete (route + http-log + ai-mcp-proxy must exist before adding key-auth); T013 (validate) MUST precede T014 (apply)
- **Phase 5 (US3)**: Requires Phase 4 complete (auth must be verified before cold-start validation)
- **Phase 6 (Polish)**: Requires all user story phases complete

### User Story Dependencies

- **US3** (Docker Compose) partially done before Phase 1 (docker-compose.yml changes from prior session)
- **US1** (Route) depends on `kong/kong.yaml` service + route entries — Phase 3
- **US2** (Auth) depends on US1 route existing — key-auth cannot be tested without a route to protect — Phase 4
- US1 and US2 share `kong/kong.yaml` — changes are applied atomically via `POST /config` in T014

### Within Each Phase

- T007 → T008 → T009 → T010 (sequential: service before routes before plugins; T006 can run in parallel with T007 since it's read-only)
- T011 → T012 → T013 → T014 → T015 (sequential: plugin → consumer → **validate** → apply → test)
- T002 and T003 are independent of each other [P] within Phase 1

---

## Parallel Execution Examples

```bash
# Phase 1: T002 and T003 can run in parallel (different files)
Task T002: Add KONG_MCP_API_KEY to .env.example
Task T003: Create kong/kong.yaml skeleton

# Phase 3: T006 (read-only check) can run alongside T007 (write to kong.yaml)
Task T006: curl ai-mcp-proxy schema check
Task T007: Add service block to kong.yaml

# Phase 6: T019 and T020 can run in parallel
Task T019: deck diff verification
Task T020: quickstart.md
```

---

## Implementation Strategy

### MVP (US1 + US2 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: TDD Red (commit 5 failing tests)
3. Complete Phase 3: US1 (Kong routes + plugins)
4. Complete Phase 4: US2 (auth + verify all 5 tests green)
5. **STOP and VALIDATE**: All 5 integration tests green — MVP complete

### Full Delivery (all 3 stories)

1. MVP as above
2. Phase 5: US3 cold-start validation
3. Phase 6: Polish + docs

---

## Metrics

- **Total tasks**: 21 (T001–T021)
- **Phase 1 (Setup)**: 3 tasks
- **Phase 2 (Red Phase)**: 2 tasks
- **Phase 3 (US1)**: 5 tasks (including T006 plugin check, T010 ai-mcp-proxy conditional)
- **Phase 4 (US2)**: 5 tasks (validate before apply — A1 fixed)
- **Phase 5 (US3)**: 3 tasks
- **Phase 6 (Polish)**: 3 tasks
- **Parallel opportunities**: T002‖T003 (Phase 1), T006‖T007 (Phase 3), T019‖T020 (Phase 6)
- **Constitution compliance**: Unit test layer absent (justified in plan.md Complexity Tracking); all other layers covered
- **FR-005 coverage**: T006 (verify availability) + T010 (conditional add) — fully covered
