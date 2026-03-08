/**
 * Contract tests for `get_document_graph` tool schemas.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

const GetDocumentGraphInputSchema = z.object({
  document_title: z.string().min(1),
  depth: z.number().int().min(1).max(3).optional().default(2),
});

const GetDocumentGraphOutputSchema = z.object({
  document: z.object({
    id: z.string(),
    title: z.string(),
    source_type: z.string(),
    notebook: z.string(),
  }).passthrough(),
  chunks: z.array(z.object({ id: z.string() }).passthrough()),
  concepts: z.array(z.object({ name: z.string() }).passthrough()),
  relationships: z.array(z.object({ from: z.string(), to: z.string(), type: z.string() }).passthrough()),
});

describe('get_document_graph tool contract', () => {
  it('accepts valid input', () => {
    expect(GetDocumentGraphInputSchema.safeParse({ document_title: 'Kong Docs' }).success).toBe(true);
  });

  it('rejects depth=0', () => {
    expect(GetDocumentGraphInputSchema.safeParse({ document_title: 'Doc', depth: 0 }).success).toBe(false);
  });

  it('rejects depth=4', () => {
    expect(GetDocumentGraphInputSchema.safeParse({ document_title: 'Doc', depth: 4 }).success).toBe(false);
  });

  it('accepts depth=1 and depth=3', () => {
    expect(GetDocumentGraphInputSchema.safeParse({ document_title: 'Doc', depth: 1 }).success).toBe(true);
    expect(GetDocumentGraphInputSchema.safeParse({ document_title: 'Doc', depth: 3 }).success).toBe(true);
  });

  it('valid output shape parses', () => {
    expect(
      GetDocumentGraphOutputSchema.safeParse({
        document: { id: 'uuid-1', title: 'Kong Docs', source_type: 'url', notebook: 'kong' },
        chunks: [{ id: 'chunk-1' }],
        concepts: [{ name: 'api gateway', notebooks: ['kong'] }],
        relationships: [{ from: 'c1', to: 'c2', type: 'RELATED_TO' }],
      }).success,
    ).toBe(true);
  });
});
