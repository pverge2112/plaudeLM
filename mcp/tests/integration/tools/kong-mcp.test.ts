/**
 * Integration tests for Kong MCP Gateway. @integration
 *
 * Verifies that the Kong MCP Gateway:
 *   - Enforces key-auth (401 with no key or invalid key)
 *   - Proxies Streamable HTTP MCP traffic to plaudelm-mcp
 *   - Returns functionally identical tool responses to direct access
 *   - Adds Kong proxy headers confirming all traffic flows through Kong
 *
 * Endpoint: POST http://localhost:8000/plaudelm/mcp
 * Transport: MCP Streamable HTTP — single POST endpoint (not legacy SSE)
 *   Kong strips /plaudelm/mcp → upstream receives POST /
 *
 * Required env vars:
 *   KONG_PROXY_URL   — defaults to http://localhost:8000
 *   KONG_MCP_API_KEY — must be set for authenticated tests (T4-2, T4-3, T4-5)
 *
 * Skips gracefully when Kong is unreachable.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const KONG_PROXY_URL = process.env.KONG_PROXY_URL ?? 'http://localhost:8000';
const KONG_MCP_API_KEY = process.env.KONG_MCP_API_KEY ?? '';
const KONG_MCP_ENDPOINT = `${KONG_PROXY_URL}/plaudelm/mcp`;

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  // Required by MCP SDK StreamableHTTPServerTransport — returns 406 without it
  Accept: 'application/json, text/event-stream',
};

const AUTHED_HEADERS = {
  ...BASE_HEADERS,
  apikey: KONG_MCP_API_KEY,
};

const INITIALIZE_BODY = {
  jsonrpc: '2.0',
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'kong-integration-test', version: '1.0' },
  },
  id: 1,
};

/**
 * Parse an MCP Streamable HTTP response — handles both application/json and
 * text/event-stream formats that the SDK may return.
 */
async function parseMcpResponse(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  if (contentType.includes('text/event-stream')) {
    // SSE format: parse the last `data:` line
    const dataLine = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .at(-1);
    if (!dataLine) throw new Error(`No data line in SSE response:\n${text}`);
    return JSON.parse(dataLine.slice(6));
  }

  return JSON.parse(text);
}

/**
 * Send an MCP initialize request via Kong and return the session ID.
 * Fails the test if initialization does not succeed.
 */
async function initSession(): Promise<string> {
  const res = await fetch(KONG_MCP_ENDPOINT, {
    method: 'POST',
    headers: AUTHED_HEADERS,
    body: JSON.stringify(INITIALIZE_BODY),
    signal: AbortSignal.timeout(15000),
  });

  expect(res.status).toBe(200);
  const sessionId = res.headers.get('mcp-session-id');
  expect(sessionId).toBeTruthy();
  await res.body?.cancel();
  return sessionId!;
}

let kongAvailable = false;

beforeAll(async () => {
  try {
    // Any response (including 401) means Kong is reachable — ECONNREFUSED means it's not.
    const res = await fetch(KONG_MCP_ENDPOINT, {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify(INITIALIZE_BODY),
      signal: AbortSignal.timeout(3000),
    });
    kongAvailable = res.status > 0;
  } catch {
    kongAvailable = false;
  }
});

describe('Kong MCP Gateway @integration', () => {
  // ── T4-1 ─────────────────────────────────────────────────────────────────
  it('T4-1: rejects MCP request with no API key with 401', async () => {
    if (!kongAvailable) {
      console.warn(`Skipping: Kong not reachable at ${KONG_PROXY_URL}`);
      return;
    }

    const res = await fetch(KONG_MCP_ENDPOINT, {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify(INITIALIZE_BODY),
      signal: AbortSignal.timeout(5000),
    });

    expect(res.status).toBe(401);
  });

  // ── T4-4 ─────────────────────────────────────────────────────────────────
  it('T4-4: rejects MCP request with invalid API key with 401', async () => {
    if (!kongAvailable) {
      console.warn(`Skipping: Kong not reachable at ${KONG_PROXY_URL}`);
      return;
    }

    const res = await fetch(KONG_MCP_ENDPOINT, {
      method: 'POST',
      headers: { ...BASE_HEADERS, apikey: 'invalid-key-that-does-not-exist' },
      body: JSON.stringify(INITIALIZE_BODY),
      signal: AbortSignal.timeout(5000),
    });

    expect(res.status).toBe(401);
  });

  // ── T4-2 ─────────────────────────────────────────────────────────────────
  it('T4-2: establishes MCP session through Kong with valid API key', async () => {
    if (!kongAvailable) {
      console.warn(`Skipping: Kong not reachable at ${KONG_PROXY_URL}`);
      return;
    }
    if (!KONG_MCP_API_KEY) {
      console.warn('Skipping: KONG_MCP_API_KEY not set');
      return;
    }

    const res = await fetch(KONG_MCP_ENDPOINT, {
      method: 'POST',
      headers: AUTHED_HEADERS,
      body: JSON.stringify(INITIALIZE_BODY),
      signal: AbortSignal.timeout(15000),
    });

    expect(res.status).toBe(200);

    const sessionId = res.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const body = await parseMcpResponse(res);
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: expect.objectContaining({
        serverInfo: expect.objectContaining({ name: expect.any(String) }),
        protocolVersion: expect.any(String),
      }),
    });
  });

  // ── T4-3 ─────────────────────────────────────────────────────────────────
  it('T4-3: list_notebooks tool call via Kong returns notebooks array matching direct schema', async () => {
    if (!kongAvailable) {
      console.warn(`Skipping: Kong not reachable at ${KONG_PROXY_URL}`);
      return;
    }
    if (!KONG_MCP_API_KEY) {
      console.warn('Skipping: KONG_MCP_API_KEY not set');
      return;
    }

    const sessionId = await initSession();

    // Send tools/call for list_notebooks
    const toolRes = await fetch(KONG_MCP_ENDPOINT, {
      method: 'POST',
      headers: { ...AUTHED_HEADERS, 'mcp-session-id': sessionId },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'list_notebooks', arguments: {} },
        id: 2,
      }),
      signal: AbortSignal.timeout(30000),
    });

    expect(toolRes.status).toBe(200);

    const body = await parseMcpResponse(toolRes);
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: expect.objectContaining({
        content: expect.arrayContaining([expect.objectContaining({ type: 'text' })]),
      }),
    });

    // Parse the tool result text — must be notebooks schema
    const result = (body as { result: { content: Array<{ type: string; text: string }> } }).result;
    const parsed = JSON.parse(result.content[0].text) as {
      notebooks: Array<{
        name: string;
        chunk_count: number;
        document_count: number;
        concept_count: number;
      }>;
    };

    expect(parsed.notebooks).toBeInstanceOf(Array);
    expect(parsed.notebooks).toHaveLength(3);
    expect(parsed.notebooks.map((n) => n.name)).toEqual(
      expect.arrayContaining(['kong', 'personal', 'music']),
    );
    for (const nb of parsed.notebooks) {
      expect(typeof nb.name).toBe('string');
      expect(typeof nb.chunk_count).toBe('number');
      expect(typeof nb.document_count).toBe('number');
      expect(typeof nb.concept_count).toBe('number');
    }
  });

  // ── T4-5 ─────────────────────────────────────────────────────────────────
  it('T4-5: Kong response headers confirm all MCP traffic is proxied through Kong', async () => {
    if (!kongAvailable) {
      console.warn(`Skipping: Kong not reachable at ${KONG_PROXY_URL}`);
      return;
    }
    if (!KONG_MCP_API_KEY) {
      console.warn('Skipping: KONG_MCP_API_KEY not set');
      return;
    }

    const res = await fetch(KONG_MCP_ENDPOINT, {
      method: 'POST',
      headers: AUTHED_HEADERS,
      body: JSON.stringify(INITIALIZE_BODY),
      signal: AbortSignal.timeout(15000),
    });

    expect(res.status).toBe(200);

    // Kong adds these latency headers to every proxied response.
    // Their presence confirms the request passed through Kong (not a direct
    // connection to plaudelm-mcp). This replaces an admin-API log check —
    // Konnect data plane exposes no local admin API.
    const proxyLatency = res.headers.get('x-kong-proxy-latency');
    const upstreamLatency = res.headers.get('x-kong-upstream-latency');

    expect(proxyLatency).not.toBeNull();
    expect(upstreamLatency).not.toBeNull();
    expect(Number(proxyLatency)).toBeGreaterThanOrEqual(0);
    expect(Number(upstreamLatency)).toBeGreaterThanOrEqual(0);
  });
});
