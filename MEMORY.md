# MEMORY.md — plaudeLM

> Read this file at the start of every Claude Code session before doing any work.
> Update this file at the end of every session — mark completions, add decisions, log issues.
> Also read CONSTITUTION.md and ARCHITECTURE.md before starting any task.

---

## Current Status

**Phase:** Spec #7 (Audio Overview) — IN PROGRESS 🔄 on branch `010-audio-overview`. Python implementation + 43 unit tests green. MCP integration test written but not yet executed against live stack. Docker rebuild (T017) and MCP integration test verification (T022) remain.
**Last updated:** 2026-03-09
**Next action:** T017 — `docker compose build --no-cache query && docker compose up -d query`; T019/T022 — run MCP audio integration test against live stack; Phase 6 polish (mypy, black/ruff, full suite); open PR.

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
  - `/plaudelm/embed` → Ollama nomic-embed-text (ai-proxy, http-log)
  - `/plaudelm/chat` → Ollama llama3.2 (ai-proxy, ai-rate-limiting-advanced, ai-pii-sanitizer, http-log)
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

### Spec #5 — Kong MCP Gateway (CLOSED ✅ — 2026-03-09, branch 002-kong-mcp-gateway)
- [x] `specs/002-kong-mcp-gateway/` — spec.md, plan.md, research.md, tasks.md, quickstart.md
- [x] `kong/api-gateway/deck/kong.yaml` — IaC from `deck dump`; plaudelm-mcp + plaudelm-chat + plaudelm-embed services; ai-mcp-proxy (passthrough-listener) + key-auth on MCP service; synced to Konnect
- [x] `mcp/tests/integration/tools/kong-mcp.test.ts` — 5 integration tests; **5/5 green** including T4-3 (live list_notebooks call at 134ms)
- [x] `.env.example` — KONG_MCP_API_KEY documented; KONG_PROXY_URL host-override note; CHAT/EMBED_ENDPOINT updated to Kong routes
- [x] Cold-start verified; restart policy verified (crash-restart via PID kill)
- [x] `specs/002-kong-mcp-gateway/quickstart.md` — Claude Desktop + Claude Code config + curl verification steps

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

**~~Spec #5 — Kong MCP Gateway~~** (CLOSED ✅ — see Completed above)

**Spec #7 — Audio Overview** (beads: plaudeLM-69j, P3) — IN PROGRESS on `010-audio-overview`
- [x] GitHub Issue #10 created; spec/plan/research/data-model/contracts/quickstart/tasks committed
- [x] `query/audio.py` — AudioGenerator: embed→Qdrant→LLM script→pyttsx3 TTS WAV
- [x] `query/models.py` — AudioOverviewRequest, AudioOverviewResponse
- [x] `query/config.py` — AUDIO_OUTPUT_DIR env var + mkdir at startup
- [x] `query/main.py` — POST /audio-overview endpoint
- [x] `query/Dockerfile` — espeak-ng + libespeak-ng1 apt packages
- [x] `docker-compose.yml` — audio_data volume + AUDIO_OUTPUT_DIR env
- [x] `query/tests/unit/test_audio.py` — 13 unit tests, **13/13 green**
- [x] `query/tests/integration/test_audio_endpoint.py` — 5 integration tests (require live stack)
- [x] `mcp/tests/integration/tools/audio.integration.test.ts` — written, not yet run
- [ ] T017 — `docker compose build --no-cache query && docker compose up -d query`
- [ ] T022 — verify MCP audio integration test against live stack
- [ ] Phase 6 — mypy, black/ruff, full test suite, PR

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

**Spec #8 — Cowork Integration** (P3, after Spec #5 complete)
- All clients (Desktop, Code, claude.ai, Cowork) route through Kong SSE — no stdio bypass
- Folder convention: `~/plaudelm-inbox/{kong,personal,music}/` — drop files here
- Cowork scheduled task: scan inbox subfolders → call `ingest_document` per file → move to `processed/`
- PDF gap: Cowork must read + pass content inline (markdown/text) or serve file as local URL; base64 for PDFs TBD
- Claude Desktop config: `{"url": "http://localhost:8000/plaudelm/mcp/sse", "headers": {"apikey": "..."}}`
- Tasks to write:
  - [ ] Cowork task template: inbox folder scan → `ingest_document` per file (scheduled)
  - [ ] Cowork task template: run notebook query via MCP tool
  - [ ] Cowork task template: graph concept review session
  - [ ] Claude Desktop `claude_desktop_config.json` snippet (SSE via Kong) — also covers T020

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
| 2026-03-09 | Kong is Konnect-managed — no local admin API | Data plane only; config applied via `deck sync --konnect-control-plane-name plaudelm kong/api-gateway/deck/kong.yaml`; `deck diff` for drift check; no `curl localhost:8001` |
| 2026-03-09 | kong.yaml IaC path is `kong/api-gateway/deck/kong.yaml` | Produced by `deck dump`; not `kong/kong.yaml` — all doc references updated |
| 2026-03-09 | `docker compose kill` marks container as manually stopped — `unless-stopped` does NOT restart | Use `docker exec <container> kill -9 1` to simulate a real crash and verify restart policy |
| 2026-03-09 | `KONG_PROXY_URL=http://kong:8000` in .env is the internal Docker network URL | Running integration tests from the host requires `KONG_PROXY_URL=http://localhost:8000` override — Docker DNS name `kong` is not resolvable outside the container network |
| 2026-03-09 | MCP transport is Streamable HTTP (single POST /mcp), not legacy SSE | Kong route: single `/plaudelm/mcp` route with GET/POST/DELETE; strip_path:true → upstream receives POST /; `Accept: application/json, text/event-stream` required |
| 2026-03-07 | MCP client.callTool() returns {isError:true, content:[...]} for tool errors, does NOT throw | tool-level McpError goes through MCP protocol as error result; use result.isError not rejects.toThrow() in integration/e2e tests |
| 2026-03-07 | e2e tests live in tests/e2e/ but compile via mcp/jest.config.cjs e2e project | roots: ['<rootDir>/../tests/e2e'] in jest project config; tsconfig.test.json include extended with ../tests/e2e/**/* |
| 2026-03-07 | Neo4j driver connection pool keeps Jest alive after tests — use --forceExit | Added to test:integration, test:e2e, test:all npm scripts; not a test failure |
| 2026-03-07 | search_concepts requires conceptNameIndex full-text index in Neo4j | Run scripts/init-neo4j.py before integration tests; integration tests warn and skip gracefully if index missing |
| 2026-03-08 | query/venv required for local pytest | No system-level pytest; create venv + install requirements.txt + requirements-dev.txt before running pytest on host |
| 2026-03-08 | Kong MCP route requires two entries with strip_path:true | MCP SSE protocol uses GET /sse + POST /messages; a single prefix route with strip_path:false forwards the full Kong path to upstream — MCP server returns 404; must use two routes each with strip_path:true so upstream receives /sse and /messages |
| 2026-03-08 | deck validate must precede POST /config apply | validate is a syntax check that runs without a live Kong instance; running apply first defeats the safety check; workflow: edit → validate → apply → diff |
| 2026-03-08 | http-log plugin requires a live HTTP endpoint at config-apply time | Kong rejects kong.yaml if http_endpoint is unreachable; for local dev: use go-httpbin (mccutchen/go-httpbin) as log sink or substitute file-log to /dev/stdout |
| 2026-03-08 | Global rename: notebooklm → plaudelm | All container names, volumes, network, Kong routes, Neo4j constraints, n8n webhook, package name, server name updated across 28 files |
| 2026-03-08 | plaudelm-network explicit Docker network | Named bridge network added to docker-compose.yml; all 7 services use it; name stable regardless of compose invocation directory |
| 2026-03-08 | MCP server does not need OLLAMA_BASE_URL or KONG_PROXY_URL | MCP server only calls FastAPI, Qdrant, Neo4j, n8n — never Ollama or Kong directly; removed from config.ts |
| 2026-03-08 | mcp/.dockerignore must NOT exclude tsconfig.json | Builder stage runs npm run build which requires tsconfig.json; excluding it breaks the Docker build |
| 2026-03-08 | MCP_TRANSPORT=stdio in .env causes container to exit cleanly | stdio mode exits when stdin closes; container must have MCP_TRANSPORT=sse in .env for Docker |
| 2026-03-08 | n8n healthcheck uses wget not curl | curl not available in n8n image; healthcheck must use wget -qO- |
| 2026-03-08 | Konnect data plane: ai-proxy-advanced has no native ollama provider | Use provider: llama2 + llama2_format: ollama + upstream_url for Ollama; service host URL is a placeholder (never called) |
| 2026-03-08 | ai-mcp-proxy mode for existing MCP server is passthrough-listener | passthrough-listener proxies all MCP traffic to upstream; conversion-listener is for wrapping HTTP APIs as MCP tools |
| 2026-03-08 | Kong AI RAG Injector not suitable for plaudeLM | Supports only Redis/pgvector (not Qdrant) and cloud embedding providers (not Ollama); GraphRAG hybrid logic stays in FastAPI |
| 2026-03-08 | All Claude clients route through Kong SSE — no stdio bypass | Desktop, Code, claude.ai, Cowork all connect to http://localhost:8000/plaudelm/mcp/sse with apikey header |
| 2026-03-08 | api-gw.env and kong/api-gateway/cert/ added to .gitignore | Contain Konnect credentials and cluster cert — must never be committed |
| 2026-03-08 | Konnect data plane cert PEM footer truncation | tls.crt had -----END CERTIFICATE---- (4 dashes, not 5); Kong fails to parse; fix with sed or text editor |
| 2026-03-08 | MCP transport upgraded from SSE to Streamable HTTP | SSEServerTransport is legacy/deprecated; StreamableHTTPServerTransport is the current MCP standard; single POST endpoint replaces GET /sse + POST /messages; Claude clients default to Streamable HTTP |
| 2026-03-08 | ai-mcp-proxy config: server.timeout and server.forward_client_headers are nested | Not top-level fields; timeout default is 10000ms (too short for Ollama); set server.timeout: 120000 |
| 2026-03-08 | Kong route strip_path:true with /plaudelm/mcp → upstream receives POST / | Server must handle path === "/" as MCP endpoint; also handles "/mcp" for direct access |
| 2026-03-08 | Kong consumer has credential type, not plugin | key-auth plugin goes on the service; consumer only gets a key-auth credential (the API key value) |
| 2026-03-08 | Streamable HTTP server uses Transport cast | exactOptionalPropertyTypes:true makes StreamableHTTPServerTransport incompatible with Transport interface at onclose; fix with `transport as Transport` (not as unknown as) |
| 2026-03-08 | Ollama removed — replaced with Azure OpenAI via Kong | llama3.2 CPU too slow; switched to gpt-4o-mini (chat) + text-embedding-3-large (embeddings); Ollama removed from docker-compose.yml entirely |
| 2026-03-08 | Qdrant collections recreated at 3072 dimensions | text-embedding-3-large outputs 3072-dim; old 768-dim collections (nomic-embed-text) deleted and recreated |
| 2026-03-08 | n8n workflow must NOT send model field to Kong | ai-proxy-advanced controls the model; sending model in request body triggers "cannot use own model" validation error; removed from all Code nodes |
| 2026-03-09 | n8n workflow must NOT send options field to Azure OpenAI via Kong | options: {temperature} is Ollama syntax; Azure OpenAI rejects it with 400 "Unrecognized request argument: options"; use top-level temperature or omit (let Kong default); silent catch in Extract Graph Entities swallowed this error causing 0 concepts in Neo4j |
| 2026-03-08 | ai-proxy-advanced embeddings use targets not embeddings config | top-level embeddings config is for RAG vector lookups; proxying embed requests requires targets array with route_type: llm/v1/embeddings |
| 2026-03-08 | Kong ai-proxy-advanced no addresses = empty targets array | round-robin balancer needs at least one target; configure Azure endpoint in targets not embeddings section |
| 2026-03-09 | setup-n8n.sh upsert pattern: GET by name → PATCH if exists, POST if not → PATCH active | POST /rest/workflows always creates a new ID regardless; must check by name first and use PATCH /rest/workflows/{id} with full workflow JSON to update in-place (PUT returns 404 on /rest/). Public API PUT /api/v1/workflows/{id} exists but requires X-N8N-API-KEY not in this project. |
| 2026-03-09 | init scripts are required stack prerequisites, not optional | init-neo4j.py creates conceptNameIndex fulltext index; without it search_concepts fails at runtime; init-qdrant.py creates collections; must run both after fresh volume creation |
| 2026-03-09 | catch blocks must surface original error message verbatim | generic "X unavailable" messages hide root cause; pattern: `const msg = err instanceof Error ? err.message : String(err); throw new McpError(..., \`context: ${msg}\`)` |
| 2026-03-09 | MCP SDK Server is single-connection per instance | createServer() must be called per initialize request in Streamable HTTP mode, not once at startup; second connect() call on same instance throws "Already connected to a transport" |
| 2026-03-09 | Streamable HTTP requires Accept: application/json, text/event-stream | SDK returns 406 Not Acceptable without this header; all MCP clients (Insomnia, curl, Claude) must send it |
| 2026-03-09 | Neo4j JS driver sends JS number as float64 — LIMIT/SKIP require neo4j.int() | JS number type is always float; Neo4j rejects 10.0 in LIMIT clause; wrap all integer Cypher params with neo4j.int(value) from neo4j-driver |
| 2026-03-09 | TTS uses pyttsx3 + espeak-ng (local, CPU-only) | Coqui TTS rejected (500MB+, CUDA dep); gTTS rejected (requires internet); pyttsx3+espeak-ng is ~5MB apt, headless-compatible, no GPU; quality is robotic — piper-tts is the planned upgrade |
| 2026-03-09 | pyttsx3 blocks event loop — wrap in run_in_executor | pyttsx3.init() + runAndWait() are synchronous; must use asyncio.get_event_loop().run_in_executor(None, _run_tts) to avoid blocking the async FastAPI worker |
| 2026-03-09 | AUDIO_OUTPUT_DIR volume mount pattern | audio_data Docker named volume mounted at /data/audio; Config.__init__ calls os.makedirs(exist_ok=True) — Docker volume may not pre-create subdirs |
| 2026-03-09 | speckit branch naming requires NNN-feature-name format | check_feature_branch() enforces ^[0-9]{3}- regex; feat/NNN-slug fails; use 010-audio-overview not feat/10-audio-overview |

---

## Known Issues / Watch Out For

- **CRITICAL: init scripts must be run before the stack is usable** — `scripts/init-neo4j.py` creates the `conceptNameIndex` fulltext index that `search_concepts` requires. If it hasn't been run, every `search_concepts` call fails. Same for `init-qdrant.py` (collections). Run both after every fresh Neo4j/Qdrant volume creation. See CONSTITUTION.md IV-B.3.
- **CRITICAL: never swallow exceptions with a generic message** — catch blocks must include `err.message` in the thrown error. Generic "X unavailable" messages hide root cause and force guessing. See CONSTITUTION.md IV-B.2.
- **CRITICAL: look up official docs before touching any component** — do not assume API shapes, index names, default behaviors, or query syntax. Fetch current docs for Neo4j, Qdrant, Kong, n8n, MCP SDK before writing or debugging code that touches them. See CONSTITUTION.md IV-B.1.
- **MCP server creates one Server instance per session (not shared)** — `createServer()` + `registerTools()` must be called inside the `isInitializeRequest` branch, not once at startup. The MCP SDK Server only supports one active connection per instance. Fixed in index.ts on 2026-03-09.



- **Azure OpenAI deployment name must match exactly** — `deployment_id` in Konnect ai-proxy-advanced plugin is case-sensitive; copy verbatim from Azure OpenAI Studio → Deployments.
- **n8n workflow re-import required after any Code node change** — edit the JSON, delete old workflow via REST API, import new, activate. Use setup-n8n.sh pattern or do manually via API.
- **CRITICAL: Any credentials created via one-off curl/API calls MUST be saved to .env.example immediately** — n8n owner password was lost because it was only sent as a curl and never persisted. Use `scripts/setup-n8n.sh` which reads from .env. Never create credentials interactively without saving them.

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
- **Kong MCP route is a single entry** — Streamable HTTP uses one route `/plaudelm/mcp` (GET/POST/DELETE, strip_path:true); legacy SSE two-route pattern (GET /sse + POST /messages) is obsolete.
- **Kong RAG Injector not usable** — only supports Redis/pgvector and cloud embedding providers; not compatible with Qdrant + Azure OpenAI via Kong.
- **`docker compose kill` suppresses restart** — to test `restart: unless-stopped`, kill PID 1 inside the container: `docker exec plaudelm-mcp kill -9 1`.
- **plaudelm-mcp running in SSE mode** — MCP_TRANSPORT=sse in .env; all clients connect via Kong. For local stdio debugging: `MCP_TRANSPORT=stdio node dist/index.js` outside Docker.
- **audio_overview endpoint implemented but Docker rebuild required** — `query/audio.py` + `POST /audio-overview` implemented; pyttsx3 added to requirements.txt; espeak-ng added to Dockerfile. Must run `docker compose build --no-cache query` before the container has TTS capability. WAV synthesis will fail in the old container.
- **search_concepts uses Lucene fulltext tokenization** — query on individual words only. "rate limiting" or "rate" works; "ratelimiting" (concatenated) returns 0 results. Index tokenizes on whitespace and hyphens.
- **query/venv** — must be created locally before running pytest: `python3 -m venv venv && ./venv/bin/pip install -r requirements.txt -r requirements-dev.txt`
- **Stale branches cleaned** — deleted: feat/1-neo4j-infrastructure, feat/3-n8n-graph-extraction, feat/5-query-service, feat/7-mcp-server, spec/1-neo4j-infrastructure (all fully merged to dev)

---

## Session Notes

### 2026-03-09 — Spec #7 Audio Overview — implementation session

- GitHub Issue #10 created for Spec #7 Audio Overview
- Full speckit workflow: specify → plan → tasks (via speckit.plan + speckit.tasks skills)
- spec artifacts committed: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md, tasks.md
- Branch renamed from feat/10-audio-overview → 010-audio-overview (speckit requires NNN- prefix)
- Phase 1 (Setup): .env.example, docker-compose.yml, requirements.txt, Dockerfile — all done
- Phase 2 (Foundational): AudioOverviewRequest/Response models, AUDIO_OUTPUT_DIR config, main.py imports — all done
- Phase 3+4 (US1+US2): AudioGenerator fully implemented (embed→Qdrant→LLM→TTS), POST /audio-overview endpoint
- TDD: 13 unit tests written first (red: ModuleNotFoundError), pyttsx3 installed, 13/13 green
- TTS: pyttsx3 + espeak-ng; pyttsx3.runAndWait() wrapped in run_in_executor to avoid blocking event loop
- 43/43 Python unit tests green; 73/73 MCP unit+contract tests green; 0 regression
- T017 (Docker rebuild) and T022 (MCP integration test vs live stack) deferred — require running container
- MCP integration test written: mcp/tests/integration/tools/audio.integration.test.ts
- 3 atomic commits pushed to origin/010-audio-overview
- bd ready shows: plaudeLM-y0x (Spec #5 Kong MCP Gateway Route) — P2, unblocked

### 2026-03-09 — Spec #5 Kong MCP Gateway closed
- deck dump → `kong/api-gateway/deck/kong.yaml`; IaC confirmed (plaudelm-mcp, plaudelm-chat, plaudelm-embed services)
- All docs updated: admin API / DB-less references replaced with Konnect deck sync throughout CLAUDE.md, ARCHITECTURE.md, spec.md, tasks.md
- `mcp/tests/integration/tools/kong-mcp.test.ts` — 5/5 green (Streamable HTTP transport, not legacy SSE)
- T4-1/T4-4 (auth rejection) ✅; T4-2 (session init) ✅; T4-3 (live list_notebooks via Kong at 134ms) ✅; T4-5 (Kong proxy headers) ✅
- Cold-start verified; crash-restart verified (PID kill); `docker compose kill` does NOT trigger restart
- T013 (deck validate) + T014 (deck sync) done by Paul
- quickstart.md created; MEMORY.md closed out; all 21 tasks done or marked N/A

### 2026-03-09 — End-to-end ingest + MCP tool debug session
- Fixed n8n respondToWebhook double-encoding (JSON.stringify → object literal)
- Fixed Extract Graph Entities: `options:{temperature}` is Ollama syntax, Azure returns 400, catch swallowed it → 0 concepts; removed options field
- Fixed ingest.ts swallowed catch (CONSTITUTION IV-B.2); shape-mismatch error now shows actual response
- Fixed setup-n8n.sh: PATCH upsert (PUT returns 404 on /rest/); deduplication added (find all matches, patch first, delete rest)
- Added CONSTITUTION IV.5: docker builds must always use --no-cache
- Confirmed working tools: ingest_document ✅, search_concepts ✅, get_document_graph ✅, list_notebooks ✅, query ✅
- audio_overview: not implemented (Spec #7, FastAPI side missing — expected 404)
- search_concepts uses Lucene tokenization — query must be individual words not concatenated (e.g. "rate" not "ratelimiting")
- 73/73 MCP tests green + 30/30 query unit tests green; committed 8a68be5

### 2026-03-08 — Spec #5 Azure migration + ingest pipeline debug session
- Replaced Ollama with Azure OpenAI: gpt-4o-mini (chat) + text-embedding-3-large (embeddings)
- Removed ollama service + depends_on from docker-compose.yml entirely
- Upgraded MCP transport: SSEServerTransport → StreamableHTTPServerTransport (single POST /mcp endpoint)
- Fixed ingest_document tool: was calling FastAPI /ingest (doesn't exist) → now calls n8n webhook directly
- Fixed n8n workflow: removed hardcoded model names from all Code nodes (Kong controls model)
- Qdrant collections recreated: 768-dim → 3072-dim (text-embedding-3-large)
- ai-proxy-advanced embed config: moved from embeddings section → targets with route_type: llm/v1/embeddings
- scripts/setup-n8n.sh written: idempotent owner setup + workflow import + activation from .env
- Added N8N_OWNER_EMAIL/FIRSTNAME/LASTNAME/PASSWORD and KONG_MCP_API_KEY to .env.example
- Kong route: strip_path:true, single POST/GET/DELETE /plaudelm/mcp route
- n8n workflow re-imported with updated Code nodes (workflow ID: EBnvjaTW2hLDCarr)
- Status at session end: ingest_document pending final test with Azure models

### 2026-03-08 — Spec #5 stack bring-up + global rename session
- Global rename notebooklm → plaudelm across 28 files (container names, volumes, network, routes, constraints, package name, docs)
- docker-compose.yml: added plaudelm-network, fixed n8n healthcheck (wget), fixed MCP env vars
- mcp/src/config.ts: removed OLLAMA_BASE_URL + KONG_PROXY_URL (MCP server never calls those directly)
- mcp/.dockerignore: removed tsconfig.json exclusion (broke Docker build)
- .gitignore: added api-gw.env + kong/api-gateway/cert/ to prevent secret commits
- Stack fully running: kong ✅, query ✅, plaudelm-mcp ✅, n8n ✅, neo4j ✅, qdrant ✅, ollama ✅
- Root causes fixed: MCP_TRANSPORT=stdio in .env (exit 0), QUERY_SERVICE_URL wrong port (8080→8000), n8n no curl, Kong cert missing trailing dash
- Konnect architecture confirmed: cloud control plane + local Docker data plane on plaudelm-network
- ai-proxy-advanced: no native ollama provider — use llama2 + llama2_format:ollama + upstream_url
- ai-mcp-proxy mode: passthrough-listener for proxying to existing MCP server
- Kong AI RAG Injector evaluated: not suitable (no Qdrant, no Ollama embeddings)
- All clients (Desktop, Code, claude.ai, Cowork) will connect via Kong SSE — no stdio bypass
- docs/kong-config-reference.md created — full Konnect config reference
- Spec #8 (Cowork Integration) added to backlog with folder convention + task templates
- Tests: 72/72 MCP unit+contract ✅; 30/30 query unit ✅
- Commit: 5d527f6 on 002-kong-mcp-gateway; pushed to origin
- Next: Paul completes Konnect config → dump kong.yaml → decide embed route → T004 integration tests

### 2026-03-08 — Spec #5 tasks.md + speckit.analyze remediation session
- Merged PR #8 (001-mcp-server → dev): Specs #4 + #6 complete, 94/94 tests on dev
- Cleaned stale branches: deleted local `001-mcp-server`, remote `origin/001-mcp-server`, `origin/spec/1-neo4j-infrastructure`
- Generated `specs/002-kong-mcp-gateway/tasks.md` — 21 tasks across 6 phases
- Ran speckit.analyze: 8 findings (0 critical, 3 high, 3 medium, 2 low)
- Remediated all 5 actionable issues:
  - F1: Added T006 (ai-mcp-proxy availability check) + T010 (conditional add)
  - I1: Fixed FR-010 in spec.md — deck sync → POST /config
  - I2: Fixed T008 — single-route/strip_path:false → two explicit routes with strip_path:true
  - B1: Resolved http-log placeholder — T009 gives concrete options (go-httpbin or file-log)
  - A1: Swapped T013/T014 — deck validate before POST /config apply
- Test runs: 72/72 MCP unit+contract ✅; 30/30 query unit ✅
- Committed: `spec(005): generate tasks.md + fix spec.md FR-010` (b0963ee)
- Next: implement T001–T021 in order on 002-kong-mcp-gateway

### 2026-03-08 — Spec #5 spec/plan + stack prep session
- Ran speckit.analyze on 001-mcp-server: 10 findings, no blockers, all artifact-level (not implementation)
- Committed Spec #6 integration + e2e tests on 001-mcp-server (c81e0f5); opened PR #8
- Cleaned up 5 stale local branches + 3 remote branches (all fully merged to dev)
- Created 002-kong-mcp-gateway branch; wrote spec.md, plan.md, research.md
- Key discovery: kong/ directory was empty — kong.yaml was never created; must create before Kong starts
- Key discovery: query and kong both had 8000:8000 host port binding — fixed in docker-compose (query → 8081:8000)
- Uncommented plaudelm-mcp service in docker-compose.yml (SSE mode, depends_on query)
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
