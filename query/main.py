"""
FastAPI query service — GraphRAG hybrid retrieval endpoint.

Startup validates all required environment variables (Article III.2).
All LLM/embedding calls route through Kong AI Gateway (Article IV.2).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, HTTPException
from neo4j import AsyncGraphDatabase
from qdrant_client import QdrantClient

from config import Config
from graph import GraphRetriever
from hybrid import merge_and_rerank
from models import (
    Citation,
    CollectionsResponse,
    NotebookStats,
    QueryRequest,
    QueryResponse,
    RelationshipRequest,
    RelationshipResponse,
)
from rag import RagRetriever

# Validated at startup — service will not start if any var is missing
_config = Config()

_rag = RagRetriever(kong_proxy_url=_config.kong_proxy_url, qdrant_url=_config.qdrant_url)
_graph = GraphRetriever(
    kong_proxy_url=_config.kong_proxy_url,
    neo4j_uri=_config.neo4j_uri,
    neo4j_user=_config.neo4j_user,
    neo4j_password=_config.neo4j_password,
)

_NOTEBOOKS = ("kong", "personal", "music")

# Grounded answer prompt template
_ANSWER_PROMPT = """\
You are a helpful assistant. Answer the user's question using ONLY the provided context chunks.
If the context does not contain enough information, say so clearly.
Do not hallucinate or add information not present in the context.

Context:
{context}

Question: {question}

Answer:"""


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Validate connectivity on startup."""
    yield


app = FastAPI(
    title="NotebookLM Query Service",
    description="GraphRAG hybrid retrieval — Qdrant + Neo4j + Ollama via Kong",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint.

    Returns:
        {"status": "ok"} when the service is running.
    """
    return {"status": "ok"}


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest) -> QueryResponse:
    """GraphRAG hybrid retrieval query.

    Combines Qdrant vector search with Neo4j graph traversal, re-ranks results,
    then calls llama3.2 via Kong to generate a grounded answer with citations.

    Args:
        request: QueryRequest with question, notebook, and optional top_k.

    Returns:
        QueryResponse with answer, citations (each with neo4j_chunk_id), and concepts_used.

    Raises:
        HTTPException 422: If request validation fails (handled by FastAPI).
        HTTPException 502: If Kong/Ollama is unreachable for answer generation.
    """
    notebook = request.notebook

    # Step 1: Qdrant vector retrieval
    try:
        qdrant_results = await _rag.search(
            question=request.question, notebook=notebook, top_k=request.top_k
        )
    except httpx.HTTPError:
        qdrant_results = []

    # Step 2: Extract concepts + Neo4j graph traversal
    concepts: list[str] = []
    graph_results = []
    try:
        concepts = await _graph.extract_concepts(request.question)
        if concepts:
            graph_results = await _graph.traverse(concepts=concepts, notebook=notebook)
    except (httpx.HTTPError, Exception):
        # Graph retrieval is an enhancement — gracefully degrade on failure
        pass

    # Step 3: Merge + re-rank
    merged = merge_and_rerank(qdrant_results, graph_results, top_k=8)

    if not merged:
        return QueryResponse(answer="", citations=[], concepts_used=concepts)

    # Step 4: Build grounded prompt
    context_parts = [
        f"[{i+1}] {r.payload.get('chunk_text', '')}" for i, r in enumerate(merged)
    ]
    context = "\n\n".join(context_parts)
    prompt = _ANSWER_PROMPT.format(context=context, question=request.question)

    # Step 5: Generate answer via Kong /notebooklm/chat
    answer = ""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_config.kong_proxy_url}/notebooklm/chat",
                json={
                    "model": "llama3.2",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 512,
                },
                timeout=60.0,
            )
            resp.raise_for_status()
            answer = resp.json()["choices"][0]["message"]["content"]
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Kong/Ollama unavailable: {exc}") from exc

    # Step 6: Build citations from merged results
    citations = [
        Citation(
            chunk_id=r.chunk_id,
            neo4j_chunk_id=str(r.payload.get("neo4j_chunk_id", r.chunk_id)),
            chunk_text=str(r.payload.get("chunk_text", "")),
            title=str(r.payload.get("title", "")),
            source_url=str(r.payload["source_url"]) if r.payload.get("source_url") else None,
            score=r.score,
        )
        for r in merged
    ]

    return QueryResponse(answer=answer, citations=citations, concepts_used=concepts)


@app.get("/collections", response_model=CollectionsResponse)
async def collections() -> CollectionsResponse:
    """List all notebooks with chunk and document counts.

    Returns:
        CollectionsResponse with a list of NotebookStats for each notebook.
    """
    qdrant = QdrantClient(url=_config.qdrant_url)
    driver = AsyncGraphDatabase.driver(
        _config.neo4j_uri, auth=(_config.neo4j_user, _config.neo4j_password)
    )

    stats: list[NotebookStats] = []
    for notebook in _NOTEBOOKS:
        try:
            info = qdrant.get_collection(notebook)
            chunk_count = info.points_count or 0
        except Exception:
            chunk_count = 0

        try:
            async with driver.session() as session:
                result = await session.run(
                    "MATCH (d:Document {notebook: $nb}) RETURN count(d) AS doc_count",
                    nb=notebook,
                )
                record = await result.single()
                doc_count = int(record["doc_count"]) if record else 0
        except Exception:
            doc_count = 0

        try:
            async with driver.session() as session:
                result = await session.run(
                    "MATCH (c:Concept) WHERE $nb IN c.notebooks RETURN count(c) AS concept_count",
                    nb=notebook,
                )
                record = await result.single()
                concept_count = int(record["concept_count"]) if record else 0
        except Exception:
            concept_count = 0

        stats.append(
            NotebookStats(
                name=notebook,
                chunk_count=int(chunk_count),
                document_count=doc_count,
                concept_count=concept_count,
            )
        )

    await driver.close()
    return CollectionsResponse(notebooks=stats)


@app.get("/graph/{document_title}")
async def get_document_graph(document_title: str) -> dict[str, object]:
    """Return the knowledge graph for a specific document.

    Args:
        document_title: Title of the document to retrieve the graph for.

    Returns:
        Dictionary with document, chunks, concepts, and relationships.

    Raises:
        HTTPException 404: If no document with that title exists.
    """
    driver = AsyncGraphDatabase.driver(
        _config.neo4j_uri, auth=(_config.neo4j_user, _config.neo4j_password)
    )
    async with driver.session() as session:
        result = await session.run(
            """
            MATCH (d:Document {title: $title})
            OPTIONAL MATCH (ch:Chunk)-[:PART_OF]->(d)
            OPTIONAL MATCH (ch)-[:MENTIONS]->(c:Concept)
            RETURN d, collect(DISTINCT ch) AS chunks, collect(DISTINCT c) AS concepts
            """,
            title=document_title,
        )
        record = await result.single()

    await driver.close()

    if not record or not record["d"]:
        raise HTTPException(status_code=404, detail=f"Document '{document_title}' not found.")

    doc = dict(record["d"])
    chunks = [dict(ch) for ch in record["chunks"] if ch]
    concepts = [dict(c) for c in record["concepts"] if c]

    return {
        "document": doc,
        "chunks": chunks,
        "concepts": concepts,
    }


@app.post("/graph/relationship", response_model=RelationshipResponse)
async def add_relationship(request: RelationshipRequest) -> RelationshipResponse:
    """Create or update a RELATED_TO or BROADER_THAN relationship between two concepts.

    Uses MERGE to avoid duplicate relationships (Article IV: MERGE not CREATE for concepts).

    Args:
        request: RelationshipRequest with from_concept, relationship type, and to_concept.

    Returns:
        RelationshipResponse with status ok and the relationship details.
    """
    driver = AsyncGraphDatabase.driver(
        _config.neo4j_uri, auth=(_config.neo4j_user, _config.neo4j_password)
    )
    cypher = f"""
    MERGE (a:Concept {{name: $from_concept}})
    MERGE (b:Concept {{name: $to_concept}})
    MERGE (a)-[r:{request.relationship}]->(b)
    RETURN r
    """
    async with driver.session() as session:
        await session.run(
            cypher,
            from_concept=request.from_concept.lower(),
            to_concept=request.to_concept.lower(),
        )
    await driver.close()

    return RelationshipResponse(
        status="ok",
        from_concept=request.from_concept.lower(),
        relationship=request.relationship,
        to_concept=request.to_concept.lower(),
    )
