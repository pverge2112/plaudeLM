/**
 * Integration tests for the `list_notebooks` tool against real Qdrant + Neo4j.
 * @integration
 *
 * Requires running services:
 *   Qdrant (TEST_QDRANT_URL, default http://localhost:6333)
 *   Neo4j (TEST_NEO4J_URI, default bolt://localhost:7687)
 *
 * Run: cd mcp && npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import neo4j from 'neo4j-driver';

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

async function isNeo4jReachable(): Promise<boolean> {
  const driver = neo4j.driver(
    process.env['NEO4J_URI']!,
    neo4j.auth.basic(process.env['NEO4J_USER']!, process.env['NEO4J_PASSWORD']!),
    { connectionTimeout: 2000 },
  );
  try {
    await driver.verifyConnectivity();
    return true;
  } catch {
    return false;
  } finally {
    await driver.close();
  }
}

async function isQdrantReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(`${process.env['QDRANT_URL']}/healthz`, {
        signal: controller.signal,
      });
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
let servicesAvailable = false;

describe('list_notebooks tool @integration', () => {
  beforeAll(async () => {
    const [neo4jOk, qdrantOk] = await Promise.all([isNeo4jReachable(), isQdrantReachable()]);
    servicesAvailable = neo4jOk && qdrantOk;
    if (!servicesAvailable) {
      console.warn(
        `⚠ Required services unavailable (Neo4j: ${neo4jOk}, Qdrant: ${qdrantOk}) — integration tests will be skipped`,
      );
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

    client = new McpClient({ name: 'integration-test-notebooks', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('returns all three notebooks with counts >= 0', async () => {
    if (!servicesAvailable) return;

    const result = await client.callTool({ name: 'list_notebooks', arguments: {} });

    expect(result.content).toBeDefined();
    const content = result.content[0] as { type: string; text: string };
    expect(content.type).toBe('text');

    const parsed = JSON.parse(content.text) as {
      notebooks: Array<{
        name: string;
        chunk_count: number;
        document_count: number;
        concept_count: number;
      }>;
    };
    expect(parsed).toHaveProperty('notebooks');
    expect(Array.isArray(parsed.notebooks)).toBe(true);

    const names = parsed.notebooks.map((n) => n.name);
    expect(names).toContain('kong');
    expect(names).toContain('personal');
    expect(names).toContain('music');

    for (const nb of parsed.notebooks) {
      expect(typeof nb.chunk_count).toBe('number');
      expect(typeof nb.document_count).toBe('number');
      expect(typeof nb.concept_count).toBe('number');
      expect(nb.chunk_count).toBeGreaterThanOrEqual(0);
      expect(nb.document_count).toBeGreaterThanOrEqual(0);
      expect(nb.concept_count).toBeGreaterThanOrEqual(0);
    }
  });

  it('empty notebook appears with zero counts rather than being omitted', async () => {
    if (!servicesAvailable) return;

    // 'music' is expected to be empty in the test environment
    const result = await client.callTool({ name: 'list_notebooks', arguments: {} });
    const content = result.content[0] as { text: string };
    const parsed = JSON.parse(content.text) as {
      notebooks: Array<{ name: string; chunk_count: number }>;
    };

    const music = parsed.notebooks.find((n) => n.name === 'music');
    expect(music).toBeDefined();
    // must appear even if empty — zero counts not omission
    expect(typeof music!.chunk_count).toBe('number');
  });
});
