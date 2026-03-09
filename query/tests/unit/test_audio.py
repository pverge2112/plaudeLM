"""
Unit tests for query/audio.py — podcast script generation + TTS synthesis.

All external dependencies (httpx, QdrantClient, pyttsx3, wave) are mocked.
Tests read as specifications per CONSTITUTION.md Article II.5.

TDD Red phase: these tests are written BEFORE audio.py exists — they will fail
until the implementation is complete.
"""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException


class TestAudioGeneratorScriptGeneration:
    """US1: script generation path — embed topic, Qdrant search, LLM call."""

    def _make_generator(self) -> object:
        from audio import AudioGenerator

        return AudioGenerator(
            kong_proxy_url="http://kong:8000",
            qdrant_url="http://qdrant:6333",
            audio_output_dir="/tmp/test-audio",
        )

    async def test_generate_calls_embed_with_topic(self) -> None:
        """generate() embeds the topic via Kong /plaudelm/embed."""
        gen = self._make_generator()

        mock_embed_response = MagicMock()
        mock_embed_response.raise_for_status = MagicMock()
        mock_embed_response.json.return_value = {"data": [{"embedding": [0.1] * 3072}]}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)
        mock_http_client.post = AsyncMock(return_value=mock_embed_response)

        # Qdrant returns one hit so we don't 404
        mock_qdrant = MagicMock()
        mock_qdrant.search.return_value = [
            MagicMock(id="chunk1", score=0.9, payload={"chunk_text": "Some content about rate limiting."})
        ]

        mock_chat_response = MagicMock()
        mock_chat_response.raise_for_status = MagicMock()
        mock_chat_response.json.return_value = {
            "choices": [{"message": {"content": "Alex: " + "Rate limiting is key. " * 20}}]
        }

        with (
            patch("audio.httpx.AsyncClient", return_value=mock_http_client),
            patch("audio.QdrantClient", return_value=mock_qdrant),
            patch("audio.AudioGenerator._synthesize_wav", return_value=("/tmp/test-audio/stub.wav", 1.0)),
        ):
            mock_http_client.post = AsyncMock(side_effect=[mock_embed_response, mock_chat_response])
            await gen.generate(notebook="kong", topic="rate limiting")

        first_call_url = mock_http_client.post.call_args_list[0][0][0]
        assert "/plaudelm/embed" in first_call_url

    async def test_generate_calls_qdrant_search(self) -> None:
        """generate() calls QdrantClient.search() against the correct collection."""
        gen = self._make_generator()

        mock_embed_response = MagicMock()
        mock_embed_response.raise_for_status = MagicMock()
        mock_embed_response.json.return_value = {"data": [{"embedding": [0.1] * 3072}]}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)

        mock_qdrant = MagicMock()
        mock_qdrant.search.return_value = [
            MagicMock(id="chunk1", score=0.9, payload={"chunk_text": "Some chunk text."})
        ]

        mock_chat_response = MagicMock()
        mock_chat_response.raise_for_status = MagicMock()
        mock_chat_response.json.return_value = {
            "choices": [{"message": {"content": "Alex: " + "word " * 50}}]
        }

        with (
            patch("audio.httpx.AsyncClient", return_value=mock_http_client),
            patch("audio.QdrantClient", return_value=mock_qdrant),
            patch("audio.AudioGenerator._synthesize_wav", return_value=("/tmp/test-audio/stub.wav", 1.0)),
        ):
            mock_http_client.post = AsyncMock(side_effect=[mock_embed_response, mock_chat_response])
            await gen.generate(notebook="kong", topic="rate limiting")

        mock_qdrant.search.assert_called_once()
        call_kwargs = mock_qdrant.search.call_args
        assert call_kwargs[1]["collection_name"] == "kong" or call_kwargs[0][0] == "kong"

    async def test_generate_raises_404_when_no_chunks(self) -> None:
        """generate() raises HTTPException 404 when Qdrant returns no results."""
        gen = self._make_generator()

        mock_embed_response = MagicMock()
        mock_embed_response.raise_for_status = MagicMock()
        mock_embed_response.json.return_value = {"data": [{"embedding": [0.1] * 3072}]}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)
        mock_http_client.post = AsyncMock(return_value=mock_embed_response)

        mock_qdrant = MagicMock()
        mock_qdrant.search.return_value = []  # No results

        with (
            patch("audio.httpx.AsyncClient", return_value=mock_http_client),
            patch("audio.QdrantClient", return_value=mock_qdrant),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await gen.generate(notebook="kong", topic="nonexistent topic")

        assert exc_info.value.status_code == 404
        assert "nonexistent topic" in exc_info.value.detail
        assert "kong" in exc_info.value.detail

    async def test_generate_builds_prompt_containing_chunk_text(self) -> None:
        """generate() includes chunk text in the LLM prompt."""
        gen = self._make_generator()

        chunk_content = "Kong rate limiting uses sliding window algorithm."
        mock_embed_response = MagicMock()
        mock_embed_response.raise_for_status = MagicMock()
        mock_embed_response.json.return_value = {"data": [{"embedding": [0.1] * 3072}]}

        mock_chat_response = MagicMock()
        mock_chat_response.raise_for_status = MagicMock()
        mock_chat_response.json.return_value = {
            "choices": [{"message": {"content": "Alex: " + "word " * 50}}]
        }

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)

        mock_qdrant = MagicMock()
        mock_qdrant.search.return_value = [
            MagicMock(id="c1", score=0.9, payload={"chunk_text": chunk_content})
        ]

        captured_payload: list[dict[str, object]] = []

        async def capture_post(url: str, **kwargs: object) -> object:
            captured_payload.append(kwargs.get("json", {}))  # type: ignore[arg-type]
            if "/embed" in url:
                return mock_embed_response
            return mock_chat_response

        mock_http_client.post = capture_post

        with (
            patch("audio.httpx.AsyncClient", return_value=mock_http_client),
            patch("audio.QdrantClient", return_value=mock_qdrant),
            patch("audio.AudioGenerator._synthesize_wav", return_value=("/tmp/test-audio/stub.wav", 1.0)),
        ):
            await gen.generate(notebook="kong", topic="rate limiting")

        # The chat call payload should contain the chunk text in the messages
        chat_payload = captured_payload[1]
        messages = chat_payload.get("messages", [])
        combined_content = " ".join(str(m.get("content", "")) for m in messages)  # type: ignore[union-attr]
        assert chunk_content in combined_content

    async def test_generate_calls_kong_chat_endpoint(self) -> None:
        """generate() calls Kong /plaudelm/chat for script generation."""
        gen = self._make_generator()

        mock_embed_response = MagicMock()
        mock_embed_response.raise_for_status = MagicMock()
        mock_embed_response.json.return_value = {"data": [{"embedding": [0.1] * 3072}]}

        mock_chat_response = MagicMock()
        mock_chat_response.raise_for_status = MagicMock()
        mock_chat_response.json.return_value = {
            "choices": [{"message": {"content": "Alex: " + "word " * 50}}]
        }

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)
        mock_http_client.post = AsyncMock(side_effect=[mock_embed_response, mock_chat_response])

        mock_qdrant = MagicMock()
        mock_qdrant.search.return_value = [
            MagicMock(id="c1", score=0.9, payload={"chunk_text": "Some text."})
        ]

        with (
            patch("audio.httpx.AsyncClient", return_value=mock_http_client),
            patch("audio.QdrantClient", return_value=mock_qdrant),
            patch("audio.AudioGenerator._synthesize_wav", return_value=("/tmp/test-audio/stub.wav", 1.0)),
        ):
            await gen.generate(notebook="kong", topic="rate limiting")

        chat_call_url = mock_http_client.post.call_args_list[1][0][0]
        assert "/plaudelm/chat" in chat_call_url

    async def test_generate_raises_502_on_kong_chat_failure(self) -> None:
        """generate() raises HTTPException 502 when Kong /plaudelm/chat fails."""
        import httpx as _httpx

        gen = self._make_generator()

        mock_embed_response = MagicMock()
        mock_embed_response.raise_for_status = MagicMock()
        mock_embed_response.json.return_value = {"data": [{"embedding": [0.1] * 3072}]}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)

        mock_qdrant = MagicMock()
        mock_qdrant.search.return_value = [
            MagicMock(id="c1", score=0.9, payload={"chunk_text": "Some text."})
        ]

        async def fail_chat(url: str, **kwargs: object) -> object:
            if "/embed" in url:
                return mock_embed_response
            raise _httpx.HTTPError("upstream error")

        mock_http_client.post = fail_chat

        with (
            patch("audio.httpx.AsyncClient", return_value=mock_http_client),
            patch("audio.QdrantClient", return_value=mock_qdrant),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await gen.generate(notebook="kong", topic="rate limiting")

        assert exc_info.value.status_code == 502

    async def test_generate_script_length_at_least_200_chars(self) -> None:
        """generate() returns script with ≥ 200 characters (per Zod/Pydantic min_length)."""
        gen = self._make_generator()
        long_script = "Alex: Welcome to the show.\nExpert: " + "Kong is great. " * 20

        mock_embed_response = MagicMock()
        mock_embed_response.raise_for_status = MagicMock()
        mock_embed_response.json.return_value = {"data": [{"embedding": [0.1] * 3072}]}

        mock_chat_response = MagicMock()
        mock_chat_response.raise_for_status = MagicMock()
        mock_chat_response.json.return_value = {
            "choices": [{"message": {"content": long_script}}]
        }

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)
        mock_http_client.post = AsyncMock(side_effect=[mock_embed_response, mock_chat_response])

        mock_qdrant = MagicMock()
        mock_qdrant.search.return_value = [
            MagicMock(id="c1", score=0.9, payload={"chunk_text": "Some text."})
        ]

        with (
            patch("audio.httpx.AsyncClient", return_value=mock_http_client),
            patch("audio.QdrantClient", return_value=mock_qdrant),
            patch("audio.AudioGenerator._synthesize_wav", return_value=("/tmp/test-audio/stub.wav", 1.0)),
        ):
            result = await gen.generate(notebook="kong", topic="rate limiting")

        assert len(result.script) >= 200


class TestAudioGeneratorTTS:
    """US2: TTS synthesis — pyttsx3 + espeak-ng."""

    def _make_generator(self) -> object:
        from audio import AudioGenerator

        return AudioGenerator(
            kong_proxy_url="http://kong:8000",
            qdrant_url="http://qdrant:6333",
            audio_output_dir="/tmp/test-audio",
        )

    async def test_synthesize_wav_calls_engine_save_to_file(self) -> None:
        """_synthesize_wav calls pyttsx3 engine.save_to_file() with the script."""
        gen = self._make_generator()

        mock_engine = MagicMock()
        mock_engine.save_to_file = MagicMock()
        mock_engine.runAndWait = MagicMock()

        mock_wave_file = MagicMock()
        mock_wave_file.__enter__ = MagicMock(return_value=mock_wave_file)
        mock_wave_file.__exit__ = MagicMock(return_value=False)
        mock_wave_file.getnframes.return_value = 44100
        mock_wave_file.getframerate.return_value = 44100

        with (
            patch("audio.pyttsx3.init", return_value=mock_engine),
            patch("audio.wave.open", return_value=mock_wave_file),
            patch("os.path.exists", return_value=True),
        ):
            path, duration = await gen._synthesize_wav("Hello world script text.")

        mock_engine.save_to_file.assert_called_once()
        script_arg = mock_engine.save_to_file.call_args[0][0]
        assert script_arg == "Hello world script text."

    async def test_synthesize_wav_calls_engine_run_and_wait(self) -> None:
        """_synthesize_wav calls pyttsx3 engine.runAndWait() to flush output."""
        gen = self._make_generator()

        mock_engine = MagicMock()
        mock_wave_file = MagicMock()
        mock_wave_file.__enter__ = MagicMock(return_value=mock_wave_file)
        mock_wave_file.__exit__ = MagicMock(return_value=False)
        mock_wave_file.getnframes.return_value = 22050
        mock_wave_file.getframerate.return_value = 22050

        with (
            patch("audio.pyttsx3.init", return_value=mock_engine),
            patch("audio.wave.open", return_value=mock_wave_file),
            patch("os.path.exists", return_value=True),
        ):
            await gen._synthesize_wav("test")

        mock_engine.runAndWait.assert_called_once()

    async def test_synthesize_wav_returns_path_with_wav_extension(self) -> None:
        """_synthesize_wav returns a path ending in .wav."""
        gen = self._make_generator()

        mock_engine = MagicMock()
        mock_wave_file = MagicMock()
        mock_wave_file.__enter__ = MagicMock(return_value=mock_wave_file)
        mock_wave_file.__exit__ = MagicMock(return_value=False)
        mock_wave_file.getnframes.return_value = 44100
        mock_wave_file.getframerate.return_value = 44100

        with (
            patch("audio.pyttsx3.init", return_value=mock_engine),
            patch("audio.wave.open", return_value=mock_wave_file),
            patch("os.path.exists", return_value=True),
        ):
            path, _ = await gen._synthesize_wav("test")

        assert path.endswith(".wav")

    async def test_synthesize_wav_output_path_is_inside_audio_output_dir(self) -> None:
        """_synthesize_wav saves the file inside AUDIO_OUTPUT_DIR."""
        gen = self._make_generator()

        mock_engine = MagicMock()
        mock_wave_file = MagicMock()
        mock_wave_file.__enter__ = MagicMock(return_value=mock_wave_file)
        mock_wave_file.__exit__ = MagicMock(return_value=False)
        mock_wave_file.getnframes.return_value = 44100
        mock_wave_file.getframerate.return_value = 44100

        with (
            patch("audio.pyttsx3.init", return_value=mock_engine),
            patch("audio.wave.open", return_value=mock_wave_file),
            patch("os.path.exists", return_value=True),
        ):
            path, _ = await gen._synthesize_wav("test")

        assert path.startswith("/tmp/test-audio/")

    async def test_synthesize_wav_computes_duration_from_wave_metadata(self) -> None:
        """_synthesize_wav computes duration as frames / framerate."""
        gen = self._make_generator()

        mock_engine = MagicMock()
        mock_wave_file = MagicMock()
        mock_wave_file.__enter__ = MagicMock(return_value=mock_wave_file)
        mock_wave_file.__exit__ = MagicMock(return_value=False)
        mock_wave_file.getnframes.return_value = 88200
        mock_wave_file.getframerate.return_value = 44100  # → 2.0 seconds

        with (
            patch("audio.pyttsx3.init", return_value=mock_engine),
            patch("audio.wave.open", return_value=mock_wave_file),
            patch("os.path.exists", return_value=True),
        ):
            _, duration = await gen._synthesize_wav("test")

        assert duration == pytest.approx(2.0)

    async def test_synthesize_wav_raises_500_on_io_error(self) -> None:
        """_synthesize_wav raises HTTPException 500 when pyttsx3 raises an IOError."""
        gen = self._make_generator()

        mock_engine = MagicMock()
        mock_engine.save_to_file = MagicMock()
        mock_engine.runAndWait = MagicMock(side_effect=IOError("espeak-ng not found"))

        with patch("audio.pyttsx3.init", return_value=mock_engine):
            with pytest.raises(HTTPException) as exc_info:
                await gen._synthesize_wav("test script")

        assert exc_info.value.status_code == 500
        assert "espeak-ng not found" in exc_info.value.detail
