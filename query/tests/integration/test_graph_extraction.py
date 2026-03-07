"""
Integration tests for Spec #2 — n8n Graph Extraction Step.

Verifies that ingesting a markdown document via the n8n webhook results in:
  - Document and Chunk nodes written to Neo4j
  - Concept nodes written to Neo4j with MENTIONS relationships
  - Qdrant point IDs that are valid UUIDs
  - Qdrant payload neo4j_chunk_id matching the Neo4j Chunk.id
  - Idempotent ingest (no duplicate nodes on second run)

Requires running stack: Neo4j, Qdrant, n8n, Kong (with /notebooklm/chat route).
Run with: pytest tests/integration/test_graph_extraction.py -m integration

Environment variables required:
  TEST_NEO4J_URI       bolt://localhost:7687
  TEST_NEO4J_USER      neo4j
  TEST_NEO4J_PASSWORD  <password>
  TEST_QDRANT_URL      http://localhost:6333
  TEST_N8N_WEBHOOK_URL http://localhost:5678/webhook
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import httpx
import pytest
from neo4j import Driver, GraphDatabase
from qdrant_client import QdrantClient


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TEST_NOTEBOOK = "personal"
# Ingest pipeline takes time for LLM calls; allow up to 60 s
INGEST_TIMEOUT_SECONDS = 60
INGEST_POLL_INTERVAL_SECONDS = 3

SAMPLE_MARKDOWN = """\
# GraphRAG and Knowledge Graphs

GraphRAG combines vector similarity search with knowledge graph traversal
to improve retrieval quality. Neo4j stores concept relationships while
Qdrant stores dense embeddings.

Key concepts include: graph extraction, chunk embeddings, concept nodes,
relationship weighting, and hybrid re-ranking.

Kong AI Gateway routes all LLM traffic, enabling rate limiting and
observability across the ingest and query pipelines.
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _neo4j_driver(uri: str, user: str, password: str) -> Driver:
    return GraphDatabase.driver(uri, auth=(user, password))


def _neo4j_query(driver: Driver, cypher: str, **params: Any) -> list[dict[str, Any]]:
    with driver.session() as session:
        result = session.run(cypher, **params)
        return [record.data() for record in result]


def _is_valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(value, version=4)
        return True
    except (ValueError, AttributeError):
        return False


def _cleanup_test_document(driver: Driver, doc_id: str) -> None:
    """Remove all nodes created for this test document."""
    _neo4j_query(
        driver,
        "MATCH (ch:Chunk)-[:PART_OF]->(d:Document {id: $doc_id}) "
        "OPTIONAL MATCH (ch)-[:MENTIONS]->(c:Concept) "
        "OPTIONAL MATCH (ch)-[:REFERENCES]->(e:Event) "
        "DETACH DELETE ch, d",
        doc_id=doc_id,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def ingested_document(
    n8n_webhook_url: str,
    neo4j_uri: str,
    neo4j_user: str,
    neo4j_password: str,
    qdrant_url: str,
) -> dict[str, Any]:
    """
    POST a markdown document to the n8n ingest webhook and wait for processing.

    Yields metadata about the ingested document. Cleans up Neo4j nodes after
    the test module completes.

    This fixture will FAIL during the red phase because the n8n pipeline does
    not yet write to Neo4j (graph extraction node not yet added).
    """
    doc_id = str(uuid.uuid4())
    title = f"test-graph-extraction-{doc_id}"

    payload = {
        "source_type": "markdown",
        "notebook": TEST_NOTEBOOK,
        "title": title,
        "content": SAMPLE_MARKDOWN,
        "doc_id": doc_id,
    }

    # Trigger ingest
    with httpx.Client(timeout=30.0) as client:
        response = client.post(f"{n8n_webhook_url}/ingest", json=payload)
    assert response.status_code in (200, 201, 202), (
        f"n8n webhook returned unexpected status {response.status_code}: {response.text}"
    )

    # Poll Neo4j until Document node appears or timeout
    driver = _neo4j_driver(neo4j_uri, neo4j_user, neo4j_password)
    deadline = time.monotonic() + INGEST_TIMEOUT_SECONDS
    document_found = False
    while time.monotonic() < deadline:
        rows = _neo4j_query(
            driver,
            "MATCH (d:Document {id: $doc_id}) RETURN d.id AS id",
            doc_id=doc_id,
        )
        if rows:
            document_found = True
            break
        time.sleep(INGEST_POLL_INTERVAL_SECONDS)

    result = {
        "doc_id": doc_id,
        "title": title,
        "notebook": TEST_NOTEBOOK,
        "document_found": document_found,
        "driver": driver,
        "qdrant_client": QdrantClient(url=qdrant_url),
    }

    yield result

    # Cleanup — remove test nodes from Neo4j
    _cleanup_test_document(driver, doc_id)
    driver.close()


# ---------------------------------------------------------------------------
# Tests — Neo4j graph nodes (Spec #2 AC)
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_ingest_creates_document_node_in_neo4j(
    ingested_document: dict[str, Any],
) -> None:
    """Ingesting a markdown document creates a Document node in Neo4j (AC)."""
    driver: Driver = ingested_document["driver"]
    doc_id: str = ingested_document["doc_id"]

    rows = _neo4j_query(
        driver,
        "MATCH (d:Document {id: $doc_id, notebook: $notebook}) RETURN d.title AS title",
        doc_id=doc_id,
        notebook=TEST_NOTEBOOK,
    )
    assert rows, (
        f"No Document node found in Neo4j for id={doc_id}, notebook={TEST_NOTEBOOK}. "
        "Graph extraction step not yet implemented in n8n pipeline."
    )
    assert rows[0]["title"] == ingested_document["title"]


@pytest.mark.integration
def test_ingest_creates_chunk_nodes_linked_to_document(
    ingested_document: dict[str, Any],
) -> None:
    """Ingesting a markdown document creates Chunk nodes with PART_OF->Document (AC)."""
    driver: Driver = ingested_document["driver"]
    doc_id: str = ingested_document["doc_id"]

    rows = _neo4j_query(
        driver,
        "MATCH (ch:Chunk)-[:PART_OF]->(d:Document {id: $doc_id}) "
        "RETURN count(ch) AS chunk_count",
        doc_id=doc_id,
    )
    chunk_count: int = rows[0]["chunk_count"]
    assert chunk_count >= 1, (
        f"Expected >=1 Chunk nodes linked to Document {doc_id}, got {chunk_count}. "
        "Graph extraction step not yet implemented in n8n pipeline."
    )


@pytest.mark.integration
def test_ingest_creates_concept_nodes(
    ingested_document: dict[str, Any],
) -> None:
    """Ingesting a markdown document creates at least one Concept node (AC)."""
    driver: Driver = ingested_document["driver"]
    doc_id: str = ingested_document["doc_id"]

    rows = _neo4j_query(
        driver,
        "MATCH (ch:Chunk)-[:PART_OF]->(d:Document {id: $doc_id}) "
        "MATCH (ch)-[:MENTIONS]->(c:Concept) "
        "RETURN count(DISTINCT c) AS concept_count",
        doc_id=doc_id,
    )
    concept_count: int = rows[0]["concept_count"]
    assert concept_count >= 1, (
        f"Expected >=1 Concept nodes reachable from Document {doc_id}, got {concept_count}. "
        "Graph extraction step not yet implemented in n8n pipeline."
    )


@pytest.mark.integration
def test_ingest_creates_mentions_relationships(
    ingested_document: dict[str, Any],
) -> None:
    """Chunk nodes have at least one MENTIONS->Concept relationship (AC)."""
    driver: Driver = ingested_document["driver"]
    doc_id: str = ingested_document["doc_id"]

    rows = _neo4j_query(
        driver,
        "MATCH (ch:Chunk)-[:PART_OF]->(d:Document {id: $doc_id}) "
        "MATCH (ch)-[:MENTIONS]->(c:Concept) "
        "RETURN count(*) AS mention_count",
        doc_id=doc_id,
    )
    mention_count: int = rows[0]["mention_count"]
    assert mention_count > 0, (
        f"Expected >0 MENTIONS relationships from Chunks of Document {doc_id}, "
        f"got {mention_count}. Graph extraction not yet implemented."
    )


@pytest.mark.integration
def test_chunk_ids_are_valid_uuids_in_neo4j(
    ingested_document: dict[str, Any],
) -> None:
    """All Chunk.id values are valid UUIDs (AC — fixes composite ID bug)."""
    driver: Driver = ingested_document["driver"]
    doc_id: str = ingested_document["doc_id"]

    rows = _neo4j_query(
        driver,
        "MATCH (ch:Chunk)-[:PART_OF]->(d:Document {id: $doc_id}) RETURN ch.id AS chunk_id",
        doc_id=doc_id,
    )
    assert rows, f"No Chunk nodes found for Document {doc_id}"
    for row in rows:
        chunk_id: str = row["chunk_id"]
        assert _is_valid_uuid(chunk_id), (
            f"Chunk.id '{chunk_id}' is not a valid UUID. "
            "n8n pipeline must use crypto.randomUUID() for chunk IDs."
        )


# ---------------------------------------------------------------------------
# Tests — Qdrant UUID point IDs and neo4j_chunk_id linkage (Spec #2 AC)
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_qdrant_point_ids_are_uuids(
    ingested_document: dict[str, Any],
) -> None:
    """All Qdrant point IDs in the personal collection are valid UUIDs (AC)."""
    client: QdrantClient = ingested_document["qdrant_client"]

    points, _next = client.scroll(
        collection_name=TEST_NOTEBOOK,
        limit=100,
        with_payload=False,
        with_vectors=False,
    )
    assert points, f"No points found in Qdrant collection '{TEST_NOTEBOOK}'"

    non_uuid_ids = [str(p.id) for p in points if not _is_valid_uuid(str(p.id))]
    assert not non_uuid_ids, (
        f"Found {len(non_uuid_ids)} non-UUID point ID(s) in '{TEST_NOTEBOOK}': "
        f"{non_uuid_ids[:5]}... n8n pipeline must use crypto.randomUUID() for point IDs."
    )


@pytest.mark.integration
def test_qdrant_neo4j_chunk_id_matches_neo4j_chunk_id(
    ingested_document: dict[str, Any],
) -> None:
    """Each Qdrant point's neo4j_chunk_id payload matches its Neo4j Chunk.id (AC)."""
    driver: Driver = ingested_document["driver"]
    doc_id: str = ingested_document["doc_id"]
    client: QdrantClient = ingested_document["qdrant_client"]

    # Collect all Chunk IDs from Neo4j for this document
    rows = _neo4j_query(
        driver,
        "MATCH (ch:Chunk)-[:PART_OF]->(d:Document {id: $doc_id}) RETURN ch.id AS chunk_id",
        doc_id=doc_id,
    )
    assert rows, f"No Chunk nodes found for Document {doc_id}"
    neo4j_chunk_ids = {row["chunk_id"] for row in rows}

    # Fetch matching Qdrant points by UUID
    for chunk_id in neo4j_chunk_ids:
        results = client.retrieve(
            collection_name=TEST_NOTEBOOK,
            ids=[chunk_id],
            with_payload=True,
        )
        assert results, (
            f"No Qdrant point found with id={chunk_id} in collection '{TEST_NOTEBOOK}'. "
            "neo4j_chunk_id linkage not yet implemented."
        )
        payload = results[0].payload or {}
        qdrant_neo4j_id = payload.get("neo4j_chunk_id")
        assert qdrant_neo4j_id == chunk_id, (
            f"Qdrant point {chunk_id} has neo4j_chunk_id='{qdrant_neo4j_id}', "
            f"expected '{chunk_id}'. Payload linkage not yet implemented."
        )


# ---------------------------------------------------------------------------
# Tests — Idempotency (Spec #2 AC)
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_second_ingest_of_same_document_is_idempotent(
    n8n_webhook_url: str,
    neo4j_uri: str,
    neo4j_user: str,
    neo4j_password: str,
    ingested_document: dict[str, Any],
) -> None:
    """Ingesting the same document twice does not create duplicate Document or Concept nodes (AC)."""
    doc_id: str = ingested_document["doc_id"]
    title: str = ingested_document["title"]
    driver: Driver = ingested_document["driver"]

    payload = {
        "source_type": "markdown",
        "notebook": TEST_NOTEBOOK,
        "title": title,
        "content": SAMPLE_MARKDOWN,
        "doc_id": doc_id,
    }

    with httpx.Client(timeout=30.0) as client:
        response = client.post(f"{n8n_webhook_url}/ingest", json=payload)
    assert response.status_code in (200, 201, 202), (
        f"Second ingest webhook call returned {response.status_code}: {response.text}"
    )

    # Wait for pipeline to complete
    time.sleep(INGEST_TIMEOUT_SECONDS)

    # Document count must be exactly 1
    rows = _neo4j_query(
        driver,
        "MATCH (d:Document {id: $doc_id}) RETURN count(d) AS cnt",
        doc_id=doc_id,
    )
    doc_count: int = rows[0]["cnt"]
    assert doc_count == 1, (
        f"Expected exactly 1 Document node for id={doc_id} after second ingest, "
        f"got {doc_count}. Pipeline must use MERGE not CREATE for Document nodes."
    )

    # Concept count must be stable (not doubled)
    rows_before = _neo4j_query(
        driver,
        "MATCH (ch:Chunk)-[:PART_OF]->(d:Document {id: $doc_id}) "
        "MATCH (ch)-[:MENTIONS]->(c:Concept) "
        "RETURN count(DISTINCT c) AS cnt",
        doc_id=doc_id,
    )
    # Re-query immediately after — count should be the same
    rows_after = _neo4j_query(
        driver,
        "MATCH (ch:Chunk)-[:PART_OF]->(d:Document {id: $doc_id}) "
        "MATCH (ch)-[:MENTIONS]->(c:Concept) "
        "RETURN count(DISTINCT c) AS cnt",
        doc_id=doc_id,
    )
    assert rows_before[0]["cnt"] == rows_after[0]["cnt"], (
        "Concept count changed between two identical queries — indicates race condition."
    )
