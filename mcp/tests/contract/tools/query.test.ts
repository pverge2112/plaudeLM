/**
 * Contract tests for `query` tool schemas.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

const NotebookSchema = z.enum(['kong', 'personal', 'music']);

const QueryInputSchema = z.object({
  question: z.string().min(1),
  notebook: NotebookSchema,
  top_k: z.number().int().min(1).max(20).optional().default(5),
});

const CitationSchema = z.object({
  chunk_id: z.string().uuid(),
  document_title: z.string(),
  chunk_text: z.string(),
  score: z.number().min(0).max(1),
  source_url: z.string().url().optional(),
});

const QueryOutputSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema),
  concepts_used: z.array(z.string()),
});

describe('query tool contract', () => {
  it('accepts valid input', () => {
    const result = QueryInputSchema.safeParse({ question: 'What is Kong?', notebook: 'kong' });
    expect(result.success).toBe(true);
  });

  it('rejects empty question', () => {
    const result = QueryInputSchema.safeParse({ question: '', notebook: 'kong' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid notebook', () => {
    const result = QueryInputSchema.safeParse({ question: 'test', notebook: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects top_k=0', () => {
    const result = QueryInputSchema.safeParse({ question: 'test', notebook: 'kong', top_k: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects top_k=21', () => {
    const result = QueryInputSchema.safeParse({ question: 'test', notebook: 'kong', top_k: 21 });
    expect(result.success).toBe(false);
  });

  it('valid mock response parses QueryOutputSchema', () => {
    const result = QueryOutputSchema.safeParse({
      answer: 'Kong is an API gateway.',
      citations: [
        {
          chunk_id: '123e4567-e89b-12d3-a456-426614174000',
          document_title: 'Kong Docs',
          chunk_text: 'Kong is...',
          score: 0.92,
        },
      ],
      concepts_used: ['api gateway', 'kong'],
    });
    expect(result.success).toBe(true);
  });

  it('output with empty citations is valid', () => {
    const result = QueryOutputSchema.safeParse({
      answer: 'No relevant content found.',
      citations: [],
      concepts_used: [],
    });
    expect(result.success).toBe(true);
  });
});
