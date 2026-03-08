/**
 * audio.ts — `audio_overview` tool: podcast-style audio overview via FastAPI.
 * Implemented in Phase 7 (Polish).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { FastApiClient } from '../clients/fastapi.js';
import { config } from '../config.js';

const NotebookSchema = z.enum(['kong', 'personal', 'music']);

const AudioOverviewInputSchema = z.object({
  notebook: NotebookSchema,
  topic: z.string().min(1, 'topic must not be empty'),
});

const AudioOverviewOutputSchema = z.object({
  script: z.string().min(200),
  audio_path: z.string().min(1),
  duration_seconds: z.number().positive(),
});

export function registerAudioTool(server: McpServer): void {
  server.tool(
    'audio_overview',
    'Generate a podcast-style audio overview for a topic in a notebook.',
    {
      notebook: NotebookSchema.describe('Notebook to generate overview from'),
      topic: z.string().min(1).describe('Topic to cover in the audio overview'),
    },
    async (input) => {
      const parsed = AudioOverviewInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.errors[0]?.message ?? 'Invalid input');
      }

      const client = new FastApiClient(config.QUERY_SERVICE_URL);
      const result = await client.post<z.infer<typeof AudioOverviewOutputSchema>>(
        '/audio-overview',
        parsed.data,
      );

      const validated = AudioOverviewOutputSchema.safeParse(result);
      if (!validated.success) {
        // Provide specific feedback for short scripts
        if (result && typeof result === 'object' && 'script' in result) {
          const script = result.script as string;
          if (script.length < 200) {
            throw new McpError(
              ErrorCode.InternalError,
              'audio overview generation failed — script was too short',
            );
          }
        }
        throw new McpError(ErrorCode.InternalError, 'audio overview service returned unexpected response shape');
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(validated.data) }],
      };
    },
  );
}
