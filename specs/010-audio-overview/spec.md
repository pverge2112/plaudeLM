# Spec #7 — Audio Overview
**GitHub Issue**: #10
**Branch**: `010-audio-overview`
**Status**: In progress

---

## Problem

The `audio_overview` MCP tool exists and routes to `POST /audio-overview` on the FastAPI query service, but the FastAPI endpoint is not implemented. Calling `audio_overview` returns a 404. Users have no way to generate a podcast-style audio summary of a notebook topic.

## Proposed Solution

Implement the full audio overview pipeline:

1. **`query/audio.py`** — LLM-driven podcast script generation (host + guest dialogue format using gpt-4o-mini via Kong). Takes a `notebook` + `topic`, retrieves top relevant chunks via Qdrant, builds a grounded script.
2. **`POST /audio-overview`** FastAPI endpoint in `query/main.py` — accepts `{ notebook, topic }`, returns `{ script, audio_path, duration_seconds }`.
3. **TTS** — convert the script to audio using `pyttsx3` + `espeak-ng` (local, CPU-only, no GPU required). Audio saved to a volume-mounted directory (`AUDIO_OUTPUT_DIR`), returned as a file path.
4. **`audio_overview` MCP tool** — already implemented in `mcp/src/tools/audio.ts`; delegates to FastAPI. No MCP-side changes expected.

## Acceptance Criteria

- [ ] `POST /audio-overview` returns HTTP 200 with `{ script: string, audio_path: string, duration_seconds: number }` when given a valid `notebook` and `topic`
- [ ] `script` field contains a host + guest dialogue of at least 200 words grounded in actual notebook chunks
- [ ] `audio_path` points to a real file that exists on disk (accessible via Docker volume mount)
- [ ] `duration_seconds` is a positive number derived from the audio file length
- [ ] `POST /audio-overview` returns HTTP 422 when `notebook` is not one of `kong | personal | music`
- [ ] `POST /audio-overview` returns HTTP 404 when no chunks exist for the given topic in the requested notebook
- [ ] `audio_overview` MCP tool returns a valid response (non-error) when called via MCP client against a running stack
- [ ] All unit tests pass with all external deps mocked (LLM call, Qdrant call, TTS call)
- [ ] All integration tests pass against real running services (`@pytest.mark.integration`)
- [ ] MCP contract test validates `audio_overview` input/output schema via Zod (already exists — confirm still passes)
- [ ] MCP integration test calls `audio_overview` against a live stack and asserts non-error result

## Out of Scope

- Streaming audio output (chunked/partial delivery)
- Multiple voice models or configurable TTS voices (use one working default)
- Audio file format selection (WAV is the target; MP3 optional via pydub)
- Serving audio files over HTTP (file path returned; client retrieves via volume mount)
- Multi-language support
- Saving scripts to Neo4j or Qdrant

## Test Plan

| Layer | File | What it covers |
|---|---|---|
| Unit | `query/tests/unit/test_audio.py` | Script generation logic, prompt construction, chunk selection, error paths — all deps mocked |
| Integration | `query/tests/integration/test_audio_endpoint.py` | Real Qdrant + Kong/Azure calls; verifies end-to-end script + audio file returned |
| Contract | `mcp/tests/contract/tools/audio.test.ts` | Already exists — Zod schema: valid input → expected output shape; invalid input → error shape |
| Integration (MCP) | `mcp/tests/integration/tools/audio.integration.test.ts` | Calls `audio_overview` via MCP client against live stack; asserts non-error |

## Dependencies

- Spec #3 (Query Service) — ✅ merged; FastAPI app exists
- Spec #4 (MCP Server) — ✅ merged; `audio_overview` tool stub exists
- Spec #5 (Kong MCP Gateway) — ✅ closed; Kong routes `/plaudelm/chat` and `/plaudelm/embed` are live
- At least one notebook must have ingested content for integration tests (use `kong` notebook)
- TTS library must be installable in the `query` Docker image without GPU (CPU-only)
