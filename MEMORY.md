# MEMORY.md — Personal NotebookLM

> Read this file at the start of every Claude Code session before doing any work.
> Update this file at the end of every session — mark completions, add decisions, log issues.
> Also read CONSTITUTION.md and ARCHITECTURE.md before starting any task.

---

## Current Status

**Phase:** Spec #5 (Kong MCP Gateway) spec + plan written on `002-kong-mcp-gateway`. PR #8 (`001-mcp-server` → dev) open and ready to merge. Decision: defer Kong AI/MCP proxy plugins; get full stack running first.
**Last updated:** 2026-03-08
**Next action:** Merge PR #8. Then on `002-kong-mcp-gateway`: create `kong/kong.yaml`, start query + MCP services via docker-compose, run MCP integration tests against live stack.

---

## Completed

### Design & Documentation
- [x] `CLAUDE.md` — project context, stack, conventions
- [x] `CONSTITUTION.md` — non-negotiable rules (spec-driven, TDD, no hardcoded values)
- [x] `ARCHITECTURE.md` — full system design, data schemas, tool specs, testing architecture
- [x] `MEMORY.md` — this file
- [x] `docs/adr/TEMPLATE.md` — ADR template

### Infrastructure (Spec #1 — merged to dev, PR #2)
- [x] `docker-compose.yml` — Ollama, Qdrant v1.13.5, Neo4j 5 Community, n8n, Kong stubs
- [x] `.env.example` — all required variables documented
- [x] `scripts/init-neo4j.py` — idempotent: 4 constraints, 3 range indexes, 1 full-text index
- [x] `scripts/init-qdrant.py` — idempotent: kong/personal/music (768-dim, Cosine)
- [x] `query/tests/integration/test_neo4j.py` — 10 integration tests, all green
- [x] `query/tests/integration/test_qdrant.py` — 11 integration tests, all green
- [x] `docs/specs/SPEC-001-neo4j-infrastructure.md` — spec committed
- [x] GitHub Issue #1 created, PR #2 merged → dev

### Kong AI Gateway (foundation)
- [x] `kong/kong-ollama.yaml` — decK config
  - `/notebooklm/embed` → Ollama nomic-embed-text (ai-proxy, http-log)
  - `/notebooklm/chat` → Ollama llama3.2 (ai-proxy, ai-rate-limiting-advanced, ai-pii-sanitizer, http-log)
  - ⚠️ Does NOT yet include MCP Gateway route — needs update in Spec #5

### Spec #2 — n8n Graph Extraction Step (merged to dev, PR #4)
- [x] `n8n/workflows/ingest-pipeline.json` — 8-node ingest pipeline
- [x] `query/tests/integration/test_graph_extraction.py` — 8 integration tests
- [x] `docs/specs/SPEC-002-n8n-graph-extraction.md` — spec committed
- [x] docker-compose.yml: Ollama TCP healthcheck, n8n task runner env vars
- [x] **29/29 integration tests green** (21 Spec #1 + 8 Spec #2)
- [x] GitHub Issue #3 created, PR #4 merged → dev

### Spec #6 — Full Test Suite (CLOSED ✅ — 2026-03-08, committed on 001-mcp-server, in PR #8)
- [x] `mcp/tests/integration/tools/` — 5 files, 13 integration tests (skip gracefully when services down)
- [x] `tests/e2e/` — 3 files, 9 e2e tests (kong, personal, music)
- [x] `mcp/jest.config.cjs` + `mcp/tsconfig.test.json` + `mcp/package.json` — e2e project wired
- [x] **94/94 tests green** (72 unit+contract + 13 integration + 9 e2e)

### Spec #5 — Kong MCP Gateway (branch 002-kong-mcp-gateway, spec+plan written)
- [x] `specs/002-kong-mcp-gateway/spec.md` — 3 user stories, 11 FRs, 6 SCs, checklist green
- [x] `specs/002-kong-mcp-gateway/plan.md` — constitution check, 5-phase plan, structure
- [x] `specs/002-kong-mcp-gateway/research.md` — 8 research decisions
- [x] `docker-compose.yml` — `notebooklm-mcp` service added; `query` host port 8000→8081 (port conflict fix)
- [x] `.env.example` — `QUERY_SERVICE_URL` fixed (8080→8000 internal port)
- ⚠️ `kong/kong.yaml` — NOT yet created (empty directory); must be created before `docker compose up`
- ⚠️ MCP integration tests not yet run against live stack (query service not yet started in Docker)
- ⚠️ Decision: defer Kong AI/MCP proxy plugins (`ai-mcp-proxy`) — get core stack working first

### Spec #4 — MCP Server (branch 001-mcp-server, ready for PR)
- [x] Full speckit workflow: specify → plan → tasks → analyze → implement
- [x] `specs/001-mcp-server/` — spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md, tasks.md
- [x] `mcp/src/config.ts` — fail-fast env var validation
- [x] `mcp/src/clients/` — FastApiClient, QdrantClientWrapper, Neo4jClient
- [x] `mcp/src/tools/` — all 7 tools: ingest, query, search_concepts, add_relationship, list_notebooks, get_document_graph, audio_overview
- [x] `mcp/src/server.ts` + `mcp/src/index.ts` — dual transport (stdio + SSE)
- [x] 17 test suites: 11 unit + 6 contract; **72/72 tests green in 0.92s**
- [x] `mcp/Dockerfile` + `.dockerignore`
- ⚠️ docker-compose.yml service (T043) NOT done — needs integration with live services
- ⚠️ Integration tests (T020, T025, T034, T039, T040) — require live services; deferred

### Spec #3 — Query Service (merged to dev, PR #6)
- [x] `query/config.py` — fail-fast env var validation
- [x] `query/models.py` — Pydantic v2: QueryRequest, QueryResponse, Citation, etc.
- [x] `query/rag.py` — embed via Kong + Qdrant vector search (notebook-scoped)
- [x] `query/graph.py` — concept extraction via Kong + Neo4j traversal (1–2 hops)
- [x] `query/hybrid.py` — merge + re-rank: (qdrant×0.6) + (1/hop×0.4)
- [x] `query/main.py` — FastAPI: /health, /query, /collections, /graph/{title}, /graph/relationship
- [x] `query/Dockerfile` + `query/requirements.txt`
- [x] `docker-compose.yml` — query service uncommented with healthcheck
- [x] `query/tests/unit/` — 30 unit tests green
- [x] `query/tests/integration/test_query_endpoint.py` — 8 integration tests green
- [x] **59/59 tests green** (30 unit + 29 integration; 8 n8n skipped — expected)
- [x] GitHub Issue #5 created, PR #6 merged → dev

---

## In Progress

Nothing in progress.

---

## Backlog (prioritized)

### SPEC WRITING FIRST — create GitHub Issues before any implementation

**~~Spec #4 — MCP Server~~** (beads: plaudeLM-lk7 CLOSED ✅ — see Completed above)
**~~Spec #6 — Full Test Suite~~** (CLOSED ✅ — see Completed above)

**Spec #5 — Kong MCP Gateway Route** (beads: plaudeLM-y0x, P2 — branch 002-kong-mcp-gateway)
- Spec, plan, research written ✅
- Remaining: create `kong/kong.yaml`, run `docker compose up -d query notebooklm-mcp`, run MCP integration tests
- Decision: defer `ai-mcp-proxy` plugin until core stack is verified working; use standard Kong proxying first
- Acceptance: tool call via Kong SSE returns same result as stdio; all integration tests green

**Spec #7 — Audio Overview** (beads: plaudeLM-69j, P3)
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
| 2026-03-07 | CHAT_ENDPOINT / EMBED_ENDPOINT env vars in n8n | Decouples n8n from Kong during dev; set to Ollama direct until Kong is layered in (Spec #5) |
| 2026-03-07 | NODE_FUNCTION_ALLOW_BUILTIN=crypto in docker-compose.yml | n8n 1.90.2 task runner sandbox blocks all Node.js builtins; must explicitly allow crypto for randomUUID() |
| 2026-03-07 | n8n Code node sandbox API (task runner) | $env['KEY'] not process.env; helpers.httpRequest() not $helpers; runOnceForEachItem returns {json:...}; crypto global not exposed |
| 2026-03-07 | n8n owner setup: POST /rest/owner/setup {email, firstName, lastName, password (≥8 chars, ≥1 uppercase)} | Login field is emailOrLdapLoginId. Owner must exist before Code nodes execute. |
| 2026-03-07 | Kong not deployed until core stack is stable | User decision: get neo4j+qdrant+ollama+n8n working first; add Kong as Spec #5 |
| 2026-03-07 | jest.config.cjs (not .ts or .js) required when package.json has `"type": "module"` | ESM package breaks jest.config.ts bootstrap; .cjs forces CommonJS for jest config only |
| 2026-03-07 | tsconfig.test.json with `"module": "CommonJS"` + `"isolatedModules": true` | CJS enables jest.mock() hoisting; isolatedModules avoids ts-jest loading full SDK type graph (OOM fix) |
| 2026-03-07 | ts-jest `diagnostics: false` required for test mocks | @types/jest `ResolvedValue<T>` = `never` when T not PromiseLike; disabling diagnostics unblocks mock typing |
| 2026-03-07 | jest.mock() with `__esModule: true` required for ESM default imports | Without flag, TypeScript's __importDefault wraps the mock object again, causing double-nesting |
| 2026-03-07 | `beforeAll` (not `beforeEach`) for dynamic import + module registration | resetModules() + dynamic import in beforeEach causes ts-jest to recompile full dep tree per test → OOM |
| 2026-03-07 | Ollama healthcheck uses TCP not curl | Ollama image has no curl; use bash TCP check |
| 2026-03-07 | N8N_SECURE_COOKIE=false for local dev | n8n requires HTTPS for secure cookies; HTTP-only local dev needs this off |
| 2026-03-07 | N8N_RUNNERS_ENABLED=true required | n8n 1.90.2 needs task runners for Code nodes to execute; without it, Code nodes silently skip |
| 2026-03-07 | query service uses TestClient (not live server) for integration tests | FastAPI TestClient exercises real Qdrant+Neo4j without needing a running HTTP server |
| 2026-03-07 | pythonpath=["."] required in pyproject.toml | pytest with unit __init__.py does not auto-add rootdir to sys.path; must be explicit |
| 2026-03-07 | module-scoped pytest fixtures cannot use function-scoped monkeypatch | Use os.environ.setdefault() in module-scoped fixtures; monkeypatch only in function-scoped tests |
| 2026-03-07 | /query endpoint gracefully degrades on Kong/Ollama failure | Returns empty results rather than 502 when embedding/graph calls fail; only answer-generation step raises 502 |
| 2026-03-08 | query host port changed from 8000 to 8081 in docker-compose | Kong proxy also uses host port 8000; conflict prevents both from starting; MCP server uses internal Docker network URL (http://query:8000), no change to env vars |
| 2026-03-08 | kong/kong.yaml (not kong/kong-ollama.yaml) is the required filename | docker-compose mounts ./kong:/kong/declarative and KONG_DECLARATIVE_CONFIG references kong.yaml; the kong-ollama.yaml name in earlier notes was never the actual filename |
| 2026-03-08 | Kong AI/MCP proxy plugins deferred | User decision: get core stack (query + MCP server + basic Kong routing) working end-to-end before adding ai-mcp-proxy, ai-rate-limiting-advanced, ai-pii-sanitizer plugins |
| 2026-03-08 | MCP SSE uses two HTTP paths | GET /sse (SSE connection) + POST /messages?sessionId=X (client→server); both must be routed by Kong; health at GET /health |
| 2026-03-08 | Kong DB-less mode: config reload via POST /config | Edit kong/kong.yaml → curl -sX POST http://localhost:8001/config -F config=@kong/kong.yaml; deck validate for syntax; deck sync is ephemeral for DB-less Kong |
| 2026-03-08 | query/venv required for local pytest | No system-level pytest; create venv + install requirements.txt + requirements-dev.txt before running pytest on host |

---

## Known Issues / Watch Out For

- **n8n import creates duplicates** — `n8n import:workflow` always creates a new workflow (new ID). After each import, activate new, deactivate + delete old via REST API.
- **Qdrant client version mismatch** — host has qdrant-client 1.17.0 but server is 1.13.5. Tests pass; suppress with `check_compatibility=False` if needed. Pin to ~1.13.0 in venv.
- **llama3.2 and nomic-embed-text not pre-pulled** — models must be pulled manually before ingest pipeline LLM steps work. Summarize/Extract nodes silently degrade (empty output) when unavailable — intentional fallback.
- **Qdrant point IDs** — fixed in Spec #2 workflow (crypto.randomUUID()). Verified green in Spec #2 integration tests.
- **llama3.2 JSON reliability** — graph extraction prompt may produce malformed JSON on edge cases. Retry + JSON validation in n8n Code node; fallback to empty arrays.
- **llama3.2 CPU speed** — ~5-10 tok/s on CPU. For /query, cap `max_tokens: 512` to keep latency reasonable.
- **Neo4j Community Edition** — no multiple databases. All notebooks share one database, scoped by node properties. Fine for this design.
- **Neo4j auth rate limiting** — too many wrong-password attempts triggers temporary lockout. Password is `changeme` (from .env). Check `.env` before running integration tests.
- **Neo4j memory** — tune `NEO4J_server_memory_heap_max__size` and `pagecache_size` in docker-compose for home lab. Start with 1G heap, 512M pagecache.
- **Google Drive ingest** — requires Google OAuth 2.0 app. Set up at console.cloud.google.com; credentials in `.env` and n8n Credentials UI.
- **PDF ingest via n8n** — requires multipart/form-data (binary), not JSON. Document in MCP `ingest_document` error messages.
- **MCP transport switching** — when `MCP_TRANSPORT=sse`, stdio handler must not be initialized. Validate at startup in `config.ts`.
- **Kong MCP Gateway** — `ai-mcp-proxy` plugin config needs to match the MCP server's SSE endpoint path exactly. Test with `deck diff` before `deck sync`.
- **mcp/ exists** — Spec #4 complete. `npm test` runs 72 unit+contract tests. Integration + e2e tests in PR #8 (001-mcp-server); run `npm run test:integration` and `npm run test:e2e` once services are live.
- **tests/e2e/ exists** — on `001-mcp-server` branch (PR #8); will be on `dev` after merge. Not yet on `002-kong-mcp-gateway` — rebase after PR #8 merges.
- **kong/ directory is empty** — `kong/kong.yaml` must be created before `docker compose up` (Kong will fail to start without it). File must be at `kong/kong.yaml` (not `kong-ollama.yaml`).
- **query service not yet running in Docker** — start with `docker compose up -d query` after creating `kong/kong.yaml`. Host port is now 8081 (was 8000).
- **notebooklm-mcp service added to docker-compose.yml** — uncommented on `002-kong-mcp-gateway`; defaults to `MCP_TRANSPORT=sse`. For local Claude Desktop (stdio), run the MCP server directly with `MCP_TRANSPORT=stdio node dist/index.js`.
- **audio_overview FastAPI `/audio-overview` endpoint not implemented** — Spec #7. The MCP tool exists and delegates to FastAPI; the FastAPI side is not yet built.
- **query/venv** — must be created locally before running pytest: `python3 -m venv venv && ./venv/bin/pip install -r requirements.txt -r requirements-dev.txt`
- **Stale branches cleaned** — deleted: feat/1-neo4j-infrastructure, feat/3-n8n-graph-extraction, feat/5-query-service, feat/7-mcp-server, spec/1-neo4j-infrastructure (all fully merged to dev)

---

## Session Notes

### 2026-03-08 — Spec #5 spec/plan + stack prep session
- Ran speckit.analyze on 001-mcp-server: 10 findings, no blockers, all artifact-level (not implementation)
- Committed Spec #6 integration + e2e tests on 001-mcp-server (c81e0f5); opened PR #8
- Cleaned up 5 stale local branches + 3 remote branches (all fully merged to dev)
- Created 002-kong-mcp-gateway branch; wrote spec.md, plan.md, research.md
- Key discovery: kong/ directory was empty — kong.yaml was never created; must create before Kong starts
- Key discovery: query and kong both had 8000:8000 host port binding — fixed in docker-compose (query → 8081:8000)
- Uncommented notebooklm-mcp service in docker-compose.yml (SSE mode, depends_on query)
- User decision: defer ai-mcp-proxy plugin; get core stack working first
- Test runs: 72/72 MCP unit+contract ✅; 30/30 query unit ✅; 29/29 query integration ✅
- Session ended before `docker compose up` — that's next session's starting point
- NOT merged: 002 branch not pushed yet; PR #8 not yet merged

### 2026-03-07 — Spec #4 MCP Server implementation
- Full speckit workflow (specify → plan → tasks → analyze → implement) run for first time
- speckit.analyze caught critical: Out of Scope incorrectly excluded contract+integration tests — fixed before implementing
- Implemented all 7 MCP tools, 3 clients, dual transport, fail-fast config, Dockerfile
- Major Jest/TypeScript fixes: ESM→CJS, jest.config.cjs, tsconfig.test.json, diagnostics:false, isolatedModules:true
- Neo4j mock fix: added `__esModule: true` to mock factory for default import
- concepts.test.ts OOM fix: moved import from `beforeEach` to `beforeAll` (ts-jest recompile per test = OOM)
- Final: 17/17 suites, 72/72 tests, 0.92s; production build clean
- beads plaudeLM-lk7 CLOSED
- 2 commits on `001-mcp-server`: specs artifacts + mcp implementation

### 2026-03-07 — Spec #3 + merge session
- PR #4 opened for feat/3-n8n-graph-extraction → dev
- GitHub Issue #5 created for Spec #3 (Query Service)
- Branch feat/5-query-service created (rebased onto feat/3-n8n-graph-extraction)
- Red phase: 30 unit + 8 integration tests committed — all failing (ModuleNotFoundError)
- Green phase: config.py, models.py, rag.py, graph.py, hybrid.py, main.py, Dockerfile, requirements.txt
- Fixed 2 test issues: mock scope (MagicMock→AsyncMock for driver.close), lowercase concept normalization
- Fixed integration test scope mismatch (module-scoped fixture + function-scoped monkeypatch)
- 59/59 tests green; 8 n8n tests skipped (n8n webhook not running — expected)
- All three PRs (#2, #4, #6) merged to dev; merge conflicts resolved by taking feat/5 versions throughout
- bd ready output: plaudeLM-lk7 (Spec #4 MCP Server, P1) and plaudeLM-69j (Spec #7 Audio, P3) unblocked

### 2026-03-07 — Spec #1 implementation session
- Repo initialized, pushed to GitHub (public), branch protection on main, dev branch created
- Spec #1 written: GitHub Issue #1, docs/specs/SPEC-001-neo4j-infrastructure.md
- Red phase: 21 failing integration tests committed
- Green phase: docker-compose.yml, .env.example, init-neo4j.py, init-qdrant.py implemented
- Fixed: Neo4j pagecache env var (single not double underscore), Qdrant healthcheck (bash TCP — no curl in image)
- Pinned qdrant-client~=1.13.0 to match server v1.13.5; pinned image to qdrant/qdrant:v1.13.5
- 21/21 integration tests green, PR #2 open feat/1-neo4j-infrastructure → dev
- IMPORTANT: never use --remove-orphans flag; it stops containers from other compose projects

### 2026-03-07 — Spec #2 green phase completion
- Unblocked n8n owner setup: POST /rest/owner/setup, correct body fields discovered from source
- Found and fixed 5 Code node sandbox bugs (crypto, process.env, $helpers, return shape, kongUrl)
- Added NODE_FUNCTION_ALLOW_BUILTIN=crypto to docker-compose.yml; restarted n8n
- Ollama models pulled: nomic-embed-text (274MB), llama3.2 (2.0GB)
- 8/8 Spec #2 integration tests green; 21/21 Spec #1 tests still green (no regression)
- IMPORTANT: never use --remove-orphans flag; stops containers from other compose projects
