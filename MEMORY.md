# MEMORY.md — Personal NotebookLM

> Read this file at the start of every Claude Code session before doing any work.
> Update this file at the end of every session — mark completions, add decisions, log issues.
> Also read CONSTITUTION.md and ARCHITECTURE.md before starting any task.

---

## Current Status

**Phase:** Spec #2 complete ✅ — ready to begin Spec #3 (Query Service)
**Last updated:** 2026-03-07
**Next action:** Open PR for feat/3-n8n-graph-extraction → dev, then begin Spec #3. Write GitHub Issue spec first (see Article I.1). Branch will be: `feat/NNN-query-service`

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

### Infrastructure (Spec #1 — complete, PR #2 open → dev)
- [x] `docker-compose.yml` — Ollama, Qdrant v1.13.5, Neo4j 5 Community, n8n, Kong; stubs for query + notebooklm-mcp
- [x] `.env.example` — all required variables documented
- [x] `scripts/init-neo4j.py` — idempotent: 4 constraints, 3 range indexes, 1 full-text index
- [x] `scripts/init-qdrant.py` — idempotent: kong/personal/music (768-dim, Cosine)
- [x] `query/tests/integration/test_neo4j.py` — 10 integration tests, all green
- [x] `query/tests/integration/test_qdrant.py` — 11 integration tests, all green
- [x] `docs/specs/SPEC-001-neo4j-infrastructure.md` — spec committed
- [x] GitHub Issue #1 created, PR #2 open

### Kong AI Gateway (foundation)
- [x] `kong/kong-ollama.yaml` — decK config
  - `/notebooklm/embed` → Ollama nomic-embed-text (ai-proxy, http-log)
  - `/notebooklm/chat` → Ollama llama3.2 (ai-proxy, ai-rate-limiting-advanced, ai-pii-sanitizer, http-log)
  - ⚠️ Does NOT yet include MCP Gateway route — needs update

---

## In Progress

### Spec #2 — n8n Graph Extraction Step ✅ COMPLETE (PR pending)
- [x] All implementation committed on feat/3-n8n-graph-extraction
- [x] **29/29 integration tests green**: 21 Spec #1 + 8 Spec #2
- [ ] PR not yet opened: feat/3-n8n-graph-extraction → dev

---

## Backlog (prioritized)

### SPEC WRITING FIRST — create GitHub Issues before any implementation

**Spec #1 — Neo4j Infrastructure** ✅ DONE (PR #2)

**Spec #2 — n8n Graph Extraction Step** ✅ DONE (PR pending)

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
| 2026-03-07 | CHAT_ENDPOINT / EMBED_ENDPOINT env vars in n8n | Decouples n8n from Kong during dev; set to Ollama direct (http://ollama:11434/api/*) until Kong is layered in (Spec #5) |
| 2026-03-07 | NODE_FUNCTION_ALLOW_BUILTIN=crypto in docker-compose.yml | n8n 1.90.2 task runner sandbox blocks all Node.js builtins; must explicitly allow crypto for require('crypto').randomUUID() |
| 2026-03-07 | n8n Code node sandbox API (task runner) | $env['KEY'] not process.env; helpers.httpRequest() not $helpers; runOnceForEachItem returns {json:...} not [{json:...}]; crypto global not exposed |
| 2026-03-07 | n8n owner setup: POST /rest/owner/setup {email, firstName, lastName, password (≥8 chars, ≥1 uppercase)} | Login field is emailOrLdapLoginId. Owner must exist before Code nodes execute in active workflows. |
| 2026-03-07 | Kong not deployed until core stack is stable | User decision: get neo4j+qdrant+ollama+n8n working first; add Kong as Spec #5 |
| 2026-03-07 | Ollama healthcheck uses TCP not curl | Ollama image has no curl; use bash TCP check same as Qdrant |
| 2026-03-07 | N8N_SECURE_COOKIE=false for local dev | n8n requires HTTPS for secure cookies; HTTP-only local dev needs this off |
| 2026-03-07 | N8N_RUNNERS_ENABLED=true required | n8n 1.90.2 needs task runners for Code nodes to execute; without it, Code nodes silently skip |

---

## Known Issues / Watch Out For

- **n8n import creates duplicates** — `n8n import:workflow` always creates a new workflow (new ID) rather than updating in-place. After each import, must activate new, deactivate + delete old via REST API. Consider scripting this.
- **Qdrant client version mismatch** — host has qdrant-client 1.17.0 but server is 1.13.5. Tests still pass; suppress with `check_compatibility=False` if needed. Pin client version when setting up query service venv.
- **llama3.2 and nomic-embed-text not pre-pulled** — models must be pulled manually with `docker exec notebooklm-ollama ollama pull <model>` before ingest pipeline LLM steps work. Summarize/Extract nodes silently degrade (empty output) when model unavailable — this is intentional fallback behavior.
- **Qdrant point IDs** — fixed in Spec #2 workflow (crypto.randomUUID()). Not yet verified green.
- **llama3.2 JSON reliability** — graph extraction prompt may produce malformed JSON on edge cases. Retry logic + JSON validation implemented in n8n Code node with fallback to empty arrays.
- **llama3.2 CPU speed** — ~5-10 tok/s on CPU. Ingest is async so acceptable. For interactive query, cap `max_tokens` to keep latency reasonable.
- **Neo4j Community Edition** — no multiple databases. All notebooks share one database, scoped by node properties. Fine for this design.
- **Neo4j memory** — tune `NEO4J_server_memory_heap_max__size` and `pagecache_size` in docker-compose for home lab constraints. Start with 1G heap, 512M pagecache.
- **Google Drive ingest** — requires Google OAuth 2.0 app. Set up at console.cloud.google.com; credentials go in `.env` and n8n Credentials UI.
- **PDF ingest via n8n** — requires multipart/form-data (binary), not JSON. Document this clearly in MCP `ingest_document` tool error messages.
- **MCP transport switching** — when `MCP_TRANSPORT=sse`, the stdio handler must not be initialized (and vice versa). Validate at startup in `config.ts`.
- **Kong MCP Gateway** — `ai-mcp-proxy` plugin config needs to match the MCP server's SSE endpoint path exactly. Test with `deck diff` before `deck sync`.

---

## Session Notes

### 2026-03-07 — Spec #1 implementation session
- Repo initialized, pushed to GitHub (public), branch protection on main, dev branch created
- Spec #1 written: GitHub Issue #1, docs/specs/SPEC-001-neo4j-infrastructure.md
- Red phase: 21 failing integration tests committed
- Green phase: docker-compose.yml, .env.example, init-neo4j.py, init-qdrant.py implemented
- Fixed: Neo4j pagecache env var (single not double underscore), Qdrant healthcheck (bash TCP — no curl in image)
- Pinned qdrant-client~=1.13.0 to match server v1.13.5; pinned image to qdrant/qdrant:v1.13.5
- 21/21 integration tests green, PR #2 open feat/1-neo4j-infrastructure → dev
- IMPORTANT: never use --remove-orphans flag; it stops containers from other compose projects

### 2026-03-07 — Initial build session
- Full stack designed and scaffolded
- Foundation files generated (docker-compose, n8n workflow, Kong config, init scripts)

### 2026-03-07 — Knowledge graph design session
- Decided on Neo4j + GraphRAG hybrid retrieval
- Designed all node types, relationship types, scoping strategy
- Established re-ranking formula (60% vector, 40% graph)

### 2026-03-07 — Spec #2 session (graph extraction)
- Branch `feat/3-n8n-graph-extraction` created from dev
- Red phase: 8 failing integration tests written for all Spec #2 ACs
- Green phase: `n8n/workflows/ingest-pipeline.json` created (8 nodes, full graph extraction pipeline)
- docker-compose.yml updated: Ollama TCP healthcheck, n8n env vars, N8N_SECURE_COOKIE=false, N8N_RUNNERS_ENABLED=true
- .env.example updated: NEO4J_HTTP_URL, CHAT_ENDPOINT, EMBED_ENDPOINT, TEST_N8N_WEBHOOK_URL
- Stack started: neo4j, qdrant, ollama, n8n (no kong — deferred)
- Workflow imported via `docker exec n8n import:workflow --input=...`
- **BLOCKER**: n8n Code nodes not executing — `/rest/owner/setup` returns 500
- 21/21 Spec #1 tests green; 8/8 Spec #2 tests red (pipeline not running)
- `update:workflow` is deprecated in n8n 1.90.2 — use `publish:workflow --id=` instead
- IMPORTANT: never use --remove-orphans flag; stops containers from other compose projects
- httpx>=0.27 added to query/requirements-dev.txt

### 2026-03-07 — Spec #2 green phase completion
- Unblocked n8n owner setup: POST /rest/owner/setup, correct body fields discovered from source
- Found and fixed 5 Code node sandbox bugs (crypto, process.env, $helpers, return shape, kongUrl)
- Added NODE_FUNCTION_ALLOW_BUILTIN=crypto to docker-compose.yml; restarted n8n
- Ollama models pulled: nomic-embed-text (274MB), llama3.2 (2.0GB)
- 8/8 Spec #2 integration tests green; 21/21 Spec #1 tests still green (no regression)
- beads task plaudeLM-64c closed; plaudeLM-a3t (Spec #3) now unblocked
- MCP (`mcp/`) and query unit tests (`query/tests/unit/`) do not exist yet — Specs #3 and #4
- PR for feat/3-n8n-graph-extraction → dev not yet opened

### 2026-03-07 — MCP server + constitution session
- Designed full MCP server architecture (7 tools, dual transport, TypeScript)
- Established spec-driven development + TDD mandate
- Created CONSTITUTION.md, ARCHITECTURE.md, updated CLAUDE.md + MEMORY.md
- **Next session must start by writing GitHub Issue specs before any code**
- Suggested order: Spec #1 (Neo4j) → Spec #2 (graph extraction) → Spec #3 (query service) → Spec #4 (MCP server)
