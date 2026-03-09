# Kong Konnect Configuration Reference — plaudeLM

> Use this document when configuring services, routes, and plugins in Kong Konnect.
> All upstreams use Docker service names — the data plane runs on the `plaudelm-network` Docker network.
> Last updated: 2026-03-08

---

## Overview

| Service | Upstream | Routes | Plugins |
|---|---|---|---|
| `plaudelm-embed` | placeholder (plugin routes to `ollama:11434`) | `POST /plaudelm/embed` | ai-proxy-advanced, http-log |
| `plaudelm-chat` | placeholder (plugin routes to `ollama:11434`) | `POST /plaudelm/chat` | ai-proxy-advanced, ai-rate-limiting-advanced, ai-pii-sanitizer, http-log |
| `plaudelm-mcp` | `http://plaudelm-mcp:3000` | `GET /plaudelm/mcp/sse` `POST /plaudelm/mcp/messages` | ai-mcp-proxy, key-auth, http-log |

---

## Service 1 — `plaudelm-embed`

**Purpose**: Proxies embedding requests to Ollama `nomic-embed-text`. Called by the FastAPI query service when embedding questions for vector search.

### Service Config

| Field | Value |
|---|---|
| Name | `plaudelm-embed` |
| URL | `http://localhost:1` (placeholder — never called; `ai-proxy-advanced` routes via `upstream_url` in plugin config) |
| Connect Timeout | `60000` ms |
| Read Timeout | `60000` ms |
| Write Timeout | `60000` ms |

### Route

| Field | Value |
|---|---|
| Name | `plaudelm-embed-route` |
| Path | `/plaudelm/embed` |
| Methods | `POST` |
| Strip Path | `true` |

### Plugins

#### `ai-proxy-advanced`

> ⚠️ There is no native `ollama` provider. Use `provider: llama2` with `llama2_format: ollama` and an explicit `upstream_url`.

```yaml
name: ai-proxy-advanced
config:
  targets:
    - route_type: llm/v1/embeddings
      model:
        provider: llama2
        name: nomic-embed-text
        options:
          llama2_format: ollama
          upstream_url: http://ollama:11434/api/embed
      weight: 100
```

#### `http-log`

| Field | Value |
|---|---|
| HTTP Endpoint | your log sink URL |
| Method | `POST` |

---

## Service 2 — `plaudelm-chat`

**Purpose**: Proxies LLM chat/completion requests to Ollama `llama3.2`. Called by the FastAPI query service for answer generation and concept extraction, and by n8n for document summarization and graph entity extraction during ingest.

### Service Config

| Field | Value |
|---|---|
| Name | `plaudelm-chat` |
| URL | `http://localhost:1` (placeholder — never called; `ai-proxy-advanced` routes via `upstream_url` in plugin config) |
| Connect Timeout | `120000` ms |
| Read Timeout | `120000` ms |
| Write Timeout | `120000` ms |

> Higher timeouts — llama3.2 on CPU can take 30–60s for longer completions.

### Route

| Field | Value |
|---|---|
| Name | `plaudelm-chat-route` |
| Path | `/plaudelm/chat` |
| Methods | `POST` |
| Strip Path | `true` |

### Plugins

#### `ai-proxy-advanced`

```yaml
name: ai-proxy-advanced
config:
  targets:
    - route_type: llm/v1/chat
      model:
        provider: llama2
        name: llama3.2
        options:
          llama2_format: ollama
          upstream_url: http://ollama:11434/api/chat
      weight: 100
```

#### `ai-rate-limiting-advanced`

| Field | Value |
|---|---|
| Strategy | `local` |
| Limits | per your preference |
| Window Size | per your preference |

#### `ai-pii-sanitizer`

| Field | Value |
|---|---|
| Config | default |

#### `http-log`

| Field | Value |
|---|---|
| HTTP Endpoint | your log sink URL |
| Method | `POST` |

---

## Service 3 — `plaudelm-mcp`

**Purpose**: Proxies MCP protocol traffic (SSE + message posting) to the MCP server container. All Claude clients (Desktop, Code, claude.ai, Cowork) connect here. Key-auth enforces API key authentication on every request.

### Service Config

| Field | Value |
|---|---|
| Name | `plaudelm-mcp` |
| URL | `http://plaudelm-mcp:3000` |
| Connect Timeout | `120000` ms |
| Read Timeout | `120000` ms |
| Write Timeout | `120000` ms |

> Higher timeouts required — MCP SSE connections are long-lived streams.

### Route

> Single route — Streamable HTTP uses one endpoint for all MCP traffic. `strip_path: true` strips `/plaudelm/mcp` so the upstream receives requests at `/mcp`.

| Field | Value |
|---|---|
| Name | `plaudelm-mcp-route` |
| Path | `/plaudelm/mcp` |
| Methods | `GET`, `POST`, `DELETE` |
| Strip Path | `true` |

> `strip_path: true` — Kong strips `/plaudelm/mcp`; upstream receives `POST /`, `GET /`, `DELETE /`. The MCP server handles all three methods at the root path.

### Plugins

#### `ai-mcp-proxy`

> Mode `passthrough-listener` proxies all traffic to the upstream MCP server without tool conversion. Kong enforces ACL and logs — the MCP server handles all tool definitions. No `tools` array needed in this mode.

```yaml
name: ai-mcp-proxy
config:
  mode: passthrough-listener
  server:
    timeout: 120000          # ms — must cover full Ollama inference window (default is 10000, too short)
    forward_client_headers: true
  logging:
    log_statistics: true
    log_payloads: false
    log_audits: true
```

#### `key-auth`

```yaml
name: key-auth
config:
  key_names:
    - apikey
```

> Clients send: `apikey: <KONG_MCP_API_KEY>` in the request header.

#### `http-log`

| Field | Value |
|---|---|
| HTTP Endpoint | your log sink URL |
| Method | `POST` |

---

## Consumer

| Field | Value |
|---|---|
| Username | `paul` |
| Credential type | `key-auth` |
| Key value | value of `KONG_MCP_API_KEY` from `.env` |

> The `key-auth` plugin is on the service — not the consumer. The consumer only needs a key-auth credential created and associated with it.

---

## Claude Client Config

Once services and routes are live, configure Claude clients to connect via Kong:

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "plaudelm": {
      "type": "http",
      "url": "http://localhost:8000/plaudelm/mcp",
      "headers": {
        "apikey": "<KONG_MCP_API_KEY>"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http plaudelm http://localhost:8000/plaudelm/mcp \
  --header "apikey:<KONG_MCP_API_KEY>"
```

---

## MCP Tool → Kong Path Mapping

| Action | Method | Kong Path |
|---|---|---|
| Initialize session + tool calls | `POST` | `/plaudelm/mcp` |
| Server-initiated SSE stream | `GET` | `/plaudelm/mcp` |
| Close session | `DELETE` | `/plaudelm/mcp` |

---

## Verification

After applying config, verify with:

```bash
# No key → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/plaudelm/mcp

# Valid key, no session → 400 (expected — no initialize request body)
curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "apikey: <KONG_MCP_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:8000/plaudelm/mcp

# Embed route reachable
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/plaudelm/embed

# Chat route reachable
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/plaudelm/chat
```
