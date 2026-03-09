"""
Startup configuration — validates all required environment variables.

Fails fast with a clear error if any required variable is missing.
Never allows the service to start in a partially-configured state (Article III.2).
"""

from __future__ import annotations

import os


def _require(key: str) -> str:
    val = os.environ.get(key)
    if not val:
        raise RuntimeError(
            f"Required environment variable '{key}' is not set. "
            "Set it before starting the service."
        )
    return val


class Config:
    """Validated service configuration loaded from environment variables."""

    qdrant_url: str
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str
    kong_proxy_url: str
    audio_output_dir: str

    def __init__(self) -> None:
        self.qdrant_url = _require("QDRANT_URL")
        self.neo4j_uri = _require("NEO4J_URI")
        self.neo4j_user = _require("NEO4J_USER")
        self.neo4j_password = _require("NEO4J_PASSWORD")
        self.kong_proxy_url = _require("KONG_PROXY_URL")
        self.audio_output_dir = _require("AUDIO_OUTPUT_DIR")
        # Create audio output directory if it doesn't exist (Docker volume may not pre-create)
        os.makedirs(self.audio_output_dir, exist_ok=True)
