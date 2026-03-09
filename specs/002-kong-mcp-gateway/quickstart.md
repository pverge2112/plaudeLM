# Quickstart: plaudeLM via Kong MCP Gateway

All Claude clients connect through Kong at `http://localhost:8000/plaudelm/mcp`.
Transport: **MCP Streamable HTTP** (single POST endpoint — not legacy SSE).
Auth: `apikey` header with the value of `KONG_MCP_API_KEY` from `.env`.

---

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "plaudelm": {
      "url": "http://localhost:8000/plaudelm/mcp",
      "headers": {
        "apikey": "<KONG_MCP_API_KEY>"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

---

## Claude Code

```bash
claude mcp add --transport http plaudelm http://localhost:8000/plaudelm/mcp \
  --header "apikey: <KONG_MCP_API_KEY>"
```

Verify it was added:

```bash
claude mcp list
```

---

## Manual Verification

### 1. Check Kong is routing

```bash
# No key → 401 (Kong auth working)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8000/plaudelm/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}},"id":1}'
# Expected: 401
```

### 2. Initialize a session

```bash
curl -s -D - \
  -X POST http://localhost:8000/plaudelm/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "apikey: <KONG_MCP_API_KEY>" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}},"id":1}'
# Expected: HTTP 200, mcp-session-id header present, serverInfo in body
```

### 3. Call list_notebooks (use session ID from step 2)

```bash
curl -s \
  -X POST http://localhost:8000/plaudelm/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "apikey: <KONG_MCP_API_KEY>" \
  -H "mcp-session-id: <SESSION_ID>" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notebooks","arguments":{}},"id":2}'
```

Expected response contains:
```json
{
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"notebooks\":[{\"name\":\"kong\",\"chunk_count\":...},{\"name\":\"personal\",...},{\"name\":\"music\",...}]}"
    }]
  }
}
```

### 4. Run integration test suite

```bash
cd mcp
KONG_PROXY_URL=http://localhost:8000 \
KONG_MCP_API_KEY=<KONG_MCP_API_KEY> \
npm run test:integration -- --testPathPattern=kong-mcp
# Expected: 5/5 green
```

---

## Kong Response Headers (confirm traffic flows through Kong)

Every proxied response includes:
- `x-kong-proxy-latency: <ms>` — time Kong spent processing
- `x-kong-upstream-latency: <ms>` — time the MCP server took to respond

Their presence confirms the request passed through the Konnect data plane.

---

## Stack Prerequisite Checklist

Before connecting any Claude client:

- [ ] `docker compose ps` — all 6 services healthy (kong, query, plaudelm-mcp, neo4j, qdrant, n8n)
- [ ] `scripts/init-neo4j.py` has been run (required for `search_concepts` — creates `conceptNameIndex`)
- [ ] `scripts/init-qdrant.py` has been run (required for all vector ops — creates collections)
- [ ] `KONG_MCP_API_KEY` matches the credential configured in Konnect for consumer `paul`
