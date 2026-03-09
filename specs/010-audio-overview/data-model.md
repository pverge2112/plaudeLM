# Data Model: Audio Overview — Spec #7

**Feature**: `010-audio-overview`
**Source of truth**: MCP Zod schema in `mcp/src/tools/audio.ts` (Article IV.6)

---

## Pydantic Models (FastAPI — `query/models.py` additions)

### `AudioOverviewRequest`

```python
class AudioOverviewRequest(BaseModel):
    notebook: Notebook = Field(..., description="Notebook to retrieve content from.")
    topic: str = Field(..., min_length=1, description="Topic for the podcast overview.")
```

**Validation rules**:
- `notebook`: must be one of `"kong" | "personal" | "music"` — FastAPI returns 422 otherwise
- `topic`: non-empty string — FastAPI returns 422 on empty string

### `AudioOverviewResponse`

```python
class AudioOverviewResponse(BaseModel):
    script: str = Field(..., min_length=200, description="Podcast script (host + guest dialogue, ≥ 200 chars).")
    audio_path: str = Field(..., min_length=1, description="Absolute path to generated WAV file.")
    duration_seconds: float = Field(..., gt=0, description="Duration of the audio file in seconds.")
```

**Constraints**:
- `script`: minimum 200 characters (matches MCP Zod `z.string().min(200)`)
- `audio_path`: non-empty absolute path (e.g., `/data/audio/abc123.wav`)
- `duration_seconds`: strictly positive float (computed from WAV metadata)

---

## File Storage

| Attribute | Value |
|---|---|
| Format | WAV (16-bit PCM, mono, espeak-ng output) |
| Naming | `{uuid4}.wav` — random UUID per generation |
| Location | `$AUDIO_OUTPUT_DIR/{uuid4}.wav` (env var, default `/data/audio`) |
| Accessibility | Docker volume mount — host can read via `./data/audio/` |
| Lifecycle | Not cleaned up automatically — manual or future cron job |

---

## Environment Variables (additions)

| Variable | Service | Required | Description |
|---|---|---|---|
| `AUDIO_OUTPUT_DIR` | query | yes | Directory where WAV files are saved. Must be writable by the container. |

**Startup validation**: `config.py` must validate `AUDIO_OUTPUT_DIR` is set and the directory exists (or create it). Fail fast with clear error if unset.

---

## Module Structure (`query/audio.py`)

```python
class AudioGenerator:
    """Orchestrates podcast script generation and TTS synthesis."""

    def __init__(
        self,
        kong_proxy_url: str,
        qdrant_url: str,
        audio_output_dir: str,
    ) -> None: ...

    async def generate(
        self,
        notebook: str,
        topic: str,
        top_k: int = 5,
    ) -> AudioOverviewResponse:
        """
        1. Embed topic → Qdrant search → top_k chunks
        2. Raise HTTPException 404 if no chunks found
        3. Build grounded podcast script prompt
        4. Call Kong /plaudelm/chat → script string
        5. Synthesize WAV via pyttsx3 + espeak-ng
        6. Compute duration from WAV metadata
        7. Return AudioOverviewResponse
        """
```

---

## State Transitions

```
POST /audio-overview
  │
  ├─► Qdrant embed + search
  │     └─► 0 results → HTTP 404
  │
  ├─► Kong /plaudelm/chat → script
  │     └─► HTTP error → HTTP 502
  │
  ├─► pyttsx3 TTS synthesis → WAV file
  │     └─► IO error → HTTP 500
  │
  └─► AudioOverviewResponse (script, audio_path, duration_seconds) → HTTP 200
```

---

## Schema Alignment (MCP ↔ FastAPI)

| MCP Zod (source of truth) | FastAPI Pydantic |
|---|---|
| `z.string().min(200)` | `str, min_length=200` |
| `z.string().min(1)` | `str, min_length=1` |
| `z.number().positive()` | `float, gt=0` |
