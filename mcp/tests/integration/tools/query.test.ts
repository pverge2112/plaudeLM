/**
 * Integration tests for query tool — FastAPI schema contract. @integration
 *
 * Calls the real FastAPI /query endpoint and validates that the response
 * matches the Zod schema defined in mcp/src/tools/query.ts.
 *
 * This test exists to prevent schema drift between the FastAPI Pydantic models
 * and the MCP Zod schemas — the exact class of bug that caused the empty-response
 * regression on 2026-03-09 (document_title vs title mismatch).
 *
 * Skips gracefully if QUERY_SERVICE_URL is not reachable.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { z } from 'zod';

const QUERY_SERVICE_URL = process.env.QUERY_SERVICE_URL ?? 'http://localhost:8000';

// These schemas must stay in sync with mcp/src/tools/query.ts
const CitationSchema = z.object({
  chunk_id: z.string(),
  neo4j_chunk_id: z.string(),
  chunk_text: z.string(),
  title: z.string(),
  score: z.number().min(0),
  source_url: z.string().url().nullish(),
});

const QueryOutputSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema),
  concepts_used: z.array(z.string()),
});

let serviceAvailable = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${QUERY_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    serviceAvailable = res.ok;
  } catch {
    serviceAvailable = false;
  }
});

describe('query tool @integration — FastAPI /query schema contract', () => {
  it('FastAPI /query response shape matches MCP CitationSchema', async () => {
    if (!serviceAvailable) {
      console.warn(`Skipping: FastAPI not reachable at ${QUERY_SERVICE_URL}`);
      return;
    }

    const res = await fetch(`${QUERY_SERVICE_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is Kong AI Gateway?', notebook: 'kong', top_k: 3 }),
      signal: AbortSignal.timeout(60000),
    });

    expect(res.ok).toBe(true);
    const body = await res.json();
    const result = QueryOutputSchema.safeParse(body);

    if (!result.success) {
      throw new Error(
        `FastAPI /query response does not match MCP QueryOutputSchema.\n` +
          `Schema errors:\n${JSON.stringify(result.error.errors, null, 2)}\n\n` +
          `Actual response:\n${JSON.stringify(body, null, 2)}`,
      );
    }

    expect(result.success).toBe(true);
  });

  it('FastAPI /query returns valid structure when no chunks match', async () => {
    if (!serviceAvailable) {
      console.warn(`Skipping: FastAPI not reachable at ${QUERY_SERVICE_URL}`);
      return;
    }

    const res = await fetch(`${QUERY_SERVICE_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'xyzzy-nonsense-query-that-matches-nothing-in-any-notebook',
        notebook: 'kong',
      }),
      signal: AbortSignal.timeout(60000),
    });

    expect(res.ok).toBe(true);
    const body = await res.json();
    const result = QueryOutputSchema.safeParse(body);

    if (!result.success) {
      throw new Error(
        `FastAPI /query empty-result response does not match MCP QueryOutputSchema.\n` +
          `Schema errors:\n${JSON.stringify(result.error.errors, null, 2)}\n\n` +
          `Actual response:\n${JSON.stringify(body, null, 2)}`,
      );
    }

    expect(result.success).toBe(true);
    expect(result.data.citations).toHaveLength(0);
  });

  it('FastAPI /query rejects unknown notebook with 422', async () => {
    if (!serviceAvailable) {
      console.warn(`Skipping: FastAPI not reachable at ${QUERY_SERVICE_URL}`);
      return;
    }

    const res = await fetch(`${QUERY_SERVICE_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'test', notebook: 'invalid-notebook' }),
      signal: AbortSignal.timeout(10000),
    });

    expect(res.status).toBe(422);
  });
});
