"""
Pytest configuration for query service tests.

Integration tests require:
  TEST_NEO4J_URI      — Neo4j Bolt URI (e.g. bolt://localhost:7687)
  TEST_NEO4J_USER     — Neo4j username
  TEST_NEO4J_PASSWORD — Neo4j password
  TEST_QDRANT_URL     — Qdrant REST URL (e.g. http://localhost:6333)
  TEST_N8N_WEBHOOK_URL — n8n ingest webhook base URL (e.g. http://localhost:5678/webhook)

These must point to a test instance, never production.
"""

import os
import pytest


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "integration: mark test as requiring real running services (Qdrant, Neo4j)",
    )


@pytest.fixture(scope="session")
def neo4j_uri() -> str:
    uri = os.environ.get("TEST_NEO4J_URI")
    if not uri:
        pytest.skip("TEST_NEO4J_URI not set — skipping integration test")
    return uri


@pytest.fixture(scope="session")
def neo4j_user() -> str:
    return os.environ.get("TEST_NEO4J_USER", "neo4j")


@pytest.fixture(scope="session")
def neo4j_password() -> str:
    password = os.environ.get("TEST_NEO4J_PASSWORD")
    if not password:
        pytest.skip("TEST_NEO4J_PASSWORD not set — skipping integration test")
    return password


@pytest.fixture(scope="session")
def qdrant_url() -> str:
    url = os.environ.get("TEST_QDRANT_URL")
    if not url:
        pytest.skip("TEST_QDRANT_URL not set — skipping integration test")
    return url


@pytest.fixture(scope="session")
def n8n_webhook_url() -> str:
    url = os.environ.get("TEST_N8N_WEBHOOK_URL")
    if not url:
        pytest.skip("TEST_N8N_WEBHOOK_URL not set — skipping integration test")
    return url
