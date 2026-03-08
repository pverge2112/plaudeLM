/**
 * Contract tests for `search_concepts` and `add_relationship` tool schemas.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

const NotebookSchema = z.enum(['kong', 'personal', 'music']);

const SearchConceptsInputSchema = z.object({
  query: z.string().min(1),
  notebook: NotebookSchema.optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

const SearchConceptsOutputSchema = z.object({
  concepts: z.array(
    z.object({
      name: z.string(),
      notebooks: z.array(z.string()),
      relationship_count: z.number().int().min(0),
    }),
  ),
});

const AddRelationshipInputSchema = z.object({
  from_concept: z.string().min(1),
  relationship: z.enum(['RELATED_TO', 'BROADER_THAN', 'LINKS_TO']),
  to_concept: z.string().min(1),
  notebook: NotebookSchema.optional(),
});

const AddRelationshipOutputSchema = z.object({
  status: z.literal('ok'),
  relationship_id: z.string(),
});

describe('search_concepts tool contract', () => {
  it('accepts valid input', () => {
    expect(SearchConceptsInputSchema.safeParse({ query: 'api gateway' }).success).toBe(true);
  });

  it('rejects empty query', () => {
    expect(SearchConceptsInputSchema.safeParse({ query: '' }).success).toBe(false);
  });

  it('valid output shape parses', () => {
    expect(
      SearchConceptsOutputSchema.safeParse({
        concepts: [{ name: 'api gateway', notebooks: ['kong'], relationship_count: 3 }],
      }).success,
    ).toBe(true);
  });

  it('empty concepts array is valid output', () => {
    expect(SearchConceptsOutputSchema.safeParse({ concepts: [] }).success).toBe(true);
  });
});

describe('add_relationship tool contract', () => {
  it('accepts valid input', () => {
    expect(
      AddRelationshipInputSchema.safeParse({
        from_concept: 'kong',
        relationship: 'RELATED_TO',
        to_concept: 'api gateway',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid relationship type', () => {
    expect(
      AddRelationshipInputSchema.safeParse({
        from_concept: 'kong',
        relationship: 'KNOWS',
        to_concept: 'api',
      }).success,
    ).toBe(false);
  });

  it('rejects empty from_concept', () => {
    expect(
      AddRelationshipInputSchema.safeParse({
        from_concept: '',
        relationship: 'RELATED_TO',
        to_concept: 'api',
      }).success,
    ).toBe(false);
  });

  it('valid output shape parses', () => {
    expect(
      AddRelationshipOutputSchema.safeParse({ status: 'ok', relationship_id: 'rel:1:2:3' }).success,
    ).toBe(true);
  });
});
