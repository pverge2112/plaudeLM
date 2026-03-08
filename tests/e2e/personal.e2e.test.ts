/**
 * E2E test: personal notebook — ingest document → query → verify citation.
 * @e2e
 *
 * Requires FULL Docker Compose stack:
 *   - FastAPI query service (http://localhost:8000)
 *   - n8n ingest webhook (http://localhost:5678)
 *   - Qdrant (http://localhost:6333)
 *   - Neo4j (bolt://localhost:7687)
 *   - Ollama with llama3.2 + nomic-embed-text pulled
 *
 * Run: cd mcp && npm run test:all -- --selectProjects e2e
 * Or:  cd mcp && npx jest --selectProjects e2e tests/e2e/personal.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

// All env vars must be set before any src imports that load config.ts
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

const E2E_TIMEOUT_MS = 120_000; // 2 min — Ollama inference is slow on CPU

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

describe('personal notebook e2e: ingest → query → citation @e2e', () => {
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

    client = new McpClient({ name: 'e2e-personal', version: '1.0.0' });
    await client.connect(clientTransport);
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    await client?.close();
  });

  it(
    'ingests a markdown document into the personal notebook and receives chunks_ingested > 0',
    async () => {
      if (!stackAvailable) return;

      const result = await client.callTool({
        name: 'ingest_document',
        arguments: {
          source_type: 'markdown',
          notebook: 'personal',
          title: 'E2E Test: GraphRAG Overview',
          content: [
            'GraphRAG combines vector similarity search with knowledge graph traversal.',
            'It retrieves both semantically similar chunks and graph-connected concepts.',
            'The hybrid approach provides richer context to the language model than either method alone.',
            'Key components: Qdrant for vector storage, Neo4j for the knowledge graph, Ollama for inference.',
          ].join(' '),
        },
      });

      const content = result.content[0] as { text: string };
      const parsed = JSON.parse(content.text) as {
        status: string;
        chunks_ingested: number;
        concepts_extracted: number;
        title: string;
      };

      expect(parsed.status).toBe('ok');
      expect(parsed.chunks_ingested).toBeGreaterThan(0);
      expect(parsed.title).toBe('E2E Test: GraphRAG Overview');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'queries the personal notebook and receives an answer with at least one citation containing neo4j_chunk_id',
    async () => {
      if (!stackAvailable) return;

      const result = await client.callTool({
        name: 'query',
        arguments: {
          question: 'What is GraphRAG and how does it combine vector search with knowledge graphs?',
          notebook: 'personal',
          top_k: 5,
        },
      });

      const content = result.content[0] as { text: string };
      const parsed = JSON.parse(content.text) as {
        answer: string;
        citations: Array<{
          chunk_id: string;
          document_title: string;
          chunk_text: string;
          score: number;
        }>;
        concepts_used: string[];
      };

      expect(typeof parsed.answer).toBe('string');
      expect(parsed.answer.length).toBeGreaterThan(0);
      expect(Array.isArray(parsed.citations)).toBe(true);
      // At least one citation should reference the ingested document
      expect(parsed.citations.length).toBeGreaterThan(0);

      const citation = parsed.citations[0]!;
      expect(typeof citation.chunk_id).toBe('string');
      expect(citation.chunk_id.length).toBeGreaterThan(0);
      expect(citation.document_title).toBeDefined();
      expect(typeof citation.chunk_text).toBe('string');
      expect(citation.score).toBeGreaterThan(0);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'lists the personal notebook and shows document_count > 0 after ingest',
    async () => {
      if (!stackAvailable) return;

      const result = await client.callTool({ name: 'list_notebooks', arguments: {} });
      const content = result.content[0] as { text: string };
      const parsed = JSON.parse(content.text) as {
        notebooks: Array<{ name: string; chunk_count: number; document_count: number }>;
      };

      const personal = parsed.notebooks.find((n) => n.name === 'personal');
      expect(personal).toBeDefined();
      expect(personal!.chunk_count).toBeGreaterThan(0);
    },
    E2E_TIMEOUT_MS,
  );
});
