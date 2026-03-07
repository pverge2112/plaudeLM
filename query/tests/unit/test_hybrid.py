"""
Unit tests for query/hybrid.py — merge and re-rank logic.

Pure logic module: no external dependencies, no mocking required.
Tests read as specifications: they describe desired behavior, not implementation.
"""

from __future__ import annotations

import pytest

from graph import GraphResult
from hybrid import MergedResult, merge_and_rerank
from rag import QdrantResult


def _qdrant(
    chunk_id: str,
    score: float,
    chunk_text: str = "some chunk text",
    title: str = "Test Doc",
) -> QdrantResult:
    return QdrantResult(
        chunk_id=chunk_id,
        score=score,
        payload={
            "chunk_text": chunk_text,
            "title": title,
            "neo4j_chunk_id": chunk_id,
        },
    )


def _graph(chunk_id: str, hop_distance: int) -> GraphResult:
    return GraphResult(chunk_id=chunk_id, hop_distance=hop_distance)


class TestMergeAndRerank:
    def test_merge_deduplicates_chunk_present_in_both_sources(self) -> None:
        """A chunk in both Qdrant and graph results appears exactly once in output."""
        qdrant = [_qdrant("chunk-1", 0.9)]
        graph = [_graph("chunk-1", 1)]
        results = merge_and_rerank(qdrant, graph, top_k=5)
        assert len(results) == 1

    def test_qdrant_only_chunk_score_uses_60_percent_weight(self) -> None:
        """Qdrant-only chunks: final_score = qdrant_score × 0.6"""
        qdrant = [_qdrant("chunk-1", 1.0)]
        results = merge_and_rerank(qdrant, [], top_k=5)
        assert results[0].score == pytest.approx(0.6)

    def test_qdrant_only_chunk_score_scales_proportionally(self) -> None:
        """Qdrant-only: score = qdrant_score × 0.6 for any input score."""
        qdrant = [_qdrant("chunk-1", 0.5)]
        results = merge_and_rerank(qdrant, [], top_k=5)
        assert results[0].score == pytest.approx(0.3)

    def test_graph_only_chunk_score_at_hop_1_is_0_4(self) -> None:
        """Graph-only at hop 1: final_score = (1/1) × 0.4 = 0.4"""
        graph = [_graph("chunk-1", 1)]
        results = merge_and_rerank([], graph, top_k=5)
        assert results[0].score == pytest.approx(0.4)

    def test_graph_only_chunk_score_at_hop_2_is_0_2(self) -> None:
        """Graph-only at hop 2: final_score = (1/2) × 0.4 = 0.2"""
        graph = [_graph("chunk-1", 2)]
        results = merge_and_rerank([], graph, top_k=5)
        assert results[0].score == pytest.approx(0.2)

    def test_combined_chunk_score_adds_both_components(self) -> None:
        """Combined: final_score = (qdrant_score × 0.6) + (1/hop_distance × 0.4)"""
        qdrant = [_qdrant("chunk-1", 0.8)]
        graph = [_graph("chunk-1", 2)]
        results = merge_and_rerank(qdrant, graph, top_k=5)
        expected = (0.8 * 0.6) + (1 / 2 * 0.4)
        assert results[0].score == pytest.approx(expected)

    def test_combined_chunk_at_hop_1_full_formula(self) -> None:
        """Combined at hop 1: final_score = (qdrant_score × 0.6) + (1.0 × 0.4)"""
        qdrant = [_qdrant("chunk-1", 0.9)]
        graph = [_graph("chunk-1", 1)]
        results = merge_and_rerank(qdrant, graph, top_k=5)
        expected = (0.9 * 0.6) + (1.0 * 0.4)
        assert results[0].score == pytest.approx(expected)

    def test_rerank_returns_results_sorted_by_score_descending(self) -> None:
        """Results are ordered highest score first."""
        qdrant = [
            _qdrant("chunk-low", 0.3),
            _qdrant("chunk-high", 0.9),
            _qdrant("chunk-mid", 0.6),
        ]
        results = merge_and_rerank(qdrant, [], top_k=10)
        scores = [r.score for r in results]
        assert scores == sorted(scores, reverse=True)
        assert results[0].chunk_id == "chunk-high"

    def test_rerank_respects_top_k_limit(self) -> None:
        """Only top_k results are returned even when more candidates exist."""
        qdrant = [_qdrant(f"chunk-{i}", float(i) / 10) for i in range(10)]
        results = merge_and_rerank(qdrant, [], top_k=3)
        assert len(results) == 3

    def test_rerank_returns_all_when_fewer_than_top_k(self) -> None:
        """When fewer candidates than top_k, all results are returned."""
        qdrant = [_qdrant("chunk-1", 0.8), _qdrant("chunk-2", 0.5)]
        results = merge_and_rerank(qdrant, [], top_k=10)
        assert len(results) == 2

    def test_merge_returns_empty_when_both_sources_empty(self) -> None:
        """merge_and_rerank returns [] when both Qdrant and graph results are empty."""
        results = merge_and_rerank([], [], top_k=5)
        assert results == []

    def test_merged_result_preserves_payload_from_qdrant(self) -> None:
        """MergedResult includes the full Qdrant payload for building citations."""
        qdrant = [_qdrant("chunk-1", 0.8, chunk_text="Hello world", title="Doc A")]
        results = merge_and_rerank(qdrant, [], top_k=5)
        assert results[0].payload["chunk_text"] == "Hello world"
        assert results[0].payload["title"] == "Doc A"

    def test_merged_result_has_correct_chunk_id(self) -> None:
        """MergedResult.chunk_id matches the source chunk_id from Qdrant/graph."""
        qdrant = [_qdrant("my-chunk-uuid", 0.7)]
        results = merge_and_rerank(qdrant, [], top_k=5)
        assert results[0].chunk_id == "my-chunk-uuid"
