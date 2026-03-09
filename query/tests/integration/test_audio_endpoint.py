"""
Integration tests for POST /audio-overview — Spec #7.

Tests exercise the FastAPI app via TestClient against real Qdrant + Kong/Azure services.
Requires the full stack to be running (Qdrant, Kong/Azure reachable).

Environment variables required:
  TEST_QDRANT_URL        http://localhost:6333
  TEST_NEO4J_URI         bolt://localhost:7687
  TEST_NEO4J_PASSWORD    <password>

Optional:
  TEST_KONG_PROXY_URL    http://localhost:8000
  TEST_AUDIO_OUTPUT_DIR  /tmp/test-audio-integration (defaults to temp dir)

Run with: pytest tests/integration/test_audio_endpoint.py -m integration -v
"""

from __future__ import annotations

import os
import tempfile

import pytest
from fastapi.testclient import TestClient


def _set_service_env_from_test_env() -> bool:
    """Copy TEST_* vars into service env vars. Returns False if required vars missing."""
    required = {
        "QDRANT_URL": os.environ.get("TEST_QDRANT_URL", ""),
        "NEO4J_URI": os.environ.get("TEST_NEO4J_URI", ""),
        "NEO4J_PASSWORD": os.environ.get("TEST_NEO4J_PASSWORD", ""),
    }
    if not all(required.values()):
        return False

    os.environ.setdefault("QDRANT_URL", required["QDRANT_URL"])
    os.environ.setdefault("NEO4J_URI", required["NEO4J_URI"])
    os.environ.setdefault("NEO4J_USER", os.environ.get("TEST_NEO4J_USER", "neo4j"))
    os.environ.setdefault("NEO4J_PASSWORD", required["NEO4J_PASSWORD"])
    os.environ.setdefault(
        "KONG_PROXY_URL", os.environ.get("TEST_KONG_PROXY_URL", "http://localhost:8000")
    )
    return True


@pytest.fixture(scope="module")
def client() -> TestClient:
    """Create a TestClient with a temp audio output directory."""
    if not _set_service_env_from_test_env():
        pytest.skip("Required TEST_* environment variables not set")

    # Use a temp dir for audio output during tests — never uses production volume
    audio_dir = os.environ.get("TEST_AUDIO_OUTPUT_DIR", tempfile.mkdtemp(prefix="plaudelm-audio-test-"))
    os.environ.setdefault("AUDIO_OUTPUT_DIR", audio_dir)
    os.makedirs(audio_dir, exist_ok=True)

    import importlib
    import main as main_module
    importlib.reload(main_module)
    from main import app
    return TestClient(app)


@pytest.mark.integration
class TestAudioOverviewEndpoint:
    def test_audio_overview_returns_200_with_valid_notebook_and_topic(
        self, client: TestClient
    ) -> None:
        """POST /audio-overview returns 200 with script, audio_path, duration_seconds."""
        resp = client.post(
            "/audio-overview",
            json={"notebook": "kong", "topic": "rate limiting"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "script" in body
        assert "audio_path" in body
        assert "duration_seconds" in body

    @pytest.mark.integration
    def test_audio_overview_script_at_least_200_chars(self, client: TestClient) -> None:
        """POST /audio-overview script field has at least 200 characters."""
        resp = client.post(
            "/audio-overview",
            json={"notebook": "kong", "topic": "rate limiting"},
        )
        assert resp.status_code == 200
        assert len(resp.json()["script"]) >= 200

    @pytest.mark.integration
    def test_audio_overview_rejects_invalid_notebook(self, client: TestClient) -> None:
        """POST /audio-overview returns 422 for invalid notebook value."""
        resp = client.post(
            "/audio-overview",
            json={"notebook": "invalid_notebook", "topic": "anything"},
        )
        assert resp.status_code == 422

    @pytest.mark.integration
    def test_audio_overview_returns_404_when_no_chunks_for_topic(
        self, client: TestClient
    ) -> None:
        """POST /audio-overview returns 404 when no chunks match the topic."""
        resp = client.post(
            "/audio-overview",
            json={"notebook": "kong", "topic": "zzz_nonexistent_topic_xyz_12345"},
        )
        assert resp.status_code == 404
        assert "zzz_nonexistent_topic_xyz_12345" in resp.json()["detail"]

    @pytest.mark.integration
    def test_audio_overview_audio_file_exists_on_disk(self, client: TestClient) -> None:
        """POST /audio-overview audio_path points to a real file that exists on disk."""
        resp = client.post(
            "/audio-overview",
            json={"notebook": "kong", "topic": "rate limiting"},
        )
        assert resp.status_code == 200
        audio_path = resp.json()["audio_path"]
        assert os.path.exists(audio_path), f"Audio file not found: {audio_path}"
