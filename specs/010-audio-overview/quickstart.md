# Quickstart: Audio Overview — Spec #7

**Prerequisites**: Full stack running (`docker compose up -d`), init scripts run, at least one document ingested into the `kong` notebook.

---

## 1. Environment Setup

Add `AUDIO_OUTPUT_DIR` to your `.env`:
```bash
AUDIO_OUTPUT_DIR=/data/audio
```

The `docker-compose.yml` will mount this as a named volume (`audio_data`) into the query container.

---

## 2. Rebuild Query Image (must use --no-cache per Article IV.5)

```bash
docker compose build --no-cache query
docker compose up -d query
```

The new Dockerfile installs `espeak-ng` for local TTS.

---

## 3. Test via curl (direct FastAPI)

```bash
curl -s -X POST http://localhost:8081/audio-overview \
  -H "Content-Type: application/json" \
  -d '{"notebook": "kong", "topic": "rate limiting"}' | jq .
```

**Expected response**:
```json
{
  "script": "Alex: Welcome to today's episode...\nExpert: ...",
  "audio_path": "/data/audio/abc123.wav",
  "duration_seconds": 134.2
}
```

---

## 4. Test via MCP (Claude Code)

In Claude Code, call the `audio_overview` tool:
```
Use the audio_overview tool for the kong notebook on the topic "rate limiting"
```

Or via curl against Kong MCP Gateway:
```bash
curl -s -X POST http://localhost:8000/plaudelm/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "apikey: $KONG_MCP_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "audio_overview",
      "arguments": {"notebook": "kong", "topic": "rate limiting"}
    }
  }' | jq .
```

---

## 5. Access the Audio File

The WAV file is written to the Docker volume. Access it from the host:
```bash
# Find the volume mount on your host
docker inspect plaudelm-query | grep -A5 audio_data

# Or copy out
docker cp plaudelm-query:/data/audio/abc123.wav ~/Downloads/
```

---

## 6. Run Tests

```bash
# Unit tests (no services required)
cd query && ./venv/bin/pytest tests/unit/test_audio.py -v

# Integration tests (requires full stack)
cd query && ./venv/bin/pytest tests/integration/test_audio_endpoint.py -v -m integration

# MCP integration test (requires full stack + Kong)
cd mcp && npm run test:integration -- --testPathPattern audio
```

---

## Known Limitations (MVP)

- TTS uses espeak-ng which produces robotic-sounding audio; piper-tts is the planned upgrade
- Audio files are not automatically cleaned up; manage manually or add a cron job
- WAV format only; no MP3 conversion in this spec
