/**
 * Contract tests for `ingest_document` tool schemas.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

const NotebookSchema = z.enum(['kong', 'personal', 'music']);

const IngestDocumentInputSchema = z
  .object({
    source_type: z.enum(['pdf', 'url', 'markdown', 'gdrive']),
    notebook: NotebookSchema,
    title: z.string().min(1),
    content: z.string().optional(),
    url: z.string().url().optional(),
    file_id: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.source_type === 'url') return !!data.url;
      if (data.source_type === 'gdrive') return !!data.file_id;
      if (data.source_type === 'markdown') return !!data.content;
      return true;
    },
    { message: 'Missing required field for the given source_type' },
  );

const IngestDocumentOutputSchema = z.object({
  status: z.literal('ok'),
  chunks_ingested: z.number().int().min(0),
  concepts_extracted: z.number().int().min(0),
  title: z.string(),
});

describe('ingest_document tool contract', () => {
  it('accepts valid url input', () => {
    const result = IngestDocumentInputSchema.safeParse({
      source_type: 'url',
      notebook: 'personal',
      title: 'My Article',
      url: 'https://example.com/article',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing url when source_type=url', () => {
    const result = IngestDocumentInputSchema.safeParse({
      source_type: 'url',
      notebook: 'personal',
      title: 'My Article',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing file_id when source_type=gdrive', () => {
    const result = IngestDocumentInputSchema.safeParse({
      source_type: 'gdrive',
      notebook: 'kong',
      title: 'Drive Doc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing content when source_type=markdown', () => {
    const result = IngestDocumentInputSchema.safeParse({
      source_type: 'markdown',
      notebook: 'music',
      title: 'My Note',
    });
    expect(result.success).toBe(false);
  });

  it('valid output shape parses', () => {
    const result = IngestDocumentOutputSchema.safeParse({
      status: 'ok',
      chunks_ingested: 12,
      concepts_extracted: 5,
      title: 'My Article',
    });
    expect(result.success).toBe(true);
  });
});
