"""
Integration tests for the FastAPI query service (Spec #3).

Tests exercise the app via FastAPI TestClient against real Qdrant and Neo4j instances.
Kong/Ollama calls are NOT required for most tests — the query endpoint gracefully
returns empty results when no chunks are found.

Requires running services and environment variables:
  TEST_QDRANT_URL      http://localhost:6333
  TEST_NEO4J_URI       bolt://localhost:7687
  TEST_NEO4J_USER      neo4j
  TEST_NEO4J_PASSWORD  <password>

Optional (defaults to localhost):
  TEST_KONG_PROXY_URL  http://localhost:8000

Run with: pytest tests/integration/test_query_endpoint.py -m integration -v
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def app_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Propagate TEST_* env vars to the service env vars before importing the app."""
    mapping = {
        "QDRANT_URL": os.environ.get("TEST_QDRANT_URL", ""),
        "NEO4J_URI": os.environ.get("TEST_NEO4J_URI", ""),
        "NEO4J_USER": os.environ.get("TEST_NEO4J_USER", "neo4j"),
        "NEO4J_PASSWORD": os.environ.get("TEST_NEO4J_PASSWORD", ""),
        "KONG_PROXY_URL": os.environ.get("TEST_KONG_PROXY_URL", "http://localhost:8000"),
    }
    for key, val in mapping.items():
        if val:
            monkeypatch.setenv(key, val)


@pytest.fixture(scope="module")
def client(app_env: None) -> TestClient:
    """Create a TestClient for the FastAPI app with real service env vars set."""
    required = ["TEST_QDRANT_URL", "TEST_NEO4J_URI", "TEST_NEO4J_PASSWORD"]
    for var in required:
        if not os.environ.get(var):
            pytest.skip(f"{var} not set — skipping integration test")

    from main import app

    return TestClient(app)


@pytest.mark.integration
def test_health_endpoint_returns_200(client: TestClient) -> None:
    """GET /health returns HTTP 200 with {status: ok}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.integration
def test_query_endpoint_returns_422_for_invalid_notebook(client: TestClient) -> None:
    """POST /query with an invalid notebook name returns HTTP 422 (validation error)."""
    response = client.post(
        "/query", json={"question": "test question", "notebook": "not-a-real-notebook"}
    )
    assert response.status_code == 422


@pytest.mark.integration
def test_query_endpoint_returns_422_when_question_missing(client: TestClient) -> None:
    """POST /query without a question field returns HTTP 422."""
    response = client.post("/query", json={"notebook": "personal"})
    assert response.status_code == 422


@pytest.mark.integration
def test_query_endpoint_returns_empty_results_not_error_when_no_matches(
    client: TestClient,
) -> None:
    """POST /query returns 200 with empty citations when no chunks match (not an error)."""
    response = client.post(
        "/query",
        json={
            "question": "xyzzy quux frob nonce this-query-will-never-match",
            "notebook": "personal",
            "top_k": 5,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "answer" in body
    assert "citations" in body
    assert "concepts_used" in body
    assert isinstance(body["citations"], list)
    assert isinstance(body["concepts_used"], list)


@pytest.mark.integration
def test_query_endpoint_response_conforms_to_query_response_schema(
    client: TestClient,
) -> None:
    """POST /query response always has answer (str), citations (list), concepts_used (list)."""
    response = client.post(
        "/query",
        json={"question": "What is GraphRAG?", "notebook": "personal", "top_k": 3},
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["answer"], str)
    assert isinstance(body["citations"], list)
    assert isinstance(body["concepts_used"], list)
    for citation in body["citations"]:
        assert "neo4j_chunk_id" in citation
        assert "chunk_text" in citation
        assert "score" in citation
        assert "title" in citation


@pytest.mark.integration
def test_collections_endpoint_returns_all_three_notebooks(client: TestClient) -> None:
    """GET /collections returns kong, personal, and music with chunk_count and document_count."""
    response = client.get("/collections")
    assert response.status_code == 200
    body = response.json()
    assert "notebooks" in body
    notebooks = body["notebooks"]
    assert isinstance(notebooks, list)
    names = {n["name"] for n in notebooks}
    assert {"kong", "personal", "music"} <= names
    for notebook in notebooks:
        assert "name" in notebook
        assert "chunk_count" in notebook
        assert "document_count" in notebook


@pytest.mark.integration
def test_config_raises_on_missing_qdrant_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """Config() raises RuntimeError when QDRANT_URL is not set."""
    monkeypatch.delenv("QDRANT_URL", raising=False)
    # Force reimport to bypass module-level caching
    import importlib

    import config

    importlib.reload(config)
    with pytest.raises(RuntimeError, match="QDRANT_URL"):
        config.Config()


@pytest.mark.integration
def test_config_raises_on_missing_neo4j_uri(monkeypatch: pytest.MonkeyPatch) -> None:
    """Config() raises RuntimeError when NEO4J_URI is not set."""
    monkeypatch.delenv("NEO4J_URI", raising=False)
    import importlib

    import config

    importlib.reload(config)
    with pytest.raises(RuntimeError, match="NEO4J_URI"):
        config.Config()
