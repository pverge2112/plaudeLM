# Feature Specification: Kong MCP Gateway Route

**Feature Branch**: `002-kong-mcp-gateway`
**Created**: 2026-03-08
**Status**: Draft
**Input**: User description: "Kong MCP Gateway Route — Add the /notebooklm/mcp/* route to kong/kong-ollama.yaml with ai-mcp-proxy, key-auth, and http-log plugins. Add notebooklm-mcp service to docker-compose.yml (deferred from MCP Server spec). Enable Claude clients (Desktop, Code, claude.ai) to reach all 7 MCP tools via Kong SSE transport with identical behavior to direct stdio. Acceptance: tool call via Kong SSE returns same result as stdio."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Route MCP Tool Calls Through Kong (Priority: P1)

Paul connects a Claude client (Desktop, Code, or claude.ai) to his knowledge base tools via Kong rather than a direct local connection. All 7 tools work exactly as they do via direct access — the same questions get the same answers, the same documents get ingested — but every request now flows through Kong, which logs it and enforces policy.

**Why this priority**: This is the entire purpose of the spec. Without a working Kong route, there is no proxied access path, no observability on MCP traffic, and the Kong MCP Gateway is non-functional. Everything else in this spec depends on this being correct.

**Independent Test**: Can be fully tested by configuring a Claude client to use the Kong-proxied MCP endpoint and asking Claude "What's in my knowledge base?" — Claude must return notebook stats via `list_notebooks` identical to what direct stdio returns.

**Acceptance Scenarios**:

1. **Given** the full stack (Kong + notebooklm-mcp) is running, **When** a Claude client sends a `list_notebooks` tool call via the Kong SSE endpoint with a valid API key, **Then** Kong forwards the call to the MCP server and returns the same notebook stats as a direct stdio call.
2. **Given** a tool call is made via Kong, **When** the MCP server processes it successfully, **Then** Kong's request log contains an entry for that request including route name, status code, and latency.
3. **Given** Paul queries the `kong` notebook via the Kong MCP path, **When** the query runs, **Then** the answer and citations returned are identical to what direct stdio access would return for the same question.

---

### User Story 2 - Authenticated MCP Access (Priority: P2)

Paul's Kong MCP endpoint is protected by an API key. Only Claude clients configured with the correct key can reach the tools. Clients without a key — or with an invalid key — are rejected at the Kong layer before any traffic reaches the MCP server.

**Why this priority**: Observability without access control is incomplete. Even on a home lab, Kong enforcing key-auth ensures the MCP server is not accidentally reachable by other services on the network, and is a prerequisite for the Kong MCP Gateway plugin to function as designed.

**Independent Test**: Can be tested independently by sending an HTTP request to the Kong MCP endpoint with no key (expect 401), then with an invalid key (expect 401), then with the correct key (expect a valid tool response).

**Acceptance Scenarios**:

1. **Given** a request to `/notebooklm/mcp/*` with no API key header, **When** Kong receives it, **Then** Kong returns HTTP 401 and the request never reaches the MCP server.
2. **Given** a request with an invalid API key, **When** Kong receives it, **Then** Kong returns HTTP 401.
3. **Given** a Claude client configured with the correct API key, **When** it calls any of the 7 tools, **Then** the call proceeds normally and returns the expected tool response.

---

### User Story 3 - MCP Service in Docker Compose (Priority: P3)

The MCP server runs as a named service in the Docker Compose stack alongside all other services. Paul brings up the full stack with a single command and the MCP server starts automatically, becomes reachable by Kong, and restarts if it crashes — no manual process management required.

**Why this priority**: The MCP server Dockerfile was built in Spec #4 but the `docker-compose.yml` service entry was explicitly deferred. Without it, Paul must start the MCP server manually outside Compose — friction that breaks the "full stack, single command" operational model.

**Independent Test**: Can be tested by running `docker compose up -d` from scratch, waiting for all healthchecks to pass, then confirming the `notebooklm-mcp` container is running and Kong can route traffic to it.

**Acceptance Scenarios**:

1. **Given** `.env` contains all required MCP server environment variables, **When** `docker compose up -d` is run, **Then** the `notebooklm-mcp` container starts, passes its healthcheck, and is reachable at its configured port.
2. **Given** the `notebooklm-mcp` container crashes unexpectedly, **When** Docker detects the failure, **Then** the container restarts automatically without manual intervention.
3. **Given** the `query` service is not yet healthy, **When** `docker compose up -d` is run, **Then** `notebooklm-mcp` waits until `query` is healthy before starting.

---

### Edge Cases

- What happens when the MCP server is down and Kong receives a tool call? Kong returns a gateway error response; the Claude client sees a structured error, not a hung connection.
- What happens when `deck sync` is run against a Kong instance that already has the MCP route configured? The sync is idempotent — no duplicate routes or plugins are created; existing config is updated in place.
- What if `MCP_PORT` in `.env` doesn't match the upstream port Kong is configured to forward to? Tool calls via Kong fail with 502; the mismatch is surfaced during `deck diff` validation before `deck sync` is applied.
- What if the Kong `ai-mcp-proxy` plugin requires the SSE path to match exactly? Running `deck diff` before `deck sync` catches path mismatches before they affect the running system.
- What happens if the API key is rotated? Only the Kong consumer credential needs updating — no changes to the MCP server, tools, or any other service.
- What if a tool call takes longer than a standard HTTP timeout (e.g., ingest or query with Ollama inference)? The Kong upstream timeout for this route must be configured to accommodate the full inference window (≥120s) to prevent premature disconnection.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The MCP server MUST run as a containerized service named `notebooklm-mcp` in `docker-compose.yml`, built from the existing `./mcp` Dockerfile, with all required environment variables injected from `.env`.
- **FR-002**: The `notebooklm-mcp` service MUST start in SSE mode (`MCP_TRANSPORT=sse`), listen on `MCP_PORT`, and be configured to restart automatically unless explicitly stopped.
- **FR-003**: The `notebooklm-mcp` service MUST declare a `depends_on` condition on the `query` service that waits for `query` to be healthy before starting.
- **FR-004**: The Kong configuration MUST define a service and route for `/notebooklm/mcp/*` that forwards all traffic to the `notebooklm-mcp` container's SSE endpoint.
- **FR-005**: The Kong route MUST apply the `ai-mcp-proxy` plugin to handle MCP-over-SSE protocol proxying correctly.
- **FR-006**: The Kong route MUST apply the `key-auth` plugin; all requests without a valid API key MUST be rejected with HTTP 401 before reaching the MCP server.
- **FR-007**: The Kong route MUST apply the `http-log` plugin to capture all MCP tool call requests and responses for observability.
- **FR-008**: The Kong upstream timeout for the MCP route MUST be set to at least 120 seconds to accommodate Ollama inference during `query` and `ingest_document` calls.
- **FR-009**: All 7 MCP tools MUST return results via the Kong SSE path that are functionally identical to results returned via direct stdio — no behavioral difference for any tool.
- **FR-010**: The Kong configuration MUST be expressed as a `deck` declarative config file and applied via `deck sync` — no manual Kong Admin API calls are permitted.
- **FR-011**: A Kong consumer (representing Paul as the API client) MUST be defined in the `deck` config with an `api-key` credential; Claude clients use this key to authenticate.

### Key Entities

- **Kong Service (notebooklm-mcp)**: The upstream definition in Kong pointing to the `notebooklm-mcp` container's SSE endpoint. Owns the upstream URL and timeout configuration.
- **Kong Route (/notebooklm/mcp/*)**: The path-matching rule that accepts all MCP traffic at the gateway and forwards it to the Kong Service. Receives all three plugins.
- **Kong Consumer (paul)**: A Kong consumer entity with an `api-key` credential. Claude clients present this key in requests to authenticate.
- **decK Config (`kong/kong-ollama.yaml`)**: The declarative Kong configuration file. Source of truth for all Kong services, routes, plugins, and consumers. Updated by this spec to add the MCP route.
- **MCP Server (SSE mode)**: The `notebooklm-mcp` container from Spec #4 running with `MCP_TRANSPORT=sse`. This spec adds it to Docker Compose and wires it to Kong.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A tool call made via the Kong MCP endpoint returns the same response as the same tool call made via direct stdio — 100% behavioral parity verified across all 7 tools.
- **SC-002**: 100% of requests to `/notebooklm/mcp/*` without a valid API key are rejected with HTTP 401 at the Kong layer — zero unauthenticated requests reach the MCP server.
- **SC-003**: 100% of MCP tool calls routed via Kong appear in the Kong request log with route name, HTTP status, and latency — zero gaps in observability.
- **SC-004**: `docker compose up -d` starts the complete stack including `notebooklm-mcp` with no manual steps beyond providing a valid `.env` file — single-command startup for the full system.
- **SC-005**: `deck diff` against a running Kong instance after `deck sync` shows zero unexpected changes — Kong configuration is idempotent and fully reproducible from the declarative config file.
- **SC-006**: Tool calls requiring Ollama inference (`query`, `ingest_document`) do not time out at the Kong layer for typical inputs — Kong upstream timeout accommodates at least 120 seconds without dropping the connection.

## Assumptions

- The MCP server (Spec #4) is fully implemented, `mcp/Dockerfile` exists, and the SSE transport functions correctly when `MCP_TRANSPORT=sse`.
- The Kong Gateway service is already present in `docker-compose.yml` and `kong/kong-ollama.yaml` from the infrastructure spec (Spec #1), with working routes for `/notebooklm/embed` and `/notebooklm/chat`.
- The `query` service healthcheck is already defined in `docker-compose.yml` (from Spec #3), enabling `depends_on` with health condition.
- `deck` CLI is available in the local development environment for applying and verifying Kong configuration.
- Claude Desktop / Claude Code MCP client configuration supports specifying a base URL and API key header for SSE transport connections.
- A single Kong consumer with a single API key is sufficient for Paul's single-user home lab — multi-tenant access is not required.
- TLS is out of scope for the home lab; all connections are HTTP-only.

## Out of Scope

- Building or modifying the MCP server, its tools, or its transport logic — completed in Spec #4.
- Audio overview FastAPI endpoint (`/audio-overview`) — covered in Spec #7.
- k3s / Kubernetes manifests for the MCP service or Kong.
- Custom or new Kong plugins beyond `ai-mcp-proxy`, `key-auth`, `http-log`.
- Multiple Kong consumers or role-based access control.
- TLS termination at Kong.
- Kong Manager UI or any Kong admin interface beyond `deck` CLI.
- Adding new notebook types — `kong`, `personal`, `music` remain the only three notebooks.
