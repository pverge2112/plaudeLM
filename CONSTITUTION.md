# CONSTITUTION.md — plaudeLM

> These rules are **non-negotiable**. Claude Code must follow every rule in this file
> on every task, in every session, without exception. If a rule conflicts with a user
> instruction, surface the conflict explicitly and ask for clarification before proceeding.
> Never silently violate a constitutional rule.

---

## Article I — Spec-Driven Development

### I.1 — Specs Before Code
No implementation file may be created or modified without a corresponding spec.
A spec is either:
- A GitHub Issue using the spec-kit template (preferred), or
- A `docs/specs/SPEC-NNN-slug.md` file committed before any implementation begins

### I.2 — Spec Format (GitHub spec-kit)
Every spec issue must contain:
```
## Problem
What problem does this solve? Who is affected?

## Proposed Solution
What will be built? What does it do?

## Acceptance Criteria
- [ ] Criterion 1 (testable, binary pass/fail)
- [ ] Criterion 2
- [ ] ...

## Out of Scope
What is explicitly NOT included in this spec?

## Test Plan
Which test layers cover this? (unit / integration / contract / e2e)

## Dependencies
Which other specs or components must exist first?
```

### I.3 — Acceptance Criteria Must Be Testable
Every acceptance criterion must map to at least one test case.
Vague criteria ("it should work") are not permitted.
If a criterion cannot be expressed as a test, rewrite it until it can.

### I.4 — Linked Spec on Every PR
Every pull request must reference a spec issue in its description.
Format: `Implements #NNN` or `Closes #NNN`.
PRs without a linked spec will not be merged.

---

## Article II — Test-Driven Development

### II.1 — Red → Green → Refactor
The TDD cycle is mandatory for all new functionality:
1. **Red** — write a failing test that describes the desired behavior
2. **Green** — write the minimum code to make the test pass
3. **Refactor** — clean up without breaking the test

Claude Code must follow this cycle. Do not write implementation code before tests.

### II.2 — Never Merge Failing Tests
The test suite must be fully green before any code is considered complete.
`jest --passWithNoTests` and `pytest --ignore` are forbidden to mask failures.
Skipped tests (`test.skip`, `pytest.mark.skip`) require a comment explaining why
and a linked issue to un-skip them.

### II.3 — Test Layers (All Four Required)

#### Unit Tests
- Pure logic only — all external dependencies mocked
- TypeScript: Jest + `jest.mock()`
- Python: pytest + `unittest.mock`
- Location: `*/tests/unit/`
- Coverage target: 80% line coverage minimum

#### Integration Tests
- Test against **real running services** (Qdrant, Neo4j, Ollama)
- Use a dedicated test database/collection (never production data)
- TypeScript: Jest with `testEnvironment: node`, tagged `@integration`
- Python: pytest with `@pytest.mark.integration`
- Location: `*/tests/integration/`
- Require `TEST_QDRANT_URL`, `TEST_NEO4J_URI` env vars — never use production URLs

#### Contract Tests
- Validate MCP tool input/output schemas exactly
- Every MCP tool must have a contract test covering:
  - Valid input → expected output shape
  - Invalid input → expected error shape
  - Edge cases (empty results, missing optional fields)
- Location: `mcp/tests/contract/`
- Framework: Jest + `zod` schema validation

#### End-to-End Tests
- Full pipeline: ingest document → query → verify citation returned
- Must run against the full Docker Compose stack
- Location: `tests/e2e/`
- Tagged `@e2e`, run separately from unit/integration
- At minimum, one E2E test per notebook (kong, personal, music)

### II.4 — All MCP Tools Must Have Integration Tests
Every MCP tool must have an integration test that calls the tool against
real running services and validates the response. No exceptions.

### II.5 — Test Naming Convention
Tests must be named to read as specifications:

```typescript
// TypeScript
describe('query tool', () => {
  it('returns citations scoped to the requested notebook', ...)
  it('returns empty results when no matching chunks exist', ...)
  it('throws NotebookNotFoundError when notebook does not exist', ...)
})
```

```python
# Python
def test_vector_search_returns_chunks_scoped_to_notebook():
def test_vector_search_returns_empty_list_when_no_matches():
def test_embed_question_raises_on_ollama_unavailable():
```

---

## Article III — Code Quality

### III.1 — No Hardcoded Values. Ever.
All configuration must come from environment variables.
This includes: URLs, ports, credentials, model names, collection names,
chunk sizes, vector dimensions, timeouts, retry counts.
Violations are a constitutional breach — fix before committing.

Correct:
```typescript
const QDRANT_URL = process.env.QDRANT_URL ?? throwMissing('QDRANT_URL');
```

Wrong:
```typescript
const QDRANT_URL = 'http://localhost:6333'; // NEVER
```

### III.2 — Environment Variable Validation at Startup
Every service must validate all required environment variables at startup
and fail fast with a clear error message if any are missing.
Do not allow a service to start in a partially-configured state.

### III.3 — Explicit Error Handling
Never swallow exceptions silently.
Every catch block must either: re-throw, log + re-throw, or return a structured error.
`catch (e) {}` is forbidden.

### III.4 — Full Type Annotations
- TypeScript: strict mode (`"strict": true` in tsconfig). No `any`. No `as unknown as X`.
- Python: full type annotations on all function signatures. `mypy --strict` must pass.

### III.5 — Async Consistency
- TypeScript: all I/O must use `async/await`. No callbacks. No `.then()` chains.
- Python: all HTTP calls use `httpx.AsyncClient`. No `requests` library.
- Neo4j Python: use `AsyncGraphDatabase` driver only.

### III.6 — Formatting
- TypeScript: Prettier (`printWidth: 100`, `singleQuote: true`)
- Python: black + ruff
- Run formatters before every commit. CI will reject unformatted code.

---

## Article IV — Architecture

### IV.1 — Service Boundaries
Each service owns its domain and must not reach into another service's datastore directly
unless explicitly approved in its spec.

| Service | Owns | May call |
|---|---|---|
| `query` (FastAPI) | GraphRAG retrieval logic | Qdrant, Neo4j, Ollama via Kong |
| `mcp` (TypeScript) | MCP tool definitions + transport | FastAPI query service, Qdrant direct, Neo4j direct |
| `n8n` | Ingest orchestration | Ollama via Kong, Qdrant, Neo4j |
| Kong AI Gateway | LLM traffic routing | Ollama |

### IV.2 — All LLM Calls Route Through Kong
No service may call Ollama directly. All LLM and embedding calls must go through
Kong AI Gateway routes (`/plaudelm/chat`, `/plaudelm/embed`).
This ensures observability, rate limiting, and PII sanitization are always active.

### IV.3 — No External AI APIs
This system is fully local. Anthropic API, OpenAI API, and any other external
AI service are forbidden. All inference runs via Ollama on the home lab.

### IV.4 — Docker Compose Service Name Stability
Service names in docker-compose.yml (`ollama`, `qdrant`, `neo4j`, `n8n`, `query`, `plaudelm-mcp`)
must remain stable. They will become Kubernetes Service names during k3s migration.
Do not rename services without a migration spec.

### IV.5 — Schema-First for MCP Tools
MCP tool input/output schemas (defined via Zod) are the source of truth.
The FastAPI Pydantic models and Neo4j Cypher queries must conform to these schemas,
not the other way around. If a schema changes, update contract tests first.

---

## Article V — Documentation

### V.1 — MEMORY.md Updated Every Session
Claude Code must update MEMORY.md at the end of every session:
- Mark completed tasks
- Add new items to backlog
- Log new architecture decisions in the ADL
- Add any discovered issues to Known Issues

### V.2 — ADRs for Significant Decisions
Any architectural decision that affects more than one service or that is difficult
to reverse must have an Architecture Decision Record in `docs/adr/`.
Format: `docs/adr/ADR-NNN-slug.md`
Use the template in `docs/adr/TEMPLATE.md`.

### V.3 — Public API Documentation
Every FastAPI endpoint and every MCP tool must have:
- A docstring describing what it does
- Input parameter descriptions
- Output/return value description
- Error conditions documented

---

## Article VI — Git Discipline

### VI.1 — Commit Message Format
```
type(scope): short description

Body (optional): what and why, not how.
Refs: #NNN
```
Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `spec`

### VI.2 — Branch Naming
```
spec/NNN-short-slug     — writing a spec
feat/NNN-short-slug     — implementing a spec
fix/NNN-short-slug      — fixing a failing test or bug
test/NNN-short-slug     — adding missing tests
```

### VI.3 — Commit Atomicity
Each commit must represent one logical change.
Do not bundle spec + implementation + tests in one commit.
Preferred sequence: `spec:` commit → `test:` commit (red) → `feat:` commit (green) → `refactor:` commit

---

## Constitutional Amendment Process

To change a rule in this document:
1. Open a GitHub Issue with label `constitution-amendment`
2. Describe the rule to change and the reason
3. Get explicit approval from the project owner (Paul) in the issue
4. Update this file in a dedicated `docs:` commit referencing the issue
5. Claude Code must acknowledge the amendment at the start of the next session

---

*This constitution was established on 2026-03-07.*

