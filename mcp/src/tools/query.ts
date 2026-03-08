/**
 * query.ts — `query` tool: GraphRAG question answering via FastAPI.
 * Implemented in Phase 3 (US1).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { FastApiClient } from '../clients/fastapi.js';
import { config } from '../config.js';

const NotebookSchema = z.enum(['kong', 'personal', 'music']);

const QueryInputSchema = z.object({
  question: z.string().min(1, 'question must not be empty'),
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

export function registerQueryTool(server: McpServer): void {
  server.tool(
    'query',
    'Ask a question against a named notebook and receive a grounded answer with source citations.',
    {
      question: z.string().min(1).describe('The question to ask'),
      notebook: NotebookSchema.describe('Notebook to search: kong, personal, or music'),
      top_k: z.number().int().min(1).max(20).optional().describe('Max results (default: 5)'),
    },
    async (input) => {
      const parsed = QueryInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.errors[0]?.message ?? 'Invalid input');
      }

      const client = new FastApiClient(config.QUERY_SERVICE_URL);
      const result = await client.post<z.infer<typeof QueryOutputSchema>>('/query', parsed.data);

      const validated = QueryOutputSchema.safeParse(result);
      if (!validated.success) {
        throw new McpError(ErrorCode.InternalError, 'query service returned unexpected response shape');
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(validated.data),
          },
        ],
      };
    },
  );
}
