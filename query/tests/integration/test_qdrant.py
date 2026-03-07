"""
Integration tests for Qdrant infrastructure (Spec #1, AC-1 for Qdrant).

Requires a running Qdrant instance and init-qdrant.py to have been executed.
Run with: pytest tests/integration/test_qdrant.py -m integration

Environment variables required:
  TEST_QDRANT_URL   http://localhost:6333
"""

import pytest
from qdrant_client import QdrantClient
from qdrant_client.models import Distance


EXPECTED_NOTEBOOKS = ["kong", "personal", "music"]
EXPECTED_VECTOR_SIZE = 768
EXPECTED_DISTANCE = Distance.COSINE


# ---------------------------------------------------------------------------
# Connectivity
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_qdrant_is_reachable(qdrant_url: str) -> None:
    """Qdrant REST endpoint accepts connections."""
    client = QdrantClient(url=qdrant_url)
    # list_collections raises if unreachable
    client.get_collections()


# ---------------------------------------------------------------------------
# Collections exist with correct config (AC-1 for Qdrant, ARCHITECTURE.md)
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.parametrize("notebook", EXPECTED_NOTEBOOKS)
def test_collection_exists(qdrant_url: str, notebook: str) -> None:
    """Each notebook collection exists in Qdrant."""
    client = QdrantClient(url=qdrant_url)
    collections = [c.name for c in client.get_collections().collections]
    assert notebook in collections, f"Collection '{notebook}' not found in Qdrant"


@pytest.mark.integration
@pytest.mark.parametrize("notebook", EXPECTED_NOTEBOOKS)
def test_collection_vector_size_is_768(qdrant_url: str, notebook: str) -> None:
    """Each notebook collection uses 768-dimensional vectors (nomic-embed-text)."""
    client = QdrantClient(url=qdrant_url)
    info = client.get_collection(notebook)
    vector_size = info.config.params.vectors.size  # type: ignore[union-attr]
    assert vector_size == EXPECTED_VECTOR_SIZE, (
        f"Collection '{notebook}' has vector size {vector_size}, expected {EXPECTED_VECTOR_SIZE}"
    )


@pytest.mark.integration
@pytest.mark.parametrize("notebook", EXPECTED_NOTEBOOKS)
def test_collection_distance_is_cosine(qdrant_url: str, notebook: str) -> None:
    """Each notebook collection uses Cosine distance metric."""
    client = QdrantClient(url=qdrant_url)
    info = client.get_collection(notebook)
    distance = info.config.params.vectors.distance  # type: ignore[union-attr]
    assert distance == EXPECTED_DISTANCE, (
        f"Collection '{notebook}' uses distance {distance}, expected {EXPECTED_DISTANCE}"
    )


# ---------------------------------------------------------------------------
# Idempotency — re-running init-qdrant.py must not error or recreate collections
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_init_qdrant_is_idempotent(qdrant_url: str) -> None:
    """Running init-qdrant.py a second time produces no errors."""
    import subprocess
    import os
    import pathlib

    import sys

    project_root = pathlib.Path(__file__).parents[3]
    env = {**os.environ, "QDRANT_URL": qdrant_url}

    result = subprocess.run(
        [sys.executable, str(project_root / "scripts" / "init-qdrant.py")],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0, (
        f"init-qdrant.py failed on second run:\n{result.stderr}"
    )
