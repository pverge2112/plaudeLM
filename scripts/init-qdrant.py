#!/usr/bin/env python3
"""
init-qdrant.py — Initialize Qdrant collections for Personal NotebookLM.

Creates the kong, personal, and music collections with 768-dim Cosine vectors
(nomic-embed-text). Safe to re-run — existing collections are left unchanged
(idempotent).

Required environment variables:
  QDRANT_URL   Qdrant REST URL (e.g. http://localhost:6333)

Usage:
  python3 scripts/init-qdrant.py
"""

import os
import sys

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams


# ---------------------------------------------------------------------------
# Environment validation — fail fast with clear error (CONSTITUTION III.2)
# ---------------------------------------------------------------------------


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"ERROR: required environment variable '{name}' is not set.", file=sys.stderr)
        sys.exit(1)
    return value


# ---------------------------------------------------------------------------
# Collection configuration (ARCHITECTURE.md)
# ---------------------------------------------------------------------------

NOTEBOOKS: list[str] = ["kong", "personal", "music"]
VECTOR_SIZE: int = 768
DISTANCE: Distance = Distance.COSINE


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


def init(client: QdrantClient) -> None:
    existing = {c.name for c in client.get_collections().collections}

    for notebook in NOTEBOOKS:
        if notebook in existing:
            print(f"  [skip] '{notebook}' already exists")
            continue

        client.create_collection(
            collection_name=notebook,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=DISTANCE),
        )
        print(f"  [created] '{notebook}' (size={VECTOR_SIZE}, distance={DISTANCE})")


def verify(client: QdrantClient) -> None:
    """Print a summary of collection configs for confirmation."""
    print(f"\nVerification: {len(NOTEBOOKS)} collection(s) expected")
    for notebook in NOTEBOOKS:
        info = client.get_collection(notebook)
        vectors = info.config.params.vectors
        size = vectors.size  # type: ignore[union-attr]
        distance = vectors.distance  # type: ignore[union-attr]
        count = info.points_count
        print(f"  {notebook}: size={size}, distance={distance}, points={count}")


def main() -> None:
    qdrant_url = _require_env("QDRANT_URL")

    print(f"Connecting to Qdrant at {qdrant_url}...")
    client = QdrantClient(url=qdrant_url)

    try:
        client.get_collections()  # connectivity check
        print("Connected.\n")
        print("Creating collections...")
        init(client)
        verify(client)
        print("\nDone — Qdrant initialized successfully.")
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
