/**
 * Integration tests for the `ingest_document` tool against a real FastAPI + n8n pipeline.
 * @integration
 *
 * Requires running services:
 *   FastAPI query service (TEST_QUERY_SERVICE_URL, default http://localhost:8000)
 *   n8n webhook (TEST_N8N_WEBHOOK_URL, default http://localhost:5678/webhook)
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

describe('ingest_document tool @integration', () => {
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

    client = new McpClient({ name: 'integration-test-ingest', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('returns status:ok, chunks_ingested, concepts_extracted, title for a markdown document', async () => {
    if (!serviceAvailable) return;

    const result = await client.callTool({
      name: 'ingest_document',
      arguments: {
        source_type: 'markdown',
        notebook: 'personal',
        title: 'Integration Test Document',
        content:
          'This is a test document for integration testing. It covers GraphRAG concepts and vector search.',
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content[0] as { type: string; text: string };
    expect(content.type).toBe('text');

    const parsed = JSON.parse(content.text) as {
      status: string;
      chunks_ingested: number;
      concepts_extracted: number;
      title: string;
    };
    expect(parsed.status).toBe('ok');
    expect(typeof parsed.chunks_ingested).toBe('number');
    expect(parsed.chunks_ingested).toBeGreaterThanOrEqual(0);
    expect(typeof parsed.concepts_extracted).toBe('number');
    expect(parsed.concepts_extracted).toBeGreaterThanOrEqual(0);
    expect(parsed.title).toBe('Integration Test Document');
  });

  it('returns isError:true when n8n / FastAPI ingest service is unreachable', async () => {
    jest.resetModules();
    process.env['QUERY_SERVICE_URL'] = 'http://localhost:19996';

    const { createServer, registerTools } = await import('../../../src/server.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const { Client: McpClient } = await import('@modelcontextprotocol/sdk/client/index.js');

    const badServer = createServer();
    await registerTools(badServer);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await badServer.connect(st);
    const badClient = new McpClient({ name: 'bad-ingest-test', version: '1.0.0' });
    await badClient.connect(ct);

    const result = await badClient.callTool({
      name: 'ingest_document',
      arguments: {
        source_type: 'markdown',
        notebook: 'personal',
        title: 'Test Doc',
        content: 'test content',
      },
    });

    expect(result.isError).toBe(true);

    await badClient.close();
    // restore
    process.env['QUERY_SERVICE_URL'] = process.env['TEST_QUERY_SERVICE_URL'] ?? 'http://localhost:8000';
  });
});
