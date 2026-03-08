/**
 * graph.ts — `get_document_graph` tool: document concept graph from Neo4j.
 * Implemented in Phase 5 (US3).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Neo4jClient } from '../clients/neo4j.js';
import { config } from '../config.js';

const GetDocumentGraphInputSchema = z.object({
  document_title: z.string().min(1, 'document_title must not be empty'),
  depth: z.number().int().min(1).max(3).optional().default(2),
});

export function registerGraphTool(server: McpServer): void {
  server.tool(
    'get_document_graph',
    'Retrieve the concept graph for a specific document — its chunks, concepts, and relationships.',
    {
      document_title: z.string().min(1).describe('Exact document title'),
      depth: z.number().int().min(1).max(3).optional().describe('Graph traversal depth (default: 2)'),
    },
    async (input) => {
      const parsed = GetDocumentGraphInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.errors[0]?.message ?? 'Invalid input');
      }

      const client = new Neo4jClient(config.NEO4J_URI, config.NEO4J_USER, config.NEO4J_PASSWORD);

      // Fetch the document node
      const docRecords = await client.runQuery(
        'MATCH (d:Document {title: $title}) RETURN d',
        { title: parsed.data.document_title },
      );

      if (docRecords.length === 0) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `document not found: '${parsed.data.document_title}' — verify the exact title`,
        );
      }

      // Fetch chunks, concepts, and relationships
      const graphRecords = await client.runQuery(
        `
        MATCH (d:Document {title: $title})
        OPTIONAL MATCH (ch:Chunk)-[:PART_OF]->(d)
        OPTIONAL MATCH (ch)-[:MENTIONS]->(c:Concept)
        OPTIONAL MATCH (c)-[r:RELATED_TO|BROADER_THAN]->(c2:Concept)
        RETURN d, collect(DISTINCT ch) AS chunks,
               collect(DISTINCT c) AS concepts,
               collect(DISTINCT {from: elementId(c), to: elementId(c2), type: type(r), weight: r.weight}) AS relationships
        `,
        { title: parsed.data.document_title },
      );

      const record = graphRecords[0];
      if (!record) {
        throw new McpError(ErrorCode.InternalError, 'graph query returned no results');
      }

      const doc = record.get('d') as { properties: Record<string, unknown> };
      const chunks = (record.get('chunks') as Array<{ properties: Record<string, unknown> } | null>)
        .filter(Boolean)
        .map((ch) => ch!.properties);
      const concepts = (record.get('concepts') as Array<{ properties: Record<string, unknown> } | null>)
        .filter(Boolean)
        .map((c) => c!.properties);
      const relationships = (record.get('relationships') as Array<Record<string, unknown> | null>)
        .filter((r) => r && r['from'] && r['to'] && r['type']);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              document: doc.properties,
              chunks,
              concepts,
              relationships,
            }),
          },
        ],
      };
    },
  );
}
