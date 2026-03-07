"""
Unit tests for query/graph.py — Neo4j knowledge graph retrieval module.

All external dependencies (httpx, AsyncGraphDatabase) are mocked.
Tests read as specifications: they describe desired behavior, not implementation.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from graph import GraphResult, GraphRetriever, hop_score


class TestExtractConcepts:
    async def test_extract_concepts_posts_to_kong_chat_endpoint(self) -> None:
        """extract_concepts POSTs to /notebooklm/chat with a concept-extraction prompt."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": '["GraphRAG", "Neo4j", "Qdrant"]'}}]
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("graph.httpx.AsyncClient", return_value=mock_client):
            retriever = GraphRetriever(
                kong_proxy_url="http://kong:8000",
                neo4j_uri="bolt://neo4j:7687",
                neo4j_user="neo4j",
                neo4j_password="pass",
            )
            concepts = await retriever.extract_concepts("What is GraphRAG?")

        call_args = mock_client.post.call_args
        assert call_args[0][0] == "http://kong:8000/notebooklm/chat"
        assert "GraphRAG" in concepts
        assert "Neo4j" in concepts

    async def test_extract_concepts_returns_empty_list_on_malformed_json(self) -> None:
        """extract_concepts returns [] when the LLM returns non-JSON (graceful degradation)."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "I cannot extract concepts from this text."}}]
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("graph.httpx.AsyncClient", return_value=mock_client):
            retriever = GraphRetriever(
                kong_proxy_url="http://kong:8000",
                neo4j_uri="bolt://neo4j:7687",
                neo4j_user="neo4j",
                neo4j_password="pass",
            )
            concepts = await retriever.extract_concepts("ambiguous question")

        assert concepts == []

    async def test_extract_concepts_returns_empty_list_on_empty_array_response(self) -> None:
        """extract_concepts returns [] when LLM returns an empty JSON array."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "[]"}}]
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("graph.httpx.AsyncClient", return_value=mock_client):
            retriever = GraphRetriever(
                kong_proxy_url="http://kong:8000",
                neo4j_uri="bolt://neo4j:7687",
                neo4j_user="neo4j",
                neo4j_password="pass",
            )
            concepts = await retriever.extract_concepts("vague question")

        assert concepts == []


class TestGraphTraversal:
    async def test_graph_traversal_returns_chunks_with_hop_distance(self) -> None:
        """traverse returns GraphResult objects with chunk_id and hop_distance."""
        mock_record = {"chunk_id": "chunk-uuid-1", "hop_distance": 1}

        mock_result = MagicMock()
        mock_result.data = MagicMock(return_value=[mock_record])

        mock_session = AsyncMock()
        mock_session.run = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        mock_driver = MagicMock()
        mock_driver.session = MagicMock(return_value=mock_session)

        with patch("graph.AsyncGraphDatabase.driver", return_value=mock_driver):
            retriever = GraphRetriever(
                kong_proxy_url="http://kong:8000",
                neo4j_uri="bolt://neo4j:7687",
                neo4j_user="neo4j",
                neo4j_password="pass",
            )
            results = await retriever.traverse(concepts=["GraphRAG"], notebook="personal")

        assert len(results) == 1
        assert results[0].chunk_id == "chunk-uuid-1"
        assert results[0].hop_distance == 1

    async def test_graph_traversal_scopes_query_to_notebook(self) -> None:
        """traverse passes the notebook parameter to filter chunks by notebook property."""
        mock_result = MagicMock()
        mock_result.data = MagicMock(return_value=[])

        mock_session = AsyncMock()
        mock_session.run = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        mock_driver = MagicMock()
        mock_driver.session = MagicMock(return_value=mock_session)

        with patch("graph.AsyncGraphDatabase.driver", return_value=mock_driver):
            retriever = GraphRetriever(
                kong_proxy_url="http://kong:8000",
                neo4j_uri="bolt://neo4j:7687",
                neo4j_user="neo4j",
                neo4j_password="pass",
            )
            await retriever.traverse(concepts=["Kong"], notebook="kong")

        call_kwargs = mock_session.run.call_args[1]
        assert call_kwargs.get("notebook") == "kong"

    async def test_graph_traversal_returns_empty_list_when_no_concepts_matched(self) -> None:
        """traverse returns [] when no Concept nodes match — not an error."""
        mock_result = MagicMock()
        mock_result.data = MagicMock(return_value=[])

        mock_session = AsyncMock()
        mock_session.run = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        mock_driver = MagicMock()
        mock_driver.session = MagicMock(return_value=mock_session)

        with patch("graph.AsyncGraphDatabase.driver", return_value=mock_driver):
            retriever = GraphRetriever(
                kong_proxy_url="http://kong:8000",
                neo4j_uri="bolt://neo4j:7687",
                neo4j_user="neo4j",
                neo4j_password="pass",
            )
            results = await retriever.traverse(
                concepts=["xyzzy-nonexistent-concept-abc"], notebook="personal"
            )

        assert results == []

    async def test_graph_traversal_returns_empty_list_when_no_concepts_given(self) -> None:
        """traverse returns [] immediately when given an empty concepts list."""
        mock_driver = MagicMock()

        with patch("graph.AsyncGraphDatabase.driver", return_value=mock_driver):
            retriever = GraphRetriever(
                kong_proxy_url="http://kong:8000",
                neo4j_uri="bolt://neo4j:7687",
                neo4j_user="neo4j",
                neo4j_password="pass",
            )
            results = await retriever.traverse(concepts=[], notebook="personal")

        assert results == []
        # No DB call should be made for empty concept list
        mock_driver.session.assert_not_called()


class TestHopScore:
    def test_hop_score_is_1_at_hop_1(self) -> None:
        """hop_score(1) returns 1.0 — direct concept connection."""
        assert hop_score(1) == pytest.approx(1.0)

    def test_hop_score_is_half_at_hop_2(self) -> None:
        """hop_score(2) returns 0.5 — one degree of separation."""
        assert hop_score(2) == pytest.approx(0.5)

    def test_hop_score_is_one_third_at_hop_3(self) -> None:
        """hop_score(3) returns 1/3 — two degrees of separation."""
        assert hop_score(3) == pytest.approx(1 / 3)
