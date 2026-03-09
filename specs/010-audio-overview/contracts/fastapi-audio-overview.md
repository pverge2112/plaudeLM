# Contract: POST /audio-overview

**Service**: FastAPI Query Service (`query/`)
**Spec**: #10 (Spec #7 — Audio Overview)

---

## Endpoint

```
POST /audio-overview
Content-Type: application/json
```

---

## Request

```json
{
  "notebook": "kong | personal | music",
  "topic": "non-empty string"
}
```

### Validation

| Field | Rule | Error |
|---|---|---|
| `notebook` | one of `"kong"`, `"personal"`, `"music"` | 422 Unprocessable Entity |
| `topic` | non-empty string (min_length=1) | 422 Unprocessable Entity |

---

## Response — 200 OK

```json
{
  "script": "Alex: Welcome to the plaudeLM podcast...\nExpert: ...",
  "audio_path": "/data/audio/3f2a1b4c-...-wav",
  "duration_seconds": 127.4
}
```

### Field Contracts

| Field | Type | Constraint |
|---|---|---|
| `script` | string | ≥ 200 characters; host (Alex) + guest (Expert) dialogue |
| `audio_path` | string | Non-empty absolute path to a WAV file that exists on disk |
| `duration_seconds` | float | Strictly positive; computed from WAV frame count / frame rate |

---

## Error Responses

| Status | Condition | Body |
|---|---|---|
| 404 | Qdrant returns 0 chunks for topic in notebook | `{"detail": "No content found for topic '...' in notebook '...'."}` |
| 422 | Request validation failure | FastAPI standard validation error body |
| 502 | Kong/Azure LLM call fails | `{"detail": "LLM unavailable: <upstream error>"}` |
| 500 | TTS synthesis or file I/O failure | `{"detail": "TTS synthesis failed: <error message>"}` |

---

## MCP Tool Alignment

The MCP `audio_overview` tool in `mcp/src/tools/audio.ts` validates the response with:

```typescript
const AudioOverviewOutputSchema = z.object({
  script: z.string().min(200),
  audio_path: z.string().min(1),
  duration_seconds: z.number().positive(),
});
```

This FastAPI contract is **derived from** and **must match** that Zod schema (Article IV.6).
