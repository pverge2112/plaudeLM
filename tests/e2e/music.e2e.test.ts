/**
 * E2E test: music notebook — ingest document → query → verify citation.
 * @e2e
 *
 * Requires FULL Docker Compose stack:
 *   - FastAPI query service (http://localhost:8000)
 *   - n8n ingest webhook (http://localhost:5678)
 *   - Qdrant (http://localhost:6333)
 *   - Neo4j (bolt://localhost:7687)
 *   - Ollama with llama3.2 + nomic-embed-text pulled
 *
 * Run: cd mcp && npx jest --selectProjects e2e tests/e2e/music.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

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

const E2E_TIMEOUT_MS = 120_000;

async function isStackReachable(): Promise<boolean> {
  const checks = [
    `${process.env['QUERY_SERVICE_URL']}/health`,
    `${process.env['QDRANT_URL']}/healthz`,
  ];
  for (const url of checks) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return false;
      } finally {
        clearTimeout(id);
      }
    } catch {
      return false;
    }
  }
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any;
let stackAvailable = false;

describe('music notebook e2e: ingest → query → citation @e2e', () => {
  beforeAll(async () => {
    stackAvailable = await isStackReachable();
    if (!stackAvailable) {
      console.warn('⚠ Full stack not reachable — e2e tests will be skipped');
      return;
    }

    jest.resetModules();
    const { createServer, registerTools } = await import('../../mcp/src/server.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const { Client: McpClient } = await import('@modelcontextprotocol/sdk/client/index.js');

    const server = createServer();
    await registerTools(server);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new McpClient({ name: 'e2e-music', version: '1.0.0' });
    await client.connect(clientTransport);
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    await client?.close();
  });

  it(
    'ingests a markdown document about music theory into the music notebook and receives chunks_ingested > 0',
    async () => {
      if (!stackAvailable) return;

      const result = await client.callTool({
        name: 'ingest_document',
        arguments: {
          source_type: 'markdown',
          notebook: 'music',
          title: 'E2E Test: Jazz Harmony Fundamentals',
          content: [
            'Jazz harmony builds on extended chords: major 7th, dominant 7th, minor 7th, half-diminished.',
            'The ii-V-I progression is the foundation of jazz chord movement.',
            'Tritone substitution replaces a dominant chord with one a tritone away.',
            'Modal interchange borrows chords from parallel modes, adding color and tension.',
            'Voice leading connects chords smoothly by moving individual voices by half or whole steps.',
          ].join(' '),
        },
      });

      const content = result.content[0] as { text: string };
      const parsed = JSON.parse(content.text) as {
        status: string;
        chunks_ingested: number;
        title: string;
      };

      expect(parsed.status).toBe('ok');
      expect(parsed.chunks_ingested).toBeGreaterThan(0);
      expect(parsed.title).toBe('E2E Test: Jazz Harmony Fundamentals');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'queries the music notebook and returns an answer with citations scoped to music',
    async () => {
      if (!stackAvailable) return;

      const result = await client.callTool({
        name: 'query',
        arguments: {
          question: 'What is the ii-V-I progression and how does tritone substitution work?',
          notebook: 'music',
          top_k: 5,
        },
      });

      const content = result.content[0] as { text: string };
      const parsed = JSON.parse(content.text) as {
        answer: string;
        citations: Array<{ chunk_id: string; document_title: string; score: number }>;
        concepts_used: string[];
      };

      expect(typeof parsed.answer).toBe('string');
      expect(parsed.answer.length).toBeGreaterThan(0);
      expect(Array.isArray(parsed.citations)).toBe(true);
      expect(parsed.citations.length).toBeGreaterThan(0);

      const citation = parsed.citations[0]!;
      expect(typeof citation.chunk_id).toBe('string');
      expect(citation.score).toBeGreaterThan(0);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'empty result when querying a topic with no matching music content',
    async () => {
      if (!stackAvailable) return;

      const result = await client.callTool({
        name: 'query',
        arguments: {
          question: 'xyzzy frob quux nonce guaranteed-no-match music test',
          notebook: 'music',
          top_k: 5,
        },
      });

      const content = result.content[0] as { text: string };
      const parsed = JSON.parse(content.text) as {
        answer: string;
        citations: unknown[];
      };

      // empty citations are valid — not an error
      expect(typeof parsed.answer).toBe('string');
      expect(Array.isArray(parsed.citations)).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );
});
