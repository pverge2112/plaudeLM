/**
 * Integration tests for the `get_document_graph` tool against real Neo4j.
 * @integration
 *
 * Requires running services:
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any;
let neo4jAvailable = false;

describe('get_document_graph tool @integration', () => {
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

    client = new McpClient({ name: 'integration-test-graph', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('returns isError:true with InvalidParams when document title does not exist', async () => {
    if (!neo4jAvailable) return;

    const result = await client.callTool({
      name: 'get_document_graph',
      arguments: {
        document_title: 'xyzzy-this-document-does-not-exist-guaranteed',
        depth: 2,
      },
    });

    // Tool throws McpError(InvalidParams) → returns isError:true
    expect(result.isError).toBe(true);
    const content = result.content[0] as { text: string };
    expect(content.text).toContain('xyzzy-this-document-does-not-exist-guaranteed');
  });

  it('returns document, chunks, concepts, relationships arrays for an existing document', async () => {
    if (!neo4jAvailable) return;

    // Seed a minimal Document node so the tool has something to return
    const driver = neo4j.driver(
      process.env['NEO4J_URI']!,
      neo4j.auth.basic(process.env['NEO4J_USER']!, process.env['NEO4J_PASSWORD']!),
    );
    const session = driver.session();
    const docTitle = 'Integration Test Graph Document';

    try {
      await session.run(
        `
        MERGE (d:Document {id: 'integration-test-doc-id', title: $title})
        ON CREATE SET d.notebook = 'personal', d.source_type = 'markdown',
                      d.source_url = 'http://example.com/test', d.ingested_at = datetime()
        `,
        { title: docTitle },
      );
    } finally {
      await session.close();
      await driver.close();
    }

    const result = await client.callTool({
      name: 'get_document_graph',
      arguments: { document_title: docTitle, depth: 2 },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content[0] as { type: string; text: string };
    expect(content.type).toBe('text');

    const parsed = JSON.parse(content.text) as {
      document: Record<string, unknown>;
      chunks: unknown[];
      concepts: unknown[];
      relationships: unknown[];
    };
    expect(parsed).toHaveProperty('document');
    expect(parsed).toHaveProperty('chunks');
    expect(parsed).toHaveProperty('concepts');
    expect(parsed).toHaveProperty('relationships');
    expect(Array.isArray(parsed.chunks)).toBe(true);
    expect(Array.isArray(parsed.concepts)).toBe(true);
    expect(Array.isArray(parsed.relationships)).toBe(true);
    expect(parsed.document['title']).toBe(docTitle);
  });
});
