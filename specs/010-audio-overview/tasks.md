# Tasks: Audio Overview (Spec #7)

**Input**: Design documents from `specs/010-audio-overview/`
**GitHub Issue**: #10
**Branch**: `010-audio-overview`
**Tests**: TDD is mandatory (CONSTITUTION.md Article II.1) — write failing tests FIRST in every phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## User Stories

| ID | Priority | Story | Independent Test |
|---|---|---|---|
| US1 | P1 | Podcast script generation: `POST /audio-overview` retrieves Qdrant chunks + calls LLM → returns `{ script, audio_path, duration_seconds }` | `curl -X POST localhost:8081/audio-overview -d '{"notebook":"kong","topic":"rate limiting"}'` returns 200 with script ≥ 200 chars |
| US2 | P2 | TTS synthesis: the returned `audio_path` points to a real WAV file on disk with a positive `duration_seconds` | File at `audio_path` exists on disk; `duration_seconds > 0` |
| US3 | P3 | MCP integration: `audio_overview` MCP tool returns a valid non-error response when called against the live stack via Kong | MCP integration test passes with `isError: false` |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Docker, volume, env var changes that all stories require.

- [x] T001 Add `AUDIO_OUTPUT_DIR=/data/audio` to `.env.example`
- [x] T002 Add `audio_data` named volume + `AUDIO_OUTPUT_DIR` env var to `query` service in `docker-compose.yml`
- [x] T003 [P] Add `pyttsx3` to `query/requirements.txt`
- [x] T004 [P] Add `espeak-ng libespeak-ng1` apt packages to `query/Dockerfile` (before COPY)

**Checkpoint**: `docker compose build --no-cache query` succeeds with espeak-ng installed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Models and config that both US1 and US2 depend on. Must complete before user story phases.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Add `AudioOverviewRequest` and `AudioOverviewResponse` Pydantic v2 models to `query/models.py` (per `data-model.md` schema — matches MCP Zod source of truth)
- [x] T006 Add `audio_output_dir: str` field to `query/config.py`; validate at startup: create directory if missing, fail fast if `AUDIO_OUTPUT_DIR` env var is unset
- [x] T007 [P] Instantiate `AudioGenerator` at module level in `query/main.py` (alongside `_rag` and `_graph`) — import only, no endpoint yet

**Checkpoint**: `python -c "from models import AudioOverviewRequest, AudioOverviewResponse; from config import Config"` succeeds (with env vars set).

---

## Phase 3: User Story 1 — Script Generation (Priority: P1) 🎯 MVP

**Goal**: `POST /audio-overview` embeds the topic, retrieves top Qdrant chunks, calls LLM via Kong to generate a grounded host+guest script, and returns `{ script, audio_path, duration_seconds }`. TTS is stubbed — `audio_path` is a placeholder, `duration_seconds` is `0.0` until US2.

**Independent Test**:
```bash
curl -s -X POST http://localhost:8081/audio-overview \
  -H "Content-Type: application/json" \
  -d '{"notebook":"kong","topic":"rate limiting"}' | jq '.script | length'
# → number ≥ 200
```

### Tests for User Story 1 (write FIRST — must FAIL before implementation)

- [x] T008 [P] [US1] Write unit tests for `AudioGenerator._embed_topic`, `_search_chunks`, `_generate_script` in `query/tests/unit/test_audio.py` — mock `httpx.AsyncClient` and `QdrantClient`; include: calls embed with topic, calls Qdrant search, raises 404 when no chunks, builds prompt from chunks, calls Kong chat, raises 502 on Kong failure, script length ≥ 200 chars
- [x] T009 [P] [US1] Write integration tests for `POST /audio-overview` (US1 scope: script only) in `query/tests/integration/test_audio_endpoint.py` — `@pytest.mark.integration`; include: returns 200 with valid response, returns 404 when topic has no chunks, rejects invalid notebook with 422

### Implementation for User Story 1

- [x] T010 [US1] Create `query/audio.py` with `AudioGenerator` class: `__init__`, `_embed_topic()`, `_search_chunks()` (raises HTTP 404 if empty), `_generate_script()` (calls Kong `/plaudelm/chat`), and `generate()` orchestrator; stub `_synthesize_wav()` to return `(f"{output_dir}/stub.wav", 0.0)` — TTS implemented in US2
- [x] T011 [US1] Add `POST /audio-overview` endpoint to `query/main.py`: instantiate `AudioGenerator(_config)`, call `await audio_gen.generate(notebook, topic)`, return `AudioOverviewResponse`; handle HTTP 404 passthrough and 502 on LLM failure
- [x] T012 [US1] Verify unit tests T008 pass; verify integration tests T009 pass (with `kong` notebook having ingested content)

**Checkpoint**: `POST /audio-overview` returns 200 with script ≥ 200 chars. Unit + integration tests green. Existing 30 query unit tests still green.

---

## Phase 4: User Story 2 — TTS Synthesis (Priority: P2)

**Goal**: `_synthesize_wav()` is fully implemented using `pyttsx3` + `espeak-ng`. The returned `audio_path` is a real WAV file on disk. `duration_seconds` is computed from WAV metadata.

**Independent Test**:
```bash
# After calling /audio-overview, check that the file exists in the volume
docker exec plaudelm-query ls /data/audio/
# → uuid.wav file visible
```

### Tests for User Story 2 (write FIRST — must FAIL before implementation)

- [x] T013 [P] [US2] Add TTS unit tests to `query/tests/unit/test_audio.py`: mock `pyttsx3.init()` engine + `wave.open()`; include: calls `engine.save_to_file()` with script + path, calls `engine.runAndWait()`, returns path with `.wav` extension containing a UUID, computes duration from `getnframes/getframerate`, raises HTTP 500 on TTS IO error, output path is inside `AUDIO_OUTPUT_DIR`
- [x] T014 [P] [US2] Add TTS integration test to `query/tests/integration/test_audio_endpoint.py`: `@pytest.mark.integration`; includes: audio file exists on disk after successful call, `duration_seconds > 0`

### Implementation for User Story 2

- [x] T015 [US2] Implement `AudioGenerator._synthesize_wav(script: str) -> tuple[str, float]` in `query/audio.py`: generate `uuid4().wav` filename, run `pyttsx3.init()` with `driverName="espeak"`, call `engine.save_to_file(script, path)` + `engine.runAndWait()` wrapped in `asyncio.get_event_loop().run_in_executor(None, ...)` to avoid blocking the event loop; compute duration with `wave.open()` → `getnframes / getframerate`; raise `HTTPException(500)` on any `IOError`
- [x] T016 [US2] Replace the stub in `generate()` with real `await self._synthesize_wav(script)` call; ensure `AUDIO_OUTPUT_DIR` directory is created at `AudioGenerator.__init__` if not exists
- [ ] T017 [US2] Rebuild query container: `docker compose build --no-cache query && docker compose up -d query`; verify espeak-ng is available inside container: `docker exec plaudelm-query espeak-ng --version`
- [x] T018 [US2] Verify TTS unit tests T013 pass; verify TTS integration tests T014 pass; verify all previous tests still green

**Checkpoint**: `audio_path` is a real WAV file on disk. `duration_seconds > 0`. All unit + integration tests green.

---

## Phase 5: User Story 3 — MCP Integration (Priority: P3)

**Goal**: `audio_overview` MCP tool successfully calls the live FastAPI endpoint via the MCP client and returns a valid non-error response. MCP integration test added.

**Independent Test**:
```bash
# Via Kong MCP Gateway
curl -s -X POST http://localhost:8000/plaudelm/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "apikey: $KONG_MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"audio_overview","arguments":{"notebook":"kong","topic":"rate limiting"}}}' \
  | jq '.result.content[0].text | fromjson | .script | length'
# → number ≥ 200
```

### Tests for User Story 3 (write FIRST — must FAIL before implementation)

- [ ] T019 [US3] Write `mcp/tests/integration/tools/audio.integration.test.ts` (`@integration`): two tests: (1) `returns a valid audio overview response for an existing topic` — calls `audio_overview` with `{notebook: 'kong', topic: 'rate limiting'}`, asserts `isError` is falsy and `script.length >= 200`; (2) `returns isError true when FastAPI returns 404` — calls with topic that has no chunks, asserts `result.isError === true`

### Implementation for User Story 3

- [ ] T020 [US3] Confirm `mcp/src/tools/audio.ts` requires no changes — verify tool schema matches `data-model.md` (script min 200, audio_path string, duration_seconds positive); if any drift found, fix contract first per Article IV.6
- [ ] T021 [US3] Run `mcp/tests/contract/tools/audio.test.ts` to confirm it still passes (no changes needed — just verify)
- [ ] T022 [US3] Verify MCP integration test T019 passes against live stack

**Checkpoint**: All three user stories independently functional. `audio_overview` tool works end-to-end via Kong MCP Gateway.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T023 [P] Run `mypy --strict query/audio.py query/models.py query/config.py` — fix any type errors
- [ ] T024 [P] Run `black query/audio.py query/models.py query/config.py query/main.py` and `ruff check query/` — fix all formatting issues
- [ ] T025 Run full test suite: `cd query && ./venv/bin/pytest tests/unit/ tests/integration/ -v`; confirm all pass; confirm no regression in existing 30 query unit tests
- [ ] T026 Run full MCP test suite: `cd mcp && npm run test:all`; confirm all pass; confirm 72 existing tests still green
- [ ] T027 Update `MEMORY.md`: mark Spec #7 in progress → add session notes; update Known Issues (remove "audio_overview returns 404" note)
- [ ] T028 Commit spec artifacts: `spec(010): add spec, plan, research, data-model, contracts, quickstart for Spec #7 — Refs #10`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T003 and T004 are parallel
- **Foundational (Phase 2)**: Depends on Phase 1; T006 and T007 are parallel after T005
- **US1 (Phase 3)**: Depends on Phase 2; T008 and T009 are parallel (write tests first)
- **US2 (Phase 4)**: Depends on Phase 3 (replaces stub); T013 and T014 are parallel (write tests first)
- **US3 (Phase 5)**: Depends on Phase 4 (needs real TTS output)
- **Polish (Phase 6)**: Depends on Phase 5; T023 and T024 are parallel

### Within Each User Story

1. Tests written first (Red) — must fail before implementation starts
2. Implementation written to pass tests (Green)
3. Verify existing tests still pass (no regression)

### Parallel Opportunities

```
Phase 1:  T001 → T002 | T003 [P] | T004 [P]
Phase 2:  T005 → T006 [P] | T007 [P]
Phase 3:  T008 [P] | T009 [P] → T010 → T011 → T012
Phase 4:  T013 [P] | T014 [P] → T015 → T016 → T017 → T018
Phase 5:  T019 → T020 [P] | T021 [P] → T022
Phase 6:  T023 [P] | T024 [P] → T025 → T026 → T027 → T028
```

---

## Implementation Strategy

### MVP (User Story 1 only — script generation without real TTS)

1. Complete Phase 1 + Phase 2 (setup + foundational)
2. Complete Phase 3 (US1): script generation, 404/422 guards, unit + integration tests green
3. **STOP and VALIDATE**: `curl` returns 200 with script ≥ 200 chars; audio_path is a stub path
4. Commit: `test(010): red phase — unit + integration tests for script generation`

### Full Delivery (all 3 user stories)

1. MVP above
2. Phase 4 (US2): real TTS, WAV on disk, positive duration
3. Phase 5 (US3): MCP integration test green
4. Phase 6: polish, mypy, formatters, full test run
5. PR with `Closes #10`

---

## Notes

- TDD is mandatory (CONSTITUTION.md Article II.1) — never write implementation before tests
- pyttsx3 blocks the event loop — wrap in `run_in_executor` (see T015)
- `AUDIO_OUTPUT_DIR` must be created at startup if missing — Docker volume may not pre-create subdirs
- `docker compose build --no-cache` required per Article IV.5 — never skip
- Existing contract test `mcp/tests/contract/tools/audio.test.ts` already passes — do not break it
