# Claude Code — Bootstrap Prompt

Paste this as your first message in every new Claude Code session.

---

## Prompt

```
Read these four files in order before doing anything else:
1. CONSTITUTION.md  — non-negotiable rules you must follow
2. ARCHITECTURE.md  — authoritative system design
3. CLAUDE.md        — project context, stack, conventions
4. MEMORY.md        — current state and what's next

After reading all four:
1. Confirm you have read and understood the CONSTITUTION — state the five
   absolute rules from Article I and Article II.
2. Summarize current project state from MEMORY.md in 3 sentences.
3. Tell me what the next action is and which spec it requires.

Then ask me: "Which spec should we work on first?"
Do not write any implementation code until I answer.
```

---

## Spec-First Session Starter

Use this when beginning work on a specific spec:

```
We are working on Spec #[N] — [title].
The GitHub Issue is #[issue_number].

Before writing any code:
1. Show me the acceptance criteria from the spec
2. Write the failing tests first (red phase) for:
   - unit tests in [mcp/tests/unit/ | query/tests/unit/]
   - contract tests in mcp/tests/contract/ (if MCP tool)
3. Confirm all tests fail as expected
4. Then implement the minimum code to make them pass (green phase)
5. Refactor
6. Update MEMORY.md

Remember: CONSTITUTION.md Article II.1 — Red → Green → Refactor. Always.
```

---

## Session Ender

Use this at the end of every session:

```
Session complete. Please:
1. Update MEMORY.md:
   - Mark completed tasks with [x]
   - Add any new backlog items discovered
   - Add new architecture decisions to the ADL with today's date
   - Add any new issues to Known Issues
2. List the commit messages for this session's work
3. Confirm all tests are passing
```

---

## Quick Reference — Running Tests

```bash
# MCP server — unit tests
cd mcp && npm test

# MCP server — integration tests (requires running services)
cd mcp && npm run test:integration

# MCP server — contract tests
cd mcp && npm run test:contract

# Query service — unit tests
cd query && pytest tests/unit/

# Query service — integration tests (requires running services)
cd query && pytest tests/integration/ -m integration

# Full E2E suite (requires full docker compose stack)
npm run test:e2e

# All tests
npm run test:all
```

---

## Quick Reference — Starting the Stack

```bash
# Start everything
docker compose up -d

# Pull Ollama models (first time)
./scripts/pull-models.sh

# Initialize Qdrant collections (first time)
python3 scripts/init-qdrant.py

# Initialize Neo4j constraints + indexes (first time)
python3 scripts/init-neo4j.py

# Apply Kong config
deck gateway sync kong/kong-ollama.yaml --kong-addr http://localhost:8001

# Check all services
docker compose ps
```

---

## Quick Reference — MCP Tool Testing (once built)

```bash
# Test via Claude Desktop (stdio)
# Add to claude_desktop_config.json, restart Claude Desktop

# Test via HTTP (SSE mode)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"tool": "list_notebooks", "arguments": {}}'

# Test query tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"tool": "query", "arguments": {"question": "How does Kong AI Gateway support MCP?", "notebook": "kong"}}'
```

---

## Spec Order (from MEMORY.md)

| # | Spec | Status |
|---|---|---|
| 1 | Neo4j Infrastructure | ⬜ Not started |
| 2 | n8n Graph Extraction Step | ⬜ Not started |
| 3 | Query Service (FastAPI + GraphRAG) | ⬜ Not started |
| 4 | MCP Server (all 7 tools) | ⬜ Not started |
| 5 | Kong MCP Gateway Route | ⬜ Not started |
| 6 | Test Suite (unit + integration + contract + e2e) | ⬜ Not started |
| 7 | Audio Overview | ⬜ Not started |

**Constitutional reminder:** No implementation begins without a GitHub Issue spec.
No code is merged with failing tests. No values are hardcoded. Ever.
