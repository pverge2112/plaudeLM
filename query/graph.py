"""
Knowledge graph retrieval module — Neo4j-based graph traversal.

Extracts concepts from questions via Kong /notebooklm/chat (llama3.2),
then traverses the Neo4j knowledge graph to find related chunks.
All LLM calls route through Kong (Article IV.2).
Neo4j access uses AsyncGraphDatabase driver (Article III.5).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

import httpx
from neo4j import AsyncGraphDatabase


def hop_score(hop_distance: int) -> float:
    """Score contribution for a graph result at a given hop distance.

    Formula: 1 / hop_distance
    - hop 1 (direct concept match): 1.0
    - hop 2 (one degree of separation): 0.5
    - hop 3 (two degrees of separation): 0.333...

    Args:
        hop_distance: Number of hops from a matched Concept to the Chunk.

    Returns:
        Float score in range (0, 1].
    """
    return 1.0 / hop_distance


@dataclass
class GraphResult:
    """A single result from Neo4j graph traversal."""

    chunk_id: str
    hop_distance: int


class GraphRetriever:
    """Handles concept extraction and Neo4j knowledge graph traversal."""

    # Cypher to find chunks connected to matched concepts within the given notebook.
    # Traverses up to 2 hops: Concept -[:RELATED_TO*0..1]-> Concept -[:MENTIONS]<- Chunk
    _TRAVERSAL_CYPHER = """
    MATCH (concept:Concept)
    WHERE concept.name IN $concepts
    MATCH (chunk:Chunk)-[:MENTIONS]->(concept)
    WHERE chunk.notebook = $notebook
    RETURN chunk.id AS chunk_id, 1 AS hop_distance

    UNION

    MATCH (concept:Concept)
    WHERE concept.name IN $concepts
    MATCH (concept)-[:RELATED_TO]->(related:Concept)
    MATCH (chunk:Chunk)-[:MENTIONS]->(related)
    WHERE chunk.notebook = $notebook
    RETURN chunk.id AS chunk_id, 2 AS hop_distance
    """

    def __init__(
        self,
        kong_proxy_url: str,
        neo4j_uri: str,
        neo4j_user: str,
        neo4j_password: str,
    ) -> None:
        self._kong_proxy_url = kong_proxy_url
        self._neo4j_uri = neo4j_uri
        self._neo4j_user = neo4j_user
        self._neo4j_password = neo4j_password

    async def extract_concepts(self, question: str) -> list[str]:
        """Extract key concepts from a question via Kong /notebooklm/chat.

        Uses llama3.2 with a structured prompt that returns a JSON array of
        concept strings. Falls back to [] on malformed or non-JSON responses
        (graceful degradation — graph retrieval is optional enhancement).

        Args:
            question: The question to extract concepts from.

        Returns:
            List of concept strings (normalized lowercase by the LLM prompt).
            Returns [] on any parsing failure — never raises.
        """
        prompt = (
            "Extract the key concepts from the following question as a JSON array of strings. "
            "Return ONLY the JSON array, no explanation. "
            "Normalize concepts to lowercase. "
            "Example: [\"graphrag\", \"vector search\", \"neo4j\"]\n\n"
            f"Question: {question}"
        )
        url = f"{self._kong_proxy_url}/notebooklm/chat"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={
                    "model": "llama3.2",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.0,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]

        # Extract JSON array — find first [...] block in case of extra text
        match = re.search(r"\[.*?\]", content, re.DOTALL)
        if not match:
            return []
        try:
            concepts = json.loads(match.group(0))
            if isinstance(concepts, list):
                return [str(c).lower() for c in concepts if c]
            return []
        except (json.JSONDecodeError, ValueError):
            return []

    async def traverse(self, concepts: list[str], notebook: str) -> list[GraphResult]:
        """Traverse the Neo4j graph from matched concepts to find related chunks.

        Searches up to 2 hops from each concept, scoped to the given notebook.
        Returns empty list immediately if concepts is empty (no DB call made).

        Args:
            concepts: Concept names to start traversal from.
            notebook: Notebook scope — only chunks with this notebook property are returned.

        Returns:
            List of GraphResult objects with chunk_id and hop_distance.
            Returns [] when no concepts match — never raises on empty results.
        """
        if not concepts:
            return []

        driver = AsyncGraphDatabase.driver(
            self._neo4j_uri,
            auth=(self._neo4j_user, self._neo4j_password),
        )
        async with driver.session() as session:
            result = await session.run(
                self._TRAVERSAL_CYPHER,
                concepts=concepts,
                notebook=notebook,
            )
            records = result.data()

        await driver.close()

        return [
            GraphResult(chunk_id=str(r["chunk_id"]), hop_distance=int(r["hop_distance"]))
            for r in records
        ]
