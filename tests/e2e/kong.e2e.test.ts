/**
 * E2E test: kong notebook — ingest document → query → verify citation.
 * @e2e
 *
 * Requires FULL Docker Compose stack:
 *   - FastAPI query service (http://localhost:8000)
 *   - n8n ingest webhook (http://localhost:5678)
 *   - Qdrant (http://localhost:6333)
 *   - Neo4j (bolt://localhost:7687)
 *   - Ollama with llama3.2 + nomic-embed-text pulled
 *
 * Run: cd mcp && npx jest --selectProjects e2e tests/e2e/kong.e2e.test.ts
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

describe('kong notebook e2e: ingest → query → citation @e2e', () => {
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

    client = new McpClient({ name: 'e2e-kong', version: '1.0.0' });
    await client.connect(clientTransport);
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    await client?.close();
  });

  it(
    'ingests a markdown document about Kong into the kong notebook and receives chunks_ingested > 0',
    async () => {
      if (!stackAvailable) return;

      const result = await client.callTool({
        name: 'ingest_document',
        arguments: {
          source_type: 'markdown',
          notebook: 'kong',
          title: 'E2E Test: Kong API Gateway Rate Limiting',
          content: [
            'Kong Gateway provides advanced rate limiting through the rate-limiting-advanced plugin.',
            'Rate limits can be configured per consumer, per service, or per route.',
            'Supported strategies include local counting, Redis-backed sliding window, and fixed window.',
            'Kong also supports AI rate limiting for token-based quotas on AI provider routes.',
            'The ai-rate-limiting-advanced plugin enforces per-model token quotas with fallback logic.',
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
      expect(parsed.title).toBe('E2E Test: Kong API Gateway Rate Limiting');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'queries the kong notebook and returns an answer with citations scoped to kong',
    async () => {
      if (!stackAvailable) return;

      const result = await client.callTool({
        name: 'query',
        arguments: {
          question: 'What rate limiting strategies does Kong Gateway support?',
          notebook: 'kong',
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
    'query results are scoped to the kong notebook and do not include content from other notebooks',
    async () => {
      if (!stackAvailable) return;

      // Ingest a personal document with distinct content
      await client.callTool({
        name: 'ingest_document',
        arguments: {
          source_type: 'markdown',
          notebook: 'personal',
          title: 'E2E Test: Personal Music Theory',
          content: 'Circle of fifths: C G D A E B F# Db Ab Eb Bb F. Used for modulation in jazz.',
        },
      });

      // Query kong notebook for music-related content — should find nothing
      const result = await client.callTool({
        name: 'query',
        arguments: {
          question: 'circle of fifths jazz modulation music theory',
          notebook: 'kong',
          top_k: 5,
        },
      });

      const content = result.content[0] as { text: string };
      const parsed = JSON.parse(content.text) as {
        answer: string;
        citations: Array<{ document_title: string }>;
      };

      // Citations from the personal notebook must NOT appear in a kong-scoped query
      for (const citation of parsed.citations) {
        expect(citation.document_title).not.toBe('E2E Test: Personal Music Theory');
      }
    },
    E2E_TIMEOUT_MS,
  );
});
