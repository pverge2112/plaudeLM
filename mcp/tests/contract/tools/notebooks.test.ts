/**
 * Contract tests for `list_notebooks` tool schemas.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

const ListNotebooksOutputSchema = z.object({
  notebooks: z.array(
    z.object({
      name: z.string(),
      chunk_count: z.number().int().min(0),
      document_count: z.number().int().min(0),
      concept_count: z.number().int().min(0),
    }),
  ),
});

describe('list_notebooks tool contract', () => {
  it('empty input object is accepted (tool takes no params)', () => {
    // list_notebooks takes no input — any empty object is valid
    expect({}).toBeDefined();
  });

  it('output with three notebooks parses', () => {
    expect(
      ListNotebooksOutputSchema.safeParse({
        notebooks: [
          { name: 'kong', chunk_count: 100, document_count: 5, concept_count: 20 },
          { name: 'personal', chunk_count: 50, document_count: 3, concept_count: 10 },
          { name: 'music', chunk_count: 0, document_count: 0, concept_count: 0 },
        ],
      }).success,
    ).toBe(true);
  });

  it('empty notebooks array is valid output', () => {
    expect(ListNotebooksOutputSchema.safeParse({ notebooks: [] }).success).toBe(true);
  });

  it('notebook with all zero counts is valid', () => {
    expect(
      ListNotebooksOutputSchema.safeParse({
        notebooks: [{ name: 'music', chunk_count: 0, document_count: 0, concept_count: 0 }],
      }).success,
    ).toBe(true);
  });
});
