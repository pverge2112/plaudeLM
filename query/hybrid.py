"""
Merge and re-rank module — combines Qdrant and Neo4j results.

Re-ranking formula (from ARCHITECTURE.md):
  - Qdrant-only:  score = qdrant_score × 0.6
  - Graph-only:   score = (1 / hop_distance) × 0.4
  - Both sources: score = (qdrant_score × 0.6) + (1 / hop_distance × 0.4)
"""

from __future__ import annotations

from dataclasses import dataclass, field

from graph import GraphResult
from rag import QdrantResult

_QDRANT_WEIGHT = 0.6
_GRAPH_WEIGHT = 0.4


@dataclass
class MergedResult:
    """A single deduplicated, re-ranked result combining Qdrant and/or graph signals."""

    chunk_id: str
    score: float
    payload: dict[str, object] = field(default_factory=dict)
    qdrant_score: float | None = None
    hop_distance: int | None = None


def merge_and_rerank(
    qdrant_results: list[QdrantResult],
    graph_results: list[GraphResult],
    top_k: int,
) -> list[MergedResult]:
    """Merge Qdrant and graph results, deduplicate by chunk_id, re-rank, return top-k.

    Deduplication: if a chunk appears in both sources, its score combines both components.
    Sorting: results are returned in descending score order.

    Args:
        qdrant_results: Scored chunks from Qdrant vector search.
        graph_results: Chunks found via Neo4j graph traversal with hop distances.
        top_k: Maximum number of results to return.

    Returns:
        List of MergedResult objects, sorted by score descending, capped at top_k.
    """
    # Index by chunk_id for merging
    qdrant_by_id: dict[str, QdrantResult] = {r.chunk_id: r for r in qdrant_results}
    graph_by_id: dict[str, GraphResult] = {}
    for gr in graph_results:
        # Keep the minimum hop_distance if the same chunk appears at multiple distances
        if gr.chunk_id not in graph_by_id or gr.hop_distance < graph_by_id[gr.chunk_id].hop_distance:
            graph_by_id[gr.chunk_id] = gr

    all_ids = set(qdrant_by_id) | set(graph_by_id)
    merged: list[MergedResult] = []

    for chunk_id in all_ids:
        qdrant_hit = qdrant_by_id.get(chunk_id)
        graph_hit = graph_by_id.get(chunk_id)

        qdrant_component = (qdrant_hit.score * _QDRANT_WEIGHT) if qdrant_hit else 0.0
        graph_component = ((1.0 / graph_hit.hop_distance) * _GRAPH_WEIGHT) if graph_hit else 0.0
        score = qdrant_component + graph_component

        merged.append(
            MergedResult(
                chunk_id=chunk_id,
                score=score,
                payload=qdrant_hit.payload if qdrant_hit else {},
                qdrant_score=qdrant_hit.score if qdrant_hit else None,
                hop_distance=graph_hit.hop_distance if graph_hit else None,
            )
        )

    merged.sort(key=lambda r: r.score, reverse=True)
    return merged[:top_k]
