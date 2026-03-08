# Quickstart: Knowledge Base Tools Interface (MCP Server)

**Branch**: `001-mcp-server` | **Date**: 2026-03-07

---

## Prerequisites

The full stack must be running before the MCP server is useful:

```bash
# Ensure the base stack is up (Qdrant, Neo4j, Ollama, n8n, query service)
docker compose up -d qdrant neo4j ollama n8n query

# Verify the query service is healthy
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

---

## Environment Setup

Copy and configure the environment file:

```bash
cp .env.example .env
# Edit .env — at minimum, set:
# NEO4J_PASSWORD=changeme
# N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

Required env vars for the MCP server (all must be set):

```
OLLAMA_BASE_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme
KONG_PROXY_URL=http://localhost:8000
QUERY_SERVICE_URL=http://localhost:8000
N8N_WEBHOOK_URL=http://localhost:5678/webhook
MCP_TRANSPORT=stdio
MCP_PORT=3000
```

---

## Run via Docker Compose (recommended)

```bash
# Build and start the MCP server alongside the full stack
docker compose up -d plaudelm-mcp

# Check logs
docker compose logs -f plaudelm-mcp
```

---

## Run Locally (development)

```bash
cd mcp
npm install
npm run build

# stdio mode (for Claude Desktop / Claude Code)
MCP_TRANSPORT=stdio node dist/index.js

# SSE mode (for Kong MCP Gateway)
MCP_TRANSPORT=sse MCP_PORT=3000 node dist/index.js
```

---

## Connect Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "plaudelm": {
      "command": "node",
      "args": ["/path/to/plaudeLM/mcp/dist/index.js"],
      "env": {
        "OLLAMA_BASE_URL": "http://localhost:11434",
        "QDRANT_URL": "http://localhost:6333",
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "changeme",
        "KONG_PROXY_URL": "http://localhost:8000",
        "QUERY_SERVICE_URL": "http://localhost:8000",
        "N8N_WEBHOOK_URL": "http://localhost:5678/webhook",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

Restart Claude Desktop after saving. The 7 tools will appear in Claude's tool list.

---

## Run Tests

```bash
cd mcp

# Unit tests (no running services required)
npm test

# Integration tests (requires full stack running)
npm run test:integration

# Contract tests (no running services required)
npm run test:contract

# All tests
npm run test:all
```

---

## Verify Tools Work

After connecting to Claude Desktop, ask Claude:

```
List my knowledge base notebooks.
```

Expected: Claude calls `list_notebooks` and returns stats for kong, personal, and music notebooks.

```
Search for concepts related to "API gateway" in the kong notebook.
```

Expected: Claude calls `search_concepts` and returns matching concepts.

---

## Troubleshooting

**MCP server exits immediately with "Missing required environment variables"**
→ Check that all env vars listed above are set in `.env` or your Claude Desktop config.

**Tool calls hang or timeout**
→ Verify the query service is running: `curl http://localhost:8000/health`
→ Verify Neo4j is running: `docker compose ps neo4j`
→ Verify Qdrant is running: `curl http://localhost:6333/health`

**Claude Desktop doesn't show the tools**
→ Check Claude Desktop logs for MCP connection errors.
→ Verify `node dist/index.js` runs without error from the command line.
→ Ensure the path in `claude_desktop_config.json` is absolute, not relative.
