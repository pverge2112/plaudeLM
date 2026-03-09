"""
Pydantic v2 data models for the query service.

These are the source of truth for all request/response schemas.
MCP tool schemas (Zod, Spec #4) must conform to these models.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Notebook = Literal["kong", "personal", "music"]


class QueryRequest(BaseModel):
    question: str = Field(..., description="The question to answer using the knowledge base.")
    notebook: Notebook = Field(..., description="The notebook to query (scopes retrieval).")
    top_k: int = Field(default=5, ge=1, le=20, description="Maximum chunks to retrieve.")


class Citation(BaseModel):
    chunk_id: str = Field(..., description="Qdrant point ID / Neo4j Chunk.id.")
    neo4j_chunk_id: str = Field(..., description="Neo4j Chunk node ID (same as chunk_id).")
    chunk_text: str = Field(..., description="The raw chunk text used as context.")
    title: str = Field(..., description="Source document title.")
    source_url: str | None = Field(default=None, description="Original source URL if available.")
    score: float = Field(..., description="Hybrid re-rank score (0.0–1.0+).")


class QueryResponse(BaseModel):
    answer: str = Field(..., description="LLM-generated answer grounded in retrieved chunks.")
    citations: list[Citation] = Field(
        default_factory=list, description="Chunks used to generate the answer."
    )
    concepts_used: list[str] = Field(
        default_factory=list, description="Neo4j Concept names used during graph traversal."
    )


class NotebookStats(BaseModel):
    name: str
    chunk_count: int
    document_count: int
    concept_count: int


class CollectionsResponse(BaseModel):
    notebooks: list[NotebookStats]


class RelationshipRequest(BaseModel):
    from_concept: str = Field(..., description="Source concept name (normalized lowercase).")
    relationship: Literal["RELATED_TO", "BROADER_THAN"] = Field(
        ..., description="Relationship type."
    )
    to_concept: str = Field(..., description="Target concept name (normalized lowercase).")
    notebook: Notebook | None = Field(
        default=None, description="Optional notebook scope for the relationship."
    )


class RelationshipResponse(BaseModel):
    status: Literal["ok"]
    from_concept: str
    relationship: str
    to_concept: str


# ---------------------------------------------------------------------------
# Audio Overview — Spec #7
# Schema derived from MCP Zod source of truth in mcp/src/tools/audio.ts
# (Article IV.6 — schema-first)
# ---------------------------------------------------------------------------


class AudioOverviewRequest(BaseModel):
    notebook: Notebook = Field(..., description="Notebook to retrieve content from.")
    topic: str = Field(..., min_length=1, description="Topic for the podcast overview.")


class AudioOverviewResponse(BaseModel):
    script: str = Field(
        ...,
        min_length=200,
        description="Podcast script (host + guest dialogue, ≥ 200 chars).",
    )
    audio_path: str = Field(
        ..., min_length=1, description="Absolute path to generated WAV file."
    )
    duration_seconds: float = Field(
        ..., gt=0, description="Duration of the audio file in seconds."
    )
