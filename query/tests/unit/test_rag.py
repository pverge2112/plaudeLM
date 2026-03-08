"""
Unit tests for query/rag.py — vector retrieval module.

All external dependencies (httpx, QdrantClient) are mocked.
Tests read as specifications: they describe desired behavior, not implementation.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from rag import QdrantResult, RagRetriever


class TestEmbedQuestion:
    async def test_embed_question_sends_correct_payload_to_kong(self) -> None:
        """embed_question POSTs to /plaudelm/embed with the question as the input field."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"data": [{"embedding": [0.1] * 768}]}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("rag.httpx.AsyncClient", return_value=mock_client):
            retriever = RagRetriever(
                kong_proxy_url="http://kong:8000", qdrant_url="http://qdrant:6333"
            )
            result = await retriever.embed_question("What is GraphRAG?")

        call_args = mock_client.post.call_args
        assert call_args[0][0] == "http://kong:8000/plaudelm/embed"
        assert call_args[1]["json"]["input"] == "What is GraphRAG?"
        assert result == [0.1] * 768

    async def test_embed_question_raises_on_kong_unavailable(self) -> None:
        """embed_question propagates httpx errors — never swallows exceptions."""
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("connection refused"))

        with patch("rag.httpx.AsyncClient", return_value=mock_client):
            retriever = RagRetriever(
                kong_proxy_url="http://kong:8000", qdrant_url="http://qdrant:6333"
            )
            with pytest.raises(httpx.ConnectError):
                await retriever.embed_question("test question")


class TestVectorSearch:
    async def test_vector_search_scopes_query_to_requested_notebook_collection(self) -> None:
        """vector_search searches only the requested notebook's Qdrant collection."""
        mock_qdrant = MagicMock()
        mock_qdrant.search = MagicMock(return_value=[])

        with patch("rag.QdrantClient", return_value=mock_qdrant):
            retriever = RagRetriever(
                kong_proxy_url="http://kong:8000", qdrant_url="http://qdrant:6333"
            )
            retriever.embed_question = AsyncMock(return_value=[0.1] * 768)
            await retriever.search(question="test", notebook="kong", top_k=5)

        call_kwargs = mock_qdrant.search.call_args[1]
        assert call_kwargs["collection_name"] == "kong"

    async def test_vector_search_does_not_query_other_notebooks(self) -> None:
        """Querying 'personal' must not query 'kong' or 'music' collections."""
        mock_qdrant = MagicMock()
        mock_qdrant.search = MagicMock(return_value=[])

        with patch("rag.QdrantClient", return_value=mock_qdrant):
            retriever = RagRetriever(
                kong_proxy_url="http://kong:8000", qdrant_url="http://qdrant:6333"
            )
            retriever.embed_question = AsyncMock(return_value=[0.1] * 768)
            await retriever.search(question="test", notebook="personal", top_k=5)

        assert mock_qdrant.search.call_count == 1
        call_kwargs = mock_qdrant.search.call_args[1]
        assert call_kwargs["collection_name"] == "personal"

    async def test_vector_search_returns_empty_list_when_no_matches(self) -> None:
        """vector_search returns [] when Qdrant finds no matching chunks (not an error)."""
        mock_qdrant = MagicMock()
        mock_qdrant.search = MagicMock(return_value=[])

        with patch("rag.QdrantClient", return_value=mock_qdrant):
            retriever = RagRetriever(
                kong_proxy_url="http://kong:8000", qdrant_url="http://qdrant:6333"
            )
            retriever.embed_question = AsyncMock(return_value=[0.1] * 768)
            results = await retriever.search(question="nothing matches", notebook="music", top_k=5)

        assert results == []

    async def test_vector_search_returns_qdrant_results_with_correct_shape(self) -> None:
        """vector_search maps Qdrant ScoredPoint to QdrantResult with chunk_id, score, payload."""
        mock_point = MagicMock()
        mock_point.id = "abc-def-123"
        mock_point.score = 0.95
        mock_point.payload = {
            "chunk_text": "GraphRAG combines vector search with graph traversal.",
            "neo4j_chunk_id": "abc-def-123",
            "title": "GraphRAG Overview",
        }

        mock_qdrant = MagicMock()
        mock_qdrant.search = MagicMock(return_value=[mock_point])

        with patch("rag.QdrantClient", return_value=mock_qdrant):
            retriever = RagRetriever(
                kong_proxy_url="http://kong:8000", qdrant_url="http://qdrant:6333"
            )
            retriever.embed_question = AsyncMock(return_value=[0.1] * 768)
            results = await retriever.search(question="GraphRAG", notebook="personal", top_k=5)

        assert len(results) == 1
        assert results[0].chunk_id == "abc-def-123"
        assert results[0].score == 0.95
        assert results[0].payload["chunk_text"] == "GraphRAG combines vector search with graph traversal."

    async def test_vector_search_passes_top_k_limit_to_qdrant(self) -> None:
        """vector_search passes the top_k parameter as the limit to Qdrant."""
        mock_qdrant = MagicMock()
        mock_qdrant.search = MagicMock(return_value=[])

        with patch("rag.QdrantClient", return_value=mock_qdrant):
            retriever = RagRetriever(
                kong_proxy_url="http://kong:8000", qdrant_url="http://qdrant:6333"
            )
            retriever.embed_question = AsyncMock(return_value=[0.1] * 768)
            await retriever.search(question="test", notebook="kong", top_k=3)

        call_kwargs = mock_qdrant.search.call_args[1]
        assert call_kwargs["limit"] == 3
