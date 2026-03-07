# CLAUDE.md — Personal NotebookLM

> **Read before doing anything else:**
> 1. Read `CONSTITUTION.md` — non-negotiable rules. Every rule applies to every task.
> 2. Read `MEMORY.md` — current project state and what's next.
> 3. Read `ARCHITECTURE.md` — authoritative system design reference.
> Then proceed with the task.

---

## Task Board (beads)

- **Session start:** always run `bd ready` before any work
- **Before coding:** `bd update <id> --status=in_progress`
- **After completing:** `bd update <id> --status=closed`
- Only work on tasks shown in `bd ready` — blocked tasks are blocked for a reason

---

## Project Overview

A fully local, self-hosted **GraphRAG** knowledge base exposed via an **MCP server**.
All LLM and embedding inference runs locally via Ollama. No external AI API calls.
All LLM traffic routes through Kong AI Gateway for observability and control.
Primary interface: Claude (Desktop / Code / claude.ai) via MCP tools.

**Owner:** Paul (Staff Solutions Engineer, Kong)  
**Interface:** MCP tools → Claude Desktop, Claude Code, claude.ai, Kong MCP Gateway  
**No custom frontend.**

---

## Governing Documents

| Document | Purpose |
|---|---|
| `CONSTITUTION.md` | Non-negotiable rules — spec-driven dev, TDD, code quality |
| `ARCHITECTURE.md` | Authoritative system design, data schemas, service boundaries |
| `MEMORY.md` | Living session state — what's done, in progress, backlog |
| `docs/adr/` | Architecture Decision Records for significant decisions |

---

## Stack

| Layer | Technology |
|---|---|
| MCP server | TypeScript, `@modelcontextprotocol/sdk` |
| Ingest orchestration | n8n |
| Vector store | Qdrant |
| Knowledge graph | Neo4j 5 Community |
| LLM / embeddings | Ollama (llama3.2, nomic-embed-text) |
| LLM routing / observability | Kong AI Gateway + Kong MCP Gateway |
| Query API | FastAPI (Python 3.11+) |
| Test frameworks | Jest (TypeScript) + pytest (Python) |
| Deployment | Docker Compose → k3s (home lab, Proxmox) |

---

## Repository Structure

```
notebooklm/
├── CLAUDE.md                       # This file — start here
├── CONSTITUTION.md                 # Non-negotiable rules
├── ARCHITECTURE.md                 # System design reference
├── MEMORY.md                       # Session state
├── docker-compose.yml              # Full stack: all services
├── .env.example                    # All environment variables
│
├── docs/
│   ├── adr/                        # Architecture Decision Records
│   │   ├── TEMPLATE.md
│   │   └── ADR-NNN-slug.md
│   └── specs/                      # Spec files (if not using GitHub Issues)
│
├── scripts/
│   ├── init-qdrant.py              # Create Qdrant collections
│   ├── init-neo4j.py               # Create Neo4j constraints + indexes
│   └── pull-models.sh              # Pull Ollama models
│
├── mcp/                            # MCP Server (TypeScript)
│   ├── src/
│   │   ├── index.ts                # Entry point, transport selection
│   │   ├── server.ts               # MCP server definition + tool registry
│   │   ├── tools/
│   │   │   ├── ingest.ts           # ingest_document tool
│   │   │   ├── query.ts            # query tool
│   │   │   ├── concepts.ts         # search_concepts, add_relationship
│   │   │   ├── notebooks.ts        # list_notebooks
│   │   │   ├── graph.ts            # get_document_graph
│   │   │   └── audio.ts            # audio_overview
│   │   ├── clients/
│   │   │   ├── fastapi.ts          # FastAPI query service client
│   │   │   ├── qdrant.ts           # Qdrant direct client
│   │   │   └── neo4j.ts            # Neo4j direct client
│   │   └── config.ts               # Env var validation (fail-fast)
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── contract/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── query/                          # FastAPI Query Service (Python)
│   ├── main.py                     # FastAPI app + endpoints
│   ├── rag.py                      # Qdrant vector retrieval
│   ├── graph.py                    # Neo4j graph retrieval + expansion
│   ├── hybrid.py                   # Merge + re-rank
│   ├── models.py                   # Pydantic v2 models
│   ├── config.py                   # Env var validation
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   └── Dockerfile
│
├── n8n/
│   └── workflows/
│       └── ingest-pipeline.json    # n8n ingest workflow
│
├── kong/
│   └── kong-ollama.yaml            # Kong AI Gateway + MCP Gateway decK config
│
├── tests/
│   └── e2e/                        # Full stack end-to-end tests
│       ├── kong.e2e.test.ts
│       ├── personal.e2e.test.ts
│       └── music.e2e.test.ts
│
└── k8s/                            # Future k3s manifests (not yet)
```

---

## MCP Tools Reference

| Tool | Backend | Description |
|---|---|---|
| `ingest_document` | FastAPI → n8n | Add a document to a notebook |
| `query` | FastAPI `/query` | GraphRAG question answering |
| `search_concepts` | Neo4j direct | Browse knowledge graph concepts |
| `add_relationship` | Neo4j direct | Manually curate a graph edge |
| `list_notebooks` | Qdrant + Neo4j direct | Collection stats |
| `get_document_graph` | Neo4j direct | Show a document's concept connections |
| `audio_overview` | FastAPI `/audio-overview` | Generate podcast-style summary |

Full tool schemas in `ARCHITECTURE.md`.

---

## Notebooks (Qdrant Collections + Neo4j scope)

| Name | Purpose |
|---|---|
| `kong` | Kong product docs, POVs, customer notes, sales assets |
| `personal` | Research papers, articles, personal markdown notes |
| `music` | Music theory, gear research, tabs, creative notes |

**Vector config:** 768-dim, Cosine distance (nomic-embed-text)  
**Graph scope:** Single unified Neo4j graph; all nodes tagged with `notebook` property

---

## Service URLs (local dev)

| Service | URL |
|---|---|
| Ollama | http://localhost:11434 |
| Qdrant REST | http://localhost:6333 |
| Qdrant gRPC | localhost:6334 |
| Neo4j Browser | http://localhost:7474 |
| Neo4j Bolt | bolt://localhost:7687 |
| n8n | http://localhost:5678 |
| Query API | http://localhost:8000 |
| MCP Server (SSE) | http://localhost:3000 |
| Kong Gateway proxy | http://localhost:8000 |
| Kong Gateway admin | http://localhost:8001 |

---

## Spec-Driven Workflow (required by CONSTITUTION.md)

Before writing any code:
1. Create a GitHub Issue using the spec-kit template (see CONSTITUTION.md Article I.2)
2. Define acceptance criteria — each must map to a test case
3. Get issue number (e.g. `#42`)
4. Create branch: `feat/42-short-slug`
5. Write failing tests first (red)
6. Implement to pass tests (green)
7. Refactor
8. PR with `Implements #42` in description

---

## TDD Cycle (required by CONSTITUTION.md)

```
Red   → write failing test describing desired behavior
Green → write minimum code to pass
Refactor → clean up without breaking tests
```

Test locations and frameworks:
- `mcp/tests/unit/` — Jest, all deps mocked
- `mcp/tests/integration/` — Jest, real services, tagged `@integration`
- `mcp/tests/contract/` — Jest + Zod, MCP tool schema validation
- `query/tests/unit/` — pytest, all deps mocked
- `query/tests/integration/` — pytest, real services, `@pytest.mark.integration`
- `tests/e2e/` — Jest, full Docker Compose stack, tagged `@e2e`

---

## Coding Conventions

### TypeScript (MCP server)
- Strict mode: `"strict": true` in tsconfig — no `any`, no `as unknown as X`
- All I/O: `async/await` only — no callbacks, no `.then()` chains
- Formatting: Prettier (`printWidth: 100`, `singleQuote: true`)
- Zod schemas define MCP tool input/output — source of truth

### Python (Query service)
- Python 3.11+, full type annotations, `mypy --strict` must pass
- FastAPI + Pydantic v2
- All HTTP calls: `httpx.AsyncClient` — never `requests`
- Neo4j: `AsyncGraphDatabase` driver only
- Formatting: black + ruff

### Both
- No hardcoded values — ever (see CONSTITUTION.md Article III.1)
- Validate all env vars at startup, fail fast with clear error
- Never swallow exceptions silently

---

## Environment Variables

See `.env.example`. Key variables:

```
OLLAMA_BASE_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<set in .env>
KONG_PROXY_URL=http://localhost:8000
MCP_TRANSPORT=stdio
MCP_PORT=3000
QUERY_SERVICE_URL=http://localhost:8000
N8N_WEBHOOK_URL=http://localhost:5678/webhook
N8N_ENCRYPTION_KEY=<openssl rand -hex 32>
TEST_QDRANT_URL=http://localhost:6333
TEST_NEO4J_URI=bolt://localhost:7687
```

---

## What NOT to Do

- Do not call Anthropic API or OpenAI API — all inference is local via Ollama
- Do not call Ollama directly — always route through Kong AI Gateway
- Do not hardcode any value — always use environment variables
- Do not build a custom frontend — MCP tools are the interface
- Do not use `requests` in Python — use `httpx` async
- Do not use synchronous Neo4j driver — use `AsyncGraphDatabase`
- Do not use `CREATE` for Concept nodes in Neo4j — always `MERGE`
- Do not write implementation before tests — TDD is mandatory
- Do not merge failing tests — ever
- Do not start implementation without a spec — ever

