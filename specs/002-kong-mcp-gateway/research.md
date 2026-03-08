# Research: Kong MCP Gateway Route

**Feature**: `002-kong-mcp-gateway`
**Date**: 2026-03-08
**Sources**: Training knowledge (cutoff Aug 2025); `mcp/src/index.ts` (direct code inspection); `docker-compose.yml` (direct inspection); `.env.example` (direct inspection)
**Note**: Web search was unavailable in this session. Findings from training knowledge are flagged `[TRAINING]` and should be verified against current Kong docs before implementation. Findings from direct code inspection are flagged `[CODE]` and are authoritative.

---

## R1: MCP SSE Endpoint Paths

**Source**: `mcp/src/index.ts` [CODE]

**Decision**: Kong must route TWO paths to the MCP server, not one.

| Path | Method | Purpose |
|------|--------|---------|
| `GET /sse` | GET | Client opens SSE connection (long-lived) |
| `POST /messages` | POST | Client sends message to server (with `?sessionId=X`) |
| `GET /health` | GET | Container healthcheck |

**Rationale**: The MCP SSE transport splits client→server messages from the server→client SSE stream onto two HTTP paths. Kong must proxy both. A single `/notebooklm/mcp` prefix route covering all paths is the simplest approach — Kong's prefix matching handles all three.

**Alternatives considered**:
- One route per path — more precise but unnecessary complexity for single-user home lab.
- Path rewriting — not needed; MCP server's paths are already clean `/sse` and `/messages`.

---

## R2: Kong Declarative Config Format

**Source**: Training knowledge [TRAINING] — verify against `docs.konghq.com/gateway`

**Decision**: Use `_format_version: "3.0"` for Kong Gateway 3.x declarative config.

```yaml
_format_version: "3.0"
services:
  - name: notebooklm-mcp
    url: http://notebooklm-mcp:3000
    connect_timeout: 120000
    read_timeout: 120000
    write_timeout: 120000
    routes:
      - name: notebooklm-mcp-route
        paths:
          - /notebooklm/mcp
        strip_path: false
    plugins:
      - name: key-auth
        config:
          key_names:
            - apikey
      - name: http-log
        config:
          http_endpoint: http://kong:8001/log   # placeholder — see R5
consumers:
  - username: paul
    keyauth_credentials:
      - key: ${KONG_MCP_API_KEY}
```

**Rationale**: `_format_version: "3.0"` is required for Kong 3.x. Older `"1.1"` format is deprecated and may produce warnings. Service-level plugins apply to all routes on that service.

---

## R3: `ai-mcp-proxy` Plugin Availability

**Source**: Training knowledge + project ARCHITECTURE.md [TRAINING + SPEC]

**Decision**: Plan for `ai-mcp-proxy` as a Kong Enterprise plugin; implement with graceful fallback to standard Kong proxying if unavailable.

**Findings**:
- Kong AI Gateway announced MCP Gateway capabilities in early 2025
- Plugin name `ai-mcp-proxy` appears in Kong Enterprise AI Gateway plugin suite (kong/kong-gateway image — already used in this project)
- The plugin provides MCP-aware protocol handling on top of SSE proxying
- **If unavailable on the running Kong version**: standard Kong reverse proxy handles SSE natively — Kong doesn't need a special plugin to proxy long-lived HTTP connections; `key-auth` + `http-log` provide auth and observability without `ai-mcp-proxy`

**Verification required before Phase 3 (Green)**: Run `curl http://localhost:8001/` against the running Kong instance and check available plugins in the response, or check `curl http://localhost:8001/plugins/schema/ai-mcp-proxy`.

**Fallback config** (if `ai-mcp-proxy` unavailable):
```yaml
# Omit ai-mcp-proxy plugin block entirely.
# key-auth + http-log are sufficient for auth + observability.
# SSE is standard HTTP — no special plugin required.
```

---

## R4: Kong DB-less Mode Config Reload

**Source**: Training knowledge [TRAINING] — verify against `docs.konghq.com/gateway/latest/production/deployment-topologies/db-less-and-declarative-config/`

**Decision**: Use `POST /config` to Kong Admin API for hot-reload; do NOT rely on `deck sync` as sole deployment mechanism.

**Findings**:

| Method | How it works | Persists past restart? |
|--------|-------------|----------------------|
| Edit file + `docker compose restart kong` | Kong re-reads `kong.yaml` on startup | ✅ Yes |
| `curl -sX POST http://localhost:8001/config -F config=@kong/kong.yaml` | Hot-reloads without restart | ✅ Yes (file already updated) |
| `deck sync` against DB-less admin API | Applies to running instance | ❌ No — lost on restart unless file also updated |

**Recommended workflow**:
1. Edit `kong/kong.yaml`
2. `deck validate kong/kong.yaml` (syntax check — does NOT require running Kong)
3. `curl -sX POST http://localhost:8001/config -F config=@kong/kong.yaml` (hot-reload)
4. Verify: `curl http://localhost:8001/services`

`deck sync` is useful for `deck diff` (drift detection) but is NOT the primary deployment mechanism for DB-less Kong in this project.

---

## R5: decK Environment Variable Interpolation

**Source**: Training knowledge [TRAINING] — verify against `docs.konghq.com/deck/latest/guides/environment-variables/`

**Decision**: Use `${VAR_NAME}` syntax with `--env-var-expansion` flag on deck commands.

**Findings**:
- Syntax: `${VAR_NAME}` (curly brace required — `$VAR` without braces is NOT supported by decK)
- CLI flag: `deck validate --env-var-expansion` / `deck diff --env-var-expansion`
- Works for any string field, including consumer `keyauth_credentials[].key`
- Variables must be set in the shell environment before running deck commands
- The `KONG_MCP_API_KEY` env var is set in `.env` and exported before deck validation

**Example**:
```yaml
consumers:
  - username: paul
    keyauth_credentials:
      - key: ${KONG_MCP_API_KEY}
```
```bash
export KONG_MCP_API_KEY=my-secret-key
deck validate --env-var-expansion kong/kong.yaml  # substitutes before validating
```

**Note**: Docker Compose env var substitution (`${VAR}`) uses the same syntax, but that's Docker Compose expanding vars in `docker-compose.yml` before passing to containers. The decK substitution is separate — decK reads env vars from the shell at validation/sync time.

---

## R6: Kong SSE Upstream Timeout Configuration

**Source**: Training knowledge [TRAINING]

**Decision**: Set `connect_timeout`, `read_timeout`, and `write_timeout` all to `120000` (120 seconds) on the Kong service definition.

**Rationale**:
- Default Kong timeout is 60s — insufficient for Ollama inference (~60-90s for query/ingest on CPU)
- SC-006 requires no timeout during normal tool calls
- 120s provides headroom above the 90s SC-003 ingest target
- All three timeout fields must be set; setting only `read_timeout` is insufficient (Kong uses the minimum of the three for SSE long-poll connections)

---

## R7: Existing Port Conflict

**Source**: `docker-compose.yml` [CODE]

**Decision**: Change `query` service host port from `8000:8000` to `8081:8000`.

**Finding**: Both `kong` (proxy) and `query` (FastAPI) bind host port `8000`. This prevents the stack from starting with both services enabled. The `query` service host port binding exists for direct host access during development; the MCP server accesses query via Docker network at `http://query:8000` (container port, no host binding needed).

**Resolution**:
- `query` service: change `ports` from `"8000:8000"` to `"8081:8000"` (host:container)
- `QUERY_SERVICE_URL` env var uses `http://query:8000` (internal Docker network) — no change needed
- Direct host access to query available at `http://localhost:8081/health` after fix

---

## R8: `kong/kong.yaml` File Creation

**Source**: `docker-compose.yml` [CODE] + `kong/` directory inspection [CODE]

**Decision**: Create `kong/kong.yaml` from scratch — file does not exist yet.

**Finding**: `docker-compose.yml` mounts `./kong:/kong/declarative:ro` and sets `KONG_DECLARATIVE_CONFIG: /kong/declarative/kong.yaml`. The `kong/` directory is empty. The ARCHITECTURE.md and earlier MEMORY.md references to `kong/kong-ollama.yaml` are incorrect — the mounted path requires `kong/kong.yaml`.

**Initial content needed**: A valid `_format_version: "3.0"` file with the two existing routes for `/notebooklm/embed` and `/notebooklm/chat` (which were planned in ARCHITECTURE.md but never implemented), PLUS the new `/notebooklm/mcp` route for this spec.

**Scope decision**: This spec creates the FIRST version of `kong/kong.yaml`, implementing all three routes at once. The embed and chat routes were always part of the intended config and are trivially defined (ai-proxy plugin pointing to Ollama).
