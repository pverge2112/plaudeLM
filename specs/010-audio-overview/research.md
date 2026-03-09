# Research: Audio Overview — Spec #7

**Feature**: `010-audio-overview`
**Date**: 2026-03-09
**Sources**: Direct code inspection of `query/`, `mcp/src/tools/audio.ts`, `query/Dockerfile`, `query/requirements.txt`; training knowledge for TTS library trade-offs.

---

## R1: TTS Library Selection

**Decision**: `pyttsx3` + `espeak-ng` system package installed in the query Docker image.

**Rationale**:
- Truly local — no internet required, no external API key
- No GPU required — pure CPU, works on the home lab
- Headless-compatible in Docker — `pyttsx3` uses `espeak` driver on Linux, which runs without X11/dbus when invoked directly via `engine.save_to_file()`
- Lightweight — `espeak-ng` is ~5 MB as an apt package
- Output: WAV file, which can be played or converted downstream
- Installable via `apt-get install espeak-ng libespeak-ng1` in Dockerfile

**Alternatives considered**:

| Option | Verdict | Reason rejected |
|---|---|---|
| Coqui TTS | ❌ rejected | Requires CUDA or heavy CPU model (~500MB); slow on CPU; complex Docker install |
| piper | ⚠️ deferred | High quality, ~30MB model, but requires pre-downloaded model at build time; added complexity for MVP |
| gTTS | ❌ rejected | Requires internet (calls Google TTS API); violates local-first principle |
| edge-tts | ❌ rejected | Requires internet; same issue as gTTS |
| Azure TTS via Kong | ⚠️ considered | Would need a new Kong route (`/plaudelm/tts`); deferred to future spec |
| subprocess + espeak-ng | ⚠️ viable fallback | Direct CLI works but pyttsx3 wraps it cleanly in Python |

**Docker change required**:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng libespeak-ng1 \
    && rm -rf /var/lib/apt/lists/*
```

---

## R2: Script Generation Strategy

**Decision**: Embed topic → Qdrant top-K retrieval → LLM podcast script via Kong `/plaudelm/chat`.

**Rationale**:
- Reuses the same embedding + retrieval pattern as `rag.py` (no new infrastructure)
- Retrieves grounded chunks so the script is factually anchored to notebook content
- LLM prompt produces host (Alex) + guest (expert) dialogue format — natural, listenable
- Keeps `audio.py` as a thin orchestrator around existing `RagRetriever`

**Script prompt design**:
```
You are a podcast producer. Create a 3-minute podcast script on the topic "{topic}"
using ONLY the provided context excerpts from the "{notebook}" knowledge base.

Format: Two speakers — Host (Alex) and Guest (Expert).
- Minimum 200 words
- Host introduces the topic and asks questions
- Guest gives concrete, grounded answers based on the context
- End with a summary and call to action
- Do NOT hallucinate — only use facts from the provided context

Context:
{context}

Output the full script with speaker labels, e.g.:
Alex: ...
Expert: ...
```

---

## R3: Audio File Storage

**Decision**: Save audio files to a Docker volume-mounted directory at `AUDIO_OUTPUT_DIR` env var (default: `/data/audio`).

**Rationale**:
- Decouples file location from service code (Article III.1 — no hardcoded paths)
- Volume mount in docker-compose.yml makes files accessible to the host
- Filename: `{uuid4}.wav` — unique per generation, no collision risk
- `duration_seconds` computed from WAV file metadata using `wave` standard library module

**docker-compose.yml addition needed**:
```yaml
query:
  environment:
    AUDIO_OUTPUT_DIR: /data/audio
  volumes:
    - audio_data:/data/audio

volumes:
  audio_data:
```

---

## R4: Existing MCP Tool Compatibility

**Decision**: No changes to `mcp/src/tools/audio.ts`.

**Rationale** (from direct code inspection):
- The tool already calls `FastApiClient.post('/audio-overview', { notebook, topic })`
- Output schema already defined: `{ script: string (min 200), audio_path: string, duration_seconds: number (positive) }`
- Contract test `mcp/tests/contract/tools/audio.test.ts` already exists and passes
- FastAPI response shape just needs to match this schema exactly — and it will

---

## R5: 404 on Empty Chunks

**Decision**: Return HTTP 404 with detail `"No content found for topic '{topic}' in notebook '{notebook}'"` when Qdrant returns zero results.

**Rationale**:
- Prevents the LLM from generating a hallucinated script on no evidence
- Mirrors the pattern used in graph retrieval error paths
- MCP tool propagates this as `isError: true` with the 404 message

---

## R6: `duration_seconds` Computation

**Decision**: Use Python's built-in `wave` module to read WAV frame count and rate.

```python
import wave
with wave.open(output_path, 'r') as wf:
    duration = wf.getnframes() / wf.getframerate()
```

**Rationale**: No extra dependencies; standard library; deterministic given the WAV file.

---

## R7: New Environment Variable

**Decision**: Add `AUDIO_OUTPUT_DIR` to `query/config.py` and `.env.example`.

```python
audio_output_dir: str = Field(..., env="AUDIO_OUTPUT_DIR", description="Directory for generated WAV files")
```

**Impact**: `query/config.py` gains one new field. `.env.example` gains one new variable. Both changes are additive and backward-compatible.
