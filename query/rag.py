"""
Vector retrieval module — Qdrant-based RAG.

Embeds questions via Kong /notebooklm/embed (nomic-embed-text),
then searches the appropriate Qdrant collection.
All LLM/embedding calls route through Kong (Article IV.2).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import httpx
from qdrant_client import QdrantClient


@dataclass
class QdrantResult:
    """A single result from Qdrant vector search."""

    chunk_id: str
    score: float
    payload: dict[str, object] = field(default_factory=dict)


class RagRetriever:
    """Handles question embedding and Qdrant vector search."""

    def __init__(self, kong_proxy_url: str, qdrant_url: str) -> None:
        self._kong_proxy_url = kong_proxy_url
        self._qdrant_url = qdrant_url

    async def embed_question(self, question: str) -> list[float]:
        """Embed a question via Kong /notebooklm/embed.

        Args:
            question: The question text to embed.

        Returns:
            768-dimensional float vector.

        Raises:
            httpx.HTTPError: If the Kong/Ollama request fails.
        """
        url = f"{self._kong_proxy_url}/notebooklm/embed"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={"input": question, "model": "nomic-embed-text"},
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            return list(data["data"][0]["embedding"])

    async def search(
        self, question: str, notebook: str, top_k: int
    ) -> list[QdrantResult]:
        """Embed question and search Qdrant for the top-k most similar chunks.

        Args:
            question: The question to embed and search for.
            notebook: Qdrant collection name (scopes search to this notebook).
            top_k: Maximum number of results to return.

        Returns:
            List of QdrantResult objects, sorted by score descending.
        """
        vector = await self.embed_question(question)
        qdrant = QdrantClient(url=self._qdrant_url)
        points = qdrant.search(
            collection_name=notebook,
            query_vector=vector,
            limit=top_k,
            with_payload=True,
        )
        return [
            QdrantResult(
                chunk_id=str(p.id),
                score=float(p.score),
                payload=dict(p.payload) if p.payload else {},
            )
            for p in points
        ]
