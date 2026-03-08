/**
 * Integration tests for the `query` tool against a real FastAPI query service.
 * @integration
 *
 * Requires running services:
 *   FastAPI query service (TEST_QUERY_SERVICE_URL, default http://localhost:8000)
 *   Qdrant (TEST_QDRANT_URL, default http://localhost:6333)
 *   Neo4j (TEST_NEO4J_URI, default bolt://localhost:7687)
 *
 * Run: cd mcp && npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

// Set env vars BEFORE any src imports that load config.ts
process.env['OLLAMA_BASE_URL'] = process.env['TEST_OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
process.env['QDRANT_URL'] = process.env['TEST_QDRANT_URL'] ?? 'http://localhost:6333';
process.env['NEO4J_URI'] = process.env['TEST_NEO4J_URI'] ?? 'bolt://localhost:7687';
process.env['NEO4J_USER'] = process.env['TEST_NEO4J_USER'] ?? 'neo4j';
process.env['NEO4J_PASSWORD'] = process.env['TEST_NEO4J_PASSWORD'] ?? 'changeme';
process.env['KONG_PROXY_URL'] = process.env['TEST_KONG_PROXY_URL'] ?? 'http://localhost:8000';
process.env['MCP_TRANSPORT'] = 'stdio';
process.env['MCP_PORT'] = '3000';
process.env['QUERY_SERVICE_URL'] = process.env['TEST_QUERY_SERVICE_URL'] ?? 'http://localhost:8000';
process.env['N8N_WEBHOOK_URL'] = process.env['TEST_N8N_WEBHOOK_URL'] ?? 'http://localhost:5678/webhook';

async function isServiceReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      return res.ok;
    } finally {
      clearTimeout(id);
    }
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any;
let serviceAvailable = false;

describe('query tool @integration', () => {
  beforeAll(async () => {
    const queryUrl = process.env['QUERY_SERVICE_URL']!;
    serviceAvailable = await isServiceReachable(queryUrl);
    if (!serviceAvailable) {
      console.warn(`⚠ FastAPI not reachable at ${queryUrl} — integration tests will be skipped`);
      return;
    }

    jest.resetModules();
    const { createServer, registerTools } = await import('../../../src/server.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const { Client: McpClient } = await import('@modelcontextprotocol/sdk/client/index.js');

    const server = createServer();
    await registerTools(server);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new McpClient({ name: 'integration-test-query', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('returns answer, citations, and concepts_used shape from real FastAPI', async () => {
    if (!serviceAvailable) return;

    const result = await client.callTool({
      name: 'query',
      arguments: {
        question: 'xyzzy quux frob nonce guaranteed-no-match-integration-test',
        notebook: 'personal',
        top_k: 3,
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content[0] as { type: string; text: string };
    expect(content.type).toBe('text');

    const parsed = JSON.parse(content.text) as Record<string, unknown>;
    expect(parsed).toHaveProperty('answer');
    expect(parsed).toHaveProperty('citations');
    expect(parsed).toHaveProperty('concepts_used');
    expect(typeof parsed['answer']).toBe('string');
    expect(Array.isArray(parsed['citations'])).toBe(true);
    expect(Array.isArray(parsed['concepts_used'])).toBe(true);
  });

  it('returns empty citations array gracefully when query matches no content', async () => {
    if (!serviceAvailable) return;

    const result = await client.callTool({
      name: 'query',
      arguments: {
        question: 'frob nonce quux zzzz xyzzy aaabbb — guaranteed empty result',
        notebook: 'kong',
        top_k: 5,
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content[0] as { text: string };
    const parsed = JSON.parse(content.text) as { answer: string; citations: unknown[] };
    expect(Array.isArray(parsed.citations)).toBe(true);
    // empty result is NOT an error — answer is still a string
    expect(typeof parsed.answer).toBe('string');
  });

  it('returns isError:true when FastAPI query service is unreachable', async () => {
    jest.resetModules();
    // point to a port nothing is listening on
    process.env['QUERY_SERVICE_URL'] = 'http://localhost:19997';

    const { createServer, registerTools } = await import('../../../src/server.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const { Client: McpClient } = await import('@modelcontextprotocol/sdk/client/index.js');

    const badServer = createServer();
    await registerTools(badServer);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await badServer.connect(st);
    const badClient = new McpClient({ name: 'bad-query-test', version: '1.0.0' });
    await badClient.connect(ct);

    const result = await badClient.callTool({
      name: 'query',
      arguments: { question: 'test', notebook: 'personal' },
    });

    expect(result.isError).toBe(true);

    await badClient.close();
    // restore
    process.env['QUERY_SERVICE_URL'] = process.env['TEST_QUERY_SERVICE_URL'] ?? 'http://localhost:8000';
  });
});
