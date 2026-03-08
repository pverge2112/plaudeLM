# Implementation Plan: Kong MCP Gateway Route

**Branch**: `002-kong-mcp-gateway` | **Date**: 2026-03-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-kong-mcp-gateway/spec.md`

## Summary

Create `kong/kong.yaml` (Kong declarative config) with a service, route, and three plugins
(`ai-mcp-proxy`, `key-auth`, `http-log`) that proxy all MCP protocol traffic from
`/notebooklm/mcp/*` to the `notebooklm-mcp` SSE server. Uncomment and complete the
`notebooklm-mcp` Docker Compose service (deferred from Spec #4). Fix the `query`/`kong`
host-port conflict on 8000. Write integration tests verifying tool-call parity between
Kong SSE and direct stdio before touching config (TDD).

## Technical Context

**Language/Version**: YAML (Kong declarative config + Docker Compose); TypeScript 5.x (test suite)
**Primary Dependencies**: `kong/kong-gateway:latest` (Enterprise image — already in docker-compose); `deck` CLI (config validation + diff); `key-auth`, `http-log`, `ai-mcp-proxy` Kong plugins; `@modelcontextprotocol/sdk` (existing MCP client used in tests)
**Storage**: N/A — infrastructure config only; Kong runs DB-less (`KONG_DATABASE: "off"`)
**Testing**: Jest + `@modelcontextprotocol/sdk` Client (integration tests for Kong SSE tool calls); `deck validate` for config syntax; existing contract tests unchanged
**Target Platform**: Docker Compose on macOS/Linux home lab; Kong Gateway 3.x (Enterprise)
**Project Type**: Infrastructure configuration / service integration
**Performance Goals**: Kong upstream timeout ≥ 120s (Ollama inference window for `query` + `ingest_document`); proxy overhead ≤ 500ms above stdio baseline for non-inference tool calls
**Constraints**: Kong runs DB-less — config changes applied via `POST /config` to admin API or container restart; `deck validate` used for syntax checking; no manual Admin API calls for config management; no hardcoded values (API key from env var); service name `notebooklm-mcp` must remain stable per IV.4
**Scale/Scope**: Single user (Paul); 1 Kong service + 1 route; 3 plugins; 1 consumer; 7 MCP tools proxied

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Rule | Status | Notes |
|---------|------|--------|-------|
| I.1 | No code without spec | ✅ PASS | `spec.md` committed before any implementation |
| I.3 | Acceptance criteria testable | ✅ PASS | All 11 FRs map to integration-testable scenarios |
| II.1 | Red → Green → Refactor | ✅ REQUIRED | Integration tests written and committed in FAILING state before `kong.yaml` is created |
| II.2 | Never merge failing tests | ✅ REQUIRED | All tests green before PR merge |
| II.3 | All four test layers | ⚠️ NOTE | Unit layer N/A (no application logic — infrastructure YAML only; justified below). Integration + contract (existing) + e2e layers all required. |
| III.1 | No hardcoded values | ✅ REQUIRED | API key via `KONG_MCP_API_KEY` env var; `deck` env var interpolation; no literal credentials |
| III.2 | Env var validation at startup | ✅ N/A | No new application service with startup validation — MCP server config.ts already handles this (Spec #4) |
| III.3 | Explicit error handling | ✅ N/A | No new application code; Kong handles errors at the gateway layer |
| III.4 | Strict TypeScript | ✅ REQUIRED | Integration test files follow same strict TS config as Spec #4/6 tests |
| III.5 | Async consistency | ✅ REQUIRED | Integration test async/await throughout |
| IV.2 | LLM calls via Kong only | ✅ N/A | This spec adds the MCP route to Kong; LLM routing unchanged |
| IV.4 | Service name stability | ✅ REQUIRED | `notebooklm-mcp` service name is the permanent k3s-compatible name |
| IV.5 | Schema-first for MCP tools | ✅ N/A | Zod schemas unchanged; Kong proxies the existing protocol |

**Constitution Check Result**: PASS — Unit test layer absence is justified (see Complexity Tracking). Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/002-kong-mcp-gateway/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── kong-routes.md   # Kong service/route/plugin contracts
│   └── claude-config.md # Claude Desktop/Code MCP client config snippet
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
kong/
└── kong.yaml                          # CREATE: Kong declarative config
                                       # (service, route, plugins, consumer)

docker-compose.yml                     # MODIFY: uncomment notebooklm-mcp service;
                                       # fix query host port conflict (8000→8081)

.env.example                           # MODIFY: add KONG_MCP_API_KEY;
                                       # update MCP_TRANSPORT comment for Spec #5

mcp/tests/integration/tools/
└── kong-sse.test.ts                   # CREATE: @integration tests for Kong SSE
                                       # tool calls (3+ tests)

tests/e2e/
└── (existing files, no change)        # E2E tests already cover ingest→query pipeline;
                                       # Kong SSE variant covered by kong-sse.test.ts
```

**Structure Decision**: Infrastructure-only spec. No new `src/` directory. Three change surfaces: (1) `kong/kong.yaml` — new declarative config, (2) `docker-compose.yml` — uncomment MCP service + fix port, (3) `mcp/tests/integration/tools/kong-sse.test.ts` — integration tests validating Kong proxy behavior. This keeps the footprint minimal and each change surface independently reviewable.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Unit test layer absent (II.3) | Infrastructure-only spec: `kong.yaml` and `docker-compose.yml` are declarative YAML with no testable logic units. The "logic" is Kong's plugin execution, which requires a real Kong instance to test. | A unit test for YAML config would test YAML parsing, not behavior. All meaningful assertions require a running Kong — that is integration testing by definition. `deck validate` serves as the static-analysis equivalent of a unit test for config syntax. |

---

## Phase 0: Research

> **See `research.md` for full findings.**

### Research Tasks Dispatched

1. **Kong `ai-mcp-proxy` plugin** — exact name, decK config schema, OSS vs Enterprise availability, Kong version requirement
2. **Kong DB-less mode config reload** — `POST /config` admin API vs container restart vs `deck sync`
3. **decK env var interpolation** — exact syntax, flag requirements, consumer credential support
4. **Kong SSE upstream routing** — how Kong proxies long-lived SSE connections (timeout config, strip_path behavior)
5. **MCP SSE path analysis** — from `mcp/src/index.ts`: `GET /sse`, `POST /messages`, `GET /health`

### Key Decisions from Research

See `research.md` for full rationale. Decisions summarized:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MCP proxy approach | Standard Kong reverse proxy + `key-auth` + `http-log` (+ `ai-mcp-proxy` if available) | SSE is standard HTTP; Kong proxies it natively. `ai-mcp-proxy` layered on if Enterprise plugin available. |
| Config deployment | Edit `kong/kong.yaml` + `curl POST /config` to admin API (hot-reload) | Kong is DB-less; `deck sync` changes are ephemeral without file update. `POST /config` applies immediately and file ensures persistence on restart. |
| decK usage | `deck validate` (syntax check) + `deck diff` (drift detection) — NOT `deck sync` for deployment | DB-less mode: `deck sync` would apply changes that don't survive restart. File + `POST /config` is the correct DB-less workflow. |
| API key delivery | `apikey` header (key-auth plugin default) | Standard Kong key-auth; Claude Desktop MCP config supports custom headers. |
| Kong route paths | `/notebooklm/mcp` (SSE) and `/notebooklm/mcp/messages` (POST) as separate routes | MCP SSE requires two HTTP paths; Kong routes each appropriately. |
| `query` host port | Changed from `8000:8000` to `8081:8000` | Fixes conflict with Kong proxy host port 8000. Internal Docker network still uses `http://query:8000`. |

---

## Phase 1: Design & Contracts

> **See `data-model.md` and `contracts/` for full schemas.**

### Kong Config Entities

The `kong/kong.yaml` file defines:

1. **Service** (`notebooklm-mcp`): upstream pointing to `http://notebooklm-mcp:3000` with 120s timeouts
2. **Routes** (two): `GET /notebooklm/mcp` → `/sse`; `POST /notebooklm/mcp/messages` → `/messages`
3. **Plugins** (on the service):
   - `key-auth` — require `apikey` header
   - `http-log` — log to Kong's http-log endpoint
   - `ai-mcp-proxy` (if Enterprise available) — MCP protocol awareness
4. **Consumer** (`paul`): `keyauth_credentials` with key from `KONG_MCP_API_KEY` env var

### Docker Compose Changes

- Uncomment `notebooklm-mcp` service; add `depends_on: query: condition: service_healthy`; add `restart: unless-stopped`; add healthcheck via `GET /health`
- Fix `query` host port: `8000:8000` → `8081:8000`
- Kong service mounts `./kong:/kong/declarative:ro` (already present) — `kong.yaml` placed in `kong/`

### Integration Test Design

`mcp/tests/integration/tools/kong-sse.test.ts` (`@integration`):
- **T1**: Kong health — `GET http://localhost:8000/notebooklm/mcp` without API key → 401
- **T2**: Kong auth — `GET http://localhost:8000/notebooklm/mcp` with valid key → SSE connection established (not 401/404)
- **T3**: Tool parity — `list_notebooks` via Kong SSE returns same schema as direct stdio
- **T4**: Kong-down behavior — when `notebooklm-mcp` stopped, Kong returns 502 (not hang)

All tests skip gracefully (`test.skip`) when Kong is unreachable (same pattern as existing integration tests).

---

## Implementation Phases (for `/speckit.tasks`)

### Phase 1: Setup

- Fix `query` service host port conflict in `docker-compose.yml`
- Uncomment `notebooklm-mcp` service in `docker-compose.yml` with full config
- Add `KONG_MCP_API_KEY` to `.env.example`
- Create empty `kong/kong.yaml` placeholder (valid minimal decK YAML, no routes yet)

### Phase 2: Red Phase — Integration Tests

- Write `mcp/tests/integration/tools/kong-sse.test.ts` with 4+ tests
- Commit in FAILING state (Kong route doesn't exist yet → tests get 404)

### Phase 3: Green Phase — Kong Configuration

- Complete `kong/kong.yaml`: service + routes + plugins + consumer
- Apply config via `curl -sX POST http://localhost:8001/config -F config=@kong/kong.yaml`
- Alternatively: `docker compose restart kong`
- Run `deck validate kong/kong.yaml` to verify syntax

### Phase 4: Verify

- Run integration tests against live stack: `npm run test:integration -- --testPathPattern=kong-sse`
- Verify all 4 tests pass
- Manually verify from Claude Desktop / Claude Code using Kong SSE endpoint

### Phase 5: Polish

- Run `deck diff` against live Kong to verify config matches file
- Update `quickstart.md` with Kong SSE connection instructions
- Update `MEMORY.md`

---

## Notes

- `kong/` directory is currently **empty** — `kong.yaml` must be created from scratch (the `kong-ollama.yaml` referenced in earlier MEMORY.md notes was never created)
- **Port conflict**: `query` and `kong` both had `8000:8000` host port binding — fixed in Phase 1 Setup
- `deck sync` is NOT the deployment mechanism for DB-less Kong — file + `POST /config` is
- `deck validate` is the static analysis gate; run it before every commit that touches `kong/kong.yaml`
- `ai-mcp-proxy` plugin availability depends on Kong license — plan includes fallback to standard proxy if plugin unavailable
- MCP SSE uses two endpoints: `GET /sse` (connection) + `POST /messages?sessionId=X` (client→server messages) — both must be routed by Kong
