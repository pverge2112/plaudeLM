# PROMPT.md — plaudeLM Claude Code Sessions

---

## Bootstrap Prompt (paste at the start of every session)

```
Read these four files in order before doing anything else.
Do NOT use grep, glob, or Bash to explore — use vexp run_pipeline if you need context.

1. CONSTITUTION.md  — non-negotiable rules you must follow
2. ARCHITECTURE.md  — authoritative system design
3. CLAUDE.md        — project context, stack, conventions
4. MEMORY.md        — current state and what's next

After reading all four:

1. Confirm you have read the CONSTITUTION — quote the Article I and Article II 
   rules verbatim, exactly as written. Do not paraphrase.
2. Summarize current project state from MEMORY.md in 3 sentences.
3. State the next action and which spec it requires.

Then ask me: "Which spec should we work on first?"

Do not write any implementation code until I answer.
```

---

## Spec-First Session Starter

Use this when beginning work on a specific spec:

```
We are working on Spec #[N] — [title].
GitHub Issue: #[issue_number]

Before writing any code:
1. Run /speckit.specify to generate or review the spec
2. Show me the acceptance criteria — confirm each one is testable
3. Run /speckit.plan then /speckit.tasks
4. Create beads issues for each task with correct blocking relationships:
   bd add "[task name]" --blocks [id] --blocked-by [id]
5. Run bd ready to confirm the first unblocked task
6. bd update <id> --status=in_progress
7. Write failing tests first (red phase):
   - TypeScript: mcp/tests/unit/ or mcp/tests/contract/
   - Python:     query/tests/unit/
8. Confirm tests fail as expected
9. Implement minimum code to pass (green phase)
10. Refactor without breaking tests
11. bd update <id> --status=closed
12. Run bd ready — show me what just unlocked

Constitution reminder (Article II.1): Red → Green → Refactor. Always.
No implementation without a spec. No merging failing tests. Ever.
```
git add MEMORY.md && bd sync 2>&1 && git commit -m "docs(memory): session wrap-up — Spec #5 spec written, stack prep done

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>" && git push -u origin 002-kong-mcp-gateway 2>&1
---

## TDD Task Prompt

Use this when picking up an existing beads task without starting a new spec:

```
Run bd ready and pick the highest priority unblocked task.

For that task:
1. Show me the task description and acceptance criteria
2. bd update <id> --status=in_progress
3. Identify which test files need to be written:
   - MCP unit:        mcp/tests/unit/
   - MCP contract:    mcp/tests/contract/
   - MCP integration: mcp/tests/integration/
   - Query unit:      query/tests/unit/
   - Query integration: query/tests/integration/
   - E2E:             tests/e2e/
4. Write failing tests first — confirm they fail
5. Implement minimum code to pass
6. Refactor
7. Run full test suite:
   cd mcp && npm test
   cd query && pytest
8. Confirm all green
9. bd update <id> --status=closed
10. bd ready — show me what just unlocked
```

---

## Session Ender (paste at the end of every session)

```
Session complete. Before we close:

1. Run the full test suite and confirm everything is green:
   cd mcp && npm test
   cd mcp && npm run test:contract
   cd query && pytest tests/unit/
   (If integration or e2e tests were touched, run those too)

2. Update beads:
   - Confirm all completed tasks are closed: bd update <id> --status=closed
   - Run bd ready and paste the output so I can see what unlocked next session

3. Update MEMORY.md:
   - Mark completed tasks with [x]
   - Add any newly discovered tasks to the backlog
   - Add new architecture decisions to the ADL with today's date
   - Add any new issues to Known Issues
   - Update "Last updated" date and "Current Status" phase if it changed

4. List all git commits made this session with their messages
   (format: type(scope): description — Refs #NNN)

5. Flag anything that needs attention before merging:
   - Any tests skipped with justification
   - Any constitution rules that were bent and why
   - Any new npm or pip dependencies added
```

---

## Quick Reference — Beads Commands

```bash
bd ready                               # unblocked tasks — start here every session
bd list                                # all tasks
bd add "[task name]"                   # add a new task
bd update <id> --status=in_progress    # mark started
bd update <id> --status=closed         # mark complete
bd graph                               # visualize dependency graph
```

---

## Quick Reference — Spec-Kit Commands

```
/speckit.specify     — define a new feature spec
/speckit.plan        — generate implementation plan from spec
/speckit.tasks       — generate task breakdown
/speckit.analyze     — cross-check spec against constitution
/speckit.implement   — begin TDD implementation of spec
```

---

## Quick Reference — Running Tests

```bash
# MCP server
cd mcp && npm test                                        # unit tests
cd mcp && npm run test:integration                        # needs running services
cd mcp && npm run test:contract                           # schema / contract tests

# Query service
cd query && pytest tests/unit/                            # unit tests
cd query && pytest tests/integration/ -m integration      # needs running services
cd query && pytest --cov=. --cov-report=term-missing      # coverage report

# Full E2E (needs full docker compose stack)
npm run test:e2e

# All at once
npm run test:all
```

---

## Quick Reference — Starting the Stack

```bash
# Start everything
docker compose up -d

# First-time setup only
./scripts/pull-models.sh        # pull nomic-embed-text + llama3.2 into Ollama
python3 scripts/init-qdrant.py  # create kong / personal / music collections
python3 scripts/init-neo4j.py   # create Neo4j constraints + indexes

# Apply Kong AI Gateway config
deck gateway sync kong/kong-ollama.yaml --kong-addr http://localhost:8001

# Verify all services healthy
docker compose ps
```

---

## Quick Reference — MCP Tool Testing (once built)

```bash
# stdio — add to claude_desktop_config.json, restart Claude Desktop
# then call tools directly in a Claude conversation

# SSE mode — test via HTTP
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"tool": "list_notebooks", "arguments": {}}'

curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"tool": "query", "arguments": {
    "question": "How does Kong AI Gateway support MCP?",
    "notebook": "kong",
    "top_k": 5
  }}'

curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"tool": "search_concepts", "arguments": {
    "query": "OAuth",
    "notebook": "kong"
  }}'
```

---

## Spec Order + Beads Dependency Map

| # | Spec | Blocked by |
|---|---|---|
| 1 | Neo4j Infrastructure | — |
| 2 | n8n Graph Extraction Step | #1 |
| 3 | Query Service (FastAPI + GraphRAG) | #1, #2 |
| 4 | MCP Server (all 7 tools) | #3 |
| 5 | Kong MCP Gateway Route | #4 |
| 6 | Test Suite (unit + integration + contract + e2e) | #3, #4 |
| 7 | Audio Overview | #3 |

`bd ready` on a fresh install should show only Spec #1 — everything else is blocked.

---

## Constitutional Reminders

- No implementation without a GitHub Issue spec
- No merging failing tests — ever
- No hardcoded values — ever
- All MCP tools must have integration tests against real services
- All Ollama calls route through Kong AI Gateway — never direct
- Red → Green → Refactor — always, no exceptions
