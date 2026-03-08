/**
 * ingest.ts — `ingest_document` tool: document ingestion via FastAPI → n8n.
 * Implemented in Phase 4 (US2).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { FastApiClient } from '../clients/fastapi.js';
import { config } from '../config.js';

const NotebookSchema = z.enum(['kong', 'personal', 'music']);

const IngestDocumentInputSchema = z
  .object({
    source_type: z.enum(['pdf', 'url', 'markdown', 'gdrive']),
    notebook: NotebookSchema,
    title: z.string().min(1, 'title must not be empty'),
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

export function registerIngestTool(server: McpServer): void {
  server.tool(
    'ingest_document',
    'Add a document (URL, PDF, markdown, or Google Drive file) to a named notebook.',
    {
      source_type: z.enum(['pdf', 'url', 'markdown', 'gdrive']).describe('Source type'),
      notebook: NotebookSchema.describe('Target notebook'),
      title: z.string().min(1).describe('Document title'),
      content: z.string().optional().describe('Text content (for markdown/pdf)'),
      url: z.string().url().optional().describe('URL (for url/gdrive)'),
      file_id: z.string().optional().describe('Google Drive file ID'),
    },
    async (input) => {
      const parsed = IngestDocumentInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.errors[0]?.message ?? 'Invalid input');
      }

      const client = new FastApiClient(config.QUERY_SERVICE_URL);
      const result = await client.post<z.infer<typeof IngestDocumentOutputSchema>>('/ingest', parsed.data);

      const validated = IngestDocumentOutputSchema.safeParse(result);
      if (!validated.success) {
        throw new McpError(ErrorCode.InternalError, 'ingest service returned unexpected response shape');
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
