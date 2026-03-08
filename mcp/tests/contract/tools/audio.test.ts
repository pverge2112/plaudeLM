/**
 * Contract tests for `audio_overview` tool schemas.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

const NotebookSchema = z.enum(['kong', 'personal', 'music']);

const AudioOverviewInputSchema = z.object({
  notebook: NotebookSchema,
  topic: z.string().min(1),
});

const AudioOverviewOutputSchema = z.object({
  script: z.string().min(200),
  audio_path: z.string().min(1),
  duration_seconds: z.number().positive(),
});

describe('audio_overview tool contract', () => {
  it('accepts valid input', () => {
    expect(AudioOverviewInputSchema.safeParse({ notebook: 'kong', topic: 'rate limiting' }).success).toBe(true);
  });

  it('rejects empty topic', () => {
    expect(AudioOverviewInputSchema.safeParse({ notebook: 'kong', topic: '' }).success).toBe(false);
  });

  it('valid mock response parses AudioOverviewOutputSchema', () => {
    expect(
      AudioOverviewOutputSchema.safeParse({
        script: 'a'.repeat(200),
        audio_path: '/tmp/audio.mp3',
        duration_seconds: 120.5,
      }).success,
    ).toBe(true);
  });

  it('script shorter than 200 chars fails output schema (InternalError scenario)', () => {
    expect(
      AudioOverviewOutputSchema.safeParse({
        script: 'too short',
        audio_path: '/tmp/audio.mp3',
        duration_seconds: 10,
      }).success,
    ).toBe(false);
  });
});
