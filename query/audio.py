"""
audio.py — Podcast script generation + TTS synthesis (Spec #7).

Orchestrates:
1. Topic embedding via Kong /plaudelm/embed
2. Qdrant top-K chunk retrieval (scoped to notebook)
3. LLM script generation via Kong /plaudelm/chat (host + guest dialogue)
4. TTS synthesis via pyttsx3 + espeak-ng (local, CPU-only)

All LLM/embedding calls route through Kong AI Gateway (Article IV.2).
No hardcoded values — all config from environment via Config (Article III.1).
"""

from __future__ import annotations

import asyncio
import os
import uuid
import wave

import httpx
import pyttsx3
from fastapi import HTTPException
from qdrant_client import QdrantClient

from models import AudioOverviewResponse

# Podcast script generation prompt — grounded in retrieved chunks
_SCRIPT_PROMPT = """\
You are a podcast producer. Write a 3-minute podcast script on the topic "{topic}" \
using ONLY the following excerpts from the "{notebook}" knowledge base.

Format: Two speakers — Host (Alex) and Guest (Expert).
Requirements:
- Minimum 200 words
- Alex introduces the topic and asks questions
- Expert gives concrete, grounded answers based ONLY on the provided context
- End with a summary and takeaway
- Do NOT hallucinate — only use facts from the context

Context excerpts:
{context}

Write the full script with speaker labels on each line, e.g.:
Alex: ...
Expert: ...
"""


class AudioGenerator:
    """Orchestrates podcast script generation and TTS synthesis."""

    def __init__(
        self,
        kong_proxy_url: str,
        qdrant_url: str,
        audio_output_dir: str,
    ) -> None:
        self._kong_proxy_url = kong_proxy_url
        self._qdrant_url = qdrant_url
        self._audio_output_dir = audio_output_dir
        os.makedirs(audio_output_dir, exist_ok=True)

    async def _embed_topic(self, topic: str) -> list[float]:
        """Embed the topic string via Kong /plaudelm/embed.

        Args:
            topic: The topic string to embed.

        Returns:
            Float vector from the embedding model.

        Raises:
            HTTPException 502: If Kong/embedding call fails.
        """
        url = f"{self._kong_proxy_url}/plaudelm/embed"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    url,
                    json={"input": topic},
                    timeout=30.0,
                )
                resp.raise_for_status()
                return resp.json()["data"][0]["embedding"]
        except httpx.HTTPError as exc:
            msg = str(exc)
            raise HTTPException(status_code=502, detail=f"Embedding service unavailable: {msg}") from exc

    def _search_chunks(
        self, collection: str, vector: list[float], top_k: int = 5
    ) -> list[object]:
        """Search Qdrant for top-K chunks similar to the vector.

        Args:
            collection: Qdrant collection name (notebook).
            vector: Embedding vector for the topic.
            top_k: Maximum number of chunks to return.

        Returns:
            List of Qdrant ScoredPoint results.

        Raises:
            HTTPException 404: If no chunks are found.
        """
        qdrant = QdrantClient(url=self._qdrant_url)
        results = qdrant.search(
            collection_name=collection,
            query_vector=vector,
            limit=top_k,
        )
        return results

    async def _generate_script(
        self, topic: str, notebook: str, chunks: list[object]
    ) -> str:
        """Generate a podcast script via Kong /plaudelm/chat.

        Args:
            topic: The podcast topic.
            notebook: The notebook name (used in the prompt).
            chunks: Qdrant search results with chunk_text payloads.

        Returns:
            The generated script string.

        Raises:
            HTTPException 502: If Kong/LLM call fails.
        """
        context_parts = [
            f"[{i + 1}] {getattr(chunk, 'payload', {}).get('chunk_text', '')}"
            for i, chunk in enumerate(chunks)
        ]
        context = "\n\n".join(context_parts)
        prompt = _SCRIPT_PROMPT.format(topic=topic, notebook=notebook, context=context)

        url = f"{self._kong_proxy_url}/plaudelm/chat"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    url,
                    json={
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 1024,
                    },
                    timeout=90.0,
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"]
        except httpx.HTTPError as exc:
            msg = str(exc)
            raise HTTPException(status_code=502, detail=f"LLM unavailable: {msg}") from exc

    async def _synthesize_wav(self, script: str) -> tuple[str, float]:
        """Synthesize a WAV file from the script using pyttsx3 + espeak-ng.

        Runs the blocking pyttsx3 engine in a thread executor to avoid blocking
        the async event loop.

        Args:
            script: The podcast script text to synthesize.

        Returns:
            Tuple of (absolute_wav_path, duration_seconds).

        Raises:
            HTTPException 500: If TTS synthesis or file I/O fails.
        """
        filename = f"{uuid.uuid4()}.wav"
        output_path = os.path.join(self._audio_output_dir, filename)

        def _run_tts() -> None:
            engine = pyttsx3.init(driverName="espeak")
            engine.save_to_file(script, output_path)
            engine.runAndWait()

        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _run_tts)
        except (IOError, OSError, RuntimeError) as exc:
            msg = str(exc)
            raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {msg}") from exc

        try:
            with wave.open(output_path, "r") as wf:
                duration = wf.getnframes() / wf.getframerate()
        except (wave.Error, OSError) as exc:
            msg = str(exc)
            raise HTTPException(
                status_code=500, detail=f"Failed to read WAV metadata: {msg}"
            ) from exc

        return output_path, duration

    async def generate(
        self,
        notebook: str,
        topic: str,
        top_k: int = 5,
    ) -> AudioOverviewResponse:
        """Generate a podcast audio overview for a topic in a notebook.

        Pipeline:
        1. Embed topic → Qdrant search → top_k chunks
        2. Raise 404 if no chunks found
        3. LLM script generation via Kong
        4. TTS synthesis → WAV file
        5. Return AudioOverviewResponse

        Args:
            notebook: Notebook to retrieve content from.
            topic: Topic for the podcast overview.
            top_k: Number of chunks to retrieve from Qdrant.

        Returns:
            AudioOverviewResponse with script, audio_path, duration_seconds.

        Raises:
            HTTPException 404: If no chunks exist for the topic in the notebook.
            HTTPException 502: If Kong/LLM call fails.
            HTTPException 500: If TTS synthesis fails.
        """
        # Step 1: Embed topic
        vector = await self._embed_topic(topic)

        # Step 2: Retrieve chunks
        chunks = self._search_chunks(collection=notebook, vector=vector, top_k=top_k)
        if not chunks:
            raise HTTPException(
                status_code=404,
                detail=f"No content found for topic '{topic}' in notebook '{notebook}'.",
            )

        # Step 3: Generate script
        script = await self._generate_script(topic=topic, notebook=notebook, chunks=chunks)

        # Step 4: Synthesize WAV
        audio_path, duration_seconds = await self._synthesize_wav(script)

        return AudioOverviewResponse(
            script=script,
            audio_path=audio_path,
            duration_seconds=duration_seconds,
        )
