# SPEC-001 — Neo4j Infrastructure

**GitHub Issue:** #1
**Branch:** spec/1-neo4j-infrastructure
**Status:** In Progress
**Created:** 2026-03-07

---

## Problem

The system design (ARCHITECTURE.md) requires Neo4j 5 Community as the knowledge graph store.
No Neo4j service exists in the current `docker-compose.yml`, no initialization script exists,
and the `.env.example` is missing Neo4j variables. Without Neo4j running and properly initialized,
Spec #2 (graph extraction) and Spec #3 (query service) cannot begin.

**Affected:** All subsequent specs — Neo4j is a hard dependency for graph extraction, hybrid retrieval, and all graph-related MCP tools.

---

## Proposed Solution

1. Add `neo4j` service to `docker-compose.yml` (alongside existing Ollama, Qdrant, n8n services; also add stub entries for `query` and `notebooklm-mcp` so service names are stable per IV.4).
2. Add all Neo4j environment variables to `.env.example`.
3. Create `scripts/init-neo4j.py` — connects to Neo4j via Bolt, creates all constraints and indexes defined in ARCHITECTURE.md, and is idempotent (safe to re-run).
4. Verify `scripts/init-qdrant.py` uses UUIDs for collection config and is consistent with ARCHITECTURE.md (768-dim, Cosine).

---

## Acceptance Criteria

- [ ] AC-1: `docker compose up neo4j` starts Neo4j 5 Community and passes its own healthcheck within 60 seconds
- [ ] AC-2: Neo4j Browser is reachable at `http://localhost:7474` after `docker compose up`
- [ ] AC-3: `python3 scripts/init-neo4j.py` runs without error against a running Neo4j instance
- [ ] AC-4: After `init-neo4j.py`, all four uniqueness constraints exist: `Concept.name`, `Document.id`, `Chunk.id`, `Event.name`
- [ ] AC-5: After `init-neo4j.py`, all indexes exist: `Chunk(notebook)`, `Concept(notebooks)`, `Document(notebook)`, full-text index `conceptNameIndex` on `Concept.name`
- [ ] AC-6: `init-neo4j.py` is idempotent — running it twice produces no errors and no duplicate constraints/indexes
- [ ] AC-7: `.env.example` documents all required Neo4j variables: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_AUTH`
- [ ] AC-8: `docker-compose.yml` includes stub service definitions for `query` and `notebooklm-mcp` (image placeholder, commented out) so service names are locked per CONSTITUTION.md IV.4
- [ ] AC-9: All Neo4j data persisted to a named Docker volume (not bind mount); volume survives `docker compose restart`

---

## Out of Scope

- No data ingestion into Neo4j (that is Spec #2)
- No FastAPI query service implementation (Spec #3)
- No MCP server implementation (Spec #4)
- No Kubernetes manifests

---

## Test Plan

| Layer | Test | Location |
|---|---|---|
| Script smoke test | `init-neo4j.py` runs exit 0 | manual / CI shell step |
| Integration | Constraints exist post-init | `query/tests/integration/test_neo4j.py` |
| Integration | Indexes exist post-init | `query/tests/integration/test_neo4j.py` |
| Integration | Idempotency — run twice, no error | `query/tests/integration/test_neo4j.py` |
| Integration | Qdrant collections exist (768-dim, Cosine) | `query/tests/integration/test_qdrant.py` |

Tests are tagged `@pytest.mark.integration` and require `TEST_NEO4J_URI` env var.
They must NOT run against production collections/database.

---

## Dependencies

- Docker Compose (already present)
- Qdrant service (already in docker-compose)
- Ollama service (already in docker-compose)
- n8n service (already in docker-compose)
- Python 3.11+ with `neo4j` driver (`pip install neo4j`)

---

## Implementation Notes

- Use `neo4j:5-community` image
- Healthcheck: `wget -q --spider http://localhost:7474 || exit 1`
- Memory tuning: `NEO4J_server_memory_heap_max__size=1G`, `NEO4J_server_memory_pagecache__size=512M`
- Use `MERGE` not `CREATE` for all constraint/index creation where applicable; use `CREATE CONSTRAINT IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` (Neo4j 5 syntax) for idempotency
- `init-neo4j.py` must validate `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` env vars at startup and fail fast with clear error if missing
- Full-text index on `Concept.name` is required for `search_concepts` MCP tool (Spec #4)
