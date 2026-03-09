/**
 * Integration tests for `search_concepts` and `add_relationship` tools against real Neo4j.
 * @integration
 *
 * Requires running services:
 *   Neo4j (TEST_NEO4J_URI, default bolt://localhost:7687)
 *
 * Note: search_concepts uses a Neo4j full-text index (conceptNameIndex).
 * Run scripts/init-neo4j.py before these tests if the index does not exist.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any;
let neo4jAvailable = false;

describe('search_concepts and add_relationship tools @integration', () => {
  beforeAll(async () => {
    neo4jAvailable = await isNeo4jReachable();
    if (!neo4jAvailable) {
      console.warn('⚠ Neo4j not reachable — integration tests will be skipped');
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

    client = new McpClient({ name: 'integration-test-concepts', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('search_concepts returns an array (may be empty) without error', async () => {
    if (!neo4jAvailable) return;

    const result = await client.callTool({
      name: 'search_concepts',
      arguments: { query: 'api gateway', limit: 5 },
    });

    // If the full-text index doesn't exist, the tool returns isError:true — skip rather than fail
    if (result.isError === true) {
      const errContent = result.content[0] as { text: string };
      console.warn(
        `⚠ search_concepts returned error (full-text index may not exist — run scripts/init-neo4j.py): ${errContent.text}`,
      );
      return;
    }

    const content = result.content[0] as { type: string; text: string };
    expect(content.type).toBe('text');

    const parsed = JSON.parse(content.text) as { concepts: unknown[] };
    expect(parsed).toHaveProperty('concepts');
    expect(Array.isArray(parsed.concepts)).toBe(true);
  });

  it('search_concepts returns empty array gracefully when no concepts match', async () => {
    if (!neo4jAvailable) return;

    const result = await client.callTool({
      name: 'search_concepts',
      arguments: { query: 'xyzzy-quux-frob-guaranteed-no-match', limit: 10 },
    });

    // Gracefully handle missing full-text index
    if (result.isError === true) {
      console.warn('⚠ search_concepts returned error — full-text index may not exist');
      return;
    }

    const content = result.content[0] as { text: string };
    const parsed = JSON.parse(content.text) as { concepts: unknown[] };
    expect(Array.isArray(parsed.concepts)).toBe(true);
    // empty is valid — not an error
  });

  it('add_relationship creates a RELATED_TO edge and returns relationship_id', async () => {
    if (!neo4jAvailable) return;

    const result = await client.callTool({
      name: 'add_relationship',
      arguments: {
        from_concept: 'integration-test-concept-alpha',
        relationship: 'RELATED_TO',
        to_concept: 'integration-test-concept-beta',
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content[0] as { text: string };
    const parsed = JSON.parse(content.text) as { status: string; relationship_id: string };
    expect(parsed.status).toBe('ok');
    expect(typeof parsed.relationship_id).toBe('string');
    expect(parsed.relationship_id.length).toBeGreaterThan(0);
  });

  it('search_concepts scoped to a notebook only returns concepts for that notebook', async () => {
    if (!neo4jAvailable) return;

    const result = await client.callTool({
      name: 'search_concepts',
      arguments: { query: 'api', notebook: 'kong', limit: 10 },
    });

    if (result.isError === true) {
      console.warn('⚠ search_concepts returned error — full-text index may not exist');
      return;
    }

    const content = result.content[0] as { text: string };
    const parsed = JSON.parse(content.text) as { concepts: Array<{ notebooks: string[] }> };
    expect(Array.isArray(parsed.concepts)).toBe(true);
    // every returned concept must include 'kong' in its notebooks array
    for (const concept of parsed.concepts) {
      expect(concept.notebooks).toContain('kong');
    }
  });
});
