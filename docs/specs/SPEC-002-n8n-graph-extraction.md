# SPEC-002 — n8n Graph Extraction Step

**GitHub Issue:** #3
**Branch:** `feat/3-n8n-graph-extraction`
**Status:** Spec written — pending implementation
**Depends on:** SPEC-001 (Neo4j Infrastructure) ✅

---

## Problem

The existing n8n ingest pipeline chunks documents, summarizes them, and stores vectors in Qdrant — but it does **not** write anything to Neo4j. Without graph extraction, the knowledge graph remains empty and the GraphRAG hybrid retrieval pipeline (Spec #3) has no graph context to work with. This blocks all downstream query quality improvements.

Additionally, Qdrant point IDs are currently string composite IDs (not UUIDs), which violates the Qdrant spec and breaks the `neo4j_chunk_id` linkage required for hybrid retrieval merge.

---

## Proposed Solution

Add a **graph extraction node** to the n8n ingest pipeline, executing after the summarization step and before the Qdrant upsert:

1. **Fix chunk IDs** — generate UUID per chunk via `crypto.randomUUID()` in n8n Code node. UUID becomes both Qdrant point ID and Neo4j `Chunk.id`.
2. **Extract graph entities** — call `POST /notebooklm/chat` (Kong → llama3.2) with a structured prompt returning `{ concepts[], relationships[], events[] }` JSON.
3. **Validate JSON** — parse + validate in n8n Code node; retry once on malformed JSON; fall back to empty arrays (log warning, do not fail ingest).
4. **Write to Neo4j** via n8n HTTP node:
   - `MERGE (:Document {id, title, source_type, source_url, notebook, ingested_at})`
   - `MERGE (:Chunk {id: chunk_uuid, chunk_index, notebook, ingested_at})`
   - `CREATE (:Chunk)-[:PART_OF]->(:Document)`
   - `MERGE (:Concept {name}) ON CREATE SET notebooks = []` + accumulate notebooks
   - `MERGE (:Chunk)-[:MENTIONS]->(:Concept)`
   - `MERGE (:Concept)-[:RELATED_TO {weight: 1.0}]->(:Concept)` per relationship
   - `MERGE (:Event {name, notebook})` + `MERGE (:Chunk)-[:REFERENCES]->(:Event)`
5. **Update Qdrant payload** — set `neo4j_chunk_id` to the same UUID used in Neo4j.

---

## Acceptance Criteria

- [ ] Ingesting a markdown document triggers graph extraction without error
- [ ] `MATCH (d:Document {notebook: 'personal'}) RETURN d` returns the ingested document node
- [ ] `MATCH (ch:Chunk)-[:PART_OF]->(d:Document) RETURN count(ch)` returns the expected chunk count
- [ ] `MATCH (c:Concept) RETURN c` returns >=1 Concept node
- [ ] `MATCH (ch:Chunk)-[:MENTIONS]->(c:Concept) RETURN count(*) > 0` returns true
- [ ] All Qdrant point IDs are valid UUIDs
- [ ] Each Qdrant point payload `neo4j_chunk_id` equals the corresponding Neo4j `Chunk.id`
- [ ] Malformed LLM JSON triggers one retry; if still malformed, ingest completes with empty arrays (no crash)
- [ ] All Spec #1 integration tests still pass (no regressions)
- [ ] Running pipeline twice on same document is idempotent (no duplicate Document or Concept nodes)

---

## Out of Scope

- `:Event`-to-`:Event` `[:PRECEDES]` ordering
- `:Document`-to-`:Document` `[:LINKS_TO]` relationships
- Manual relationship curation (`add_relationship` MCP tool)
- GraphRAG hybrid retrieval query pipeline (Spec #3)
- Confidence scoring on extracted relationships
- Google Drive or PDF ingest (markdown only for this spec)

---

## Test Plan

| Layer | Framework | What is tested |
|---|---|---|
| Integration | pytest `@pytest.mark.integration` | Neo4j: Document, Chunk, Concept nodes created; idempotency; UUID format |
| Integration | pytest `@pytest.mark.integration` | Qdrant: point IDs are UUIDs; `neo4j_chunk_id` matches Neo4j Chunk.id |
| Smoke | Manual / curl | POST ingest webhook with sample markdown -> verify Neo4j + Qdrant state |

---

## Dependencies

- SPEC-001 (Neo4j Infrastructure) — constraints, indexes, Qdrant collections ✅
- n8n running in docker-compose ✅
- Kong route `/notebooklm/chat` routing to Ollama llama3.2 ✅
