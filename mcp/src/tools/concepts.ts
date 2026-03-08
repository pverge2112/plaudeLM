/**
 * concepts.ts — `search_concepts` and `add_relationship` tools via Neo4j direct.
 * Implemented in Phase 5 (US3).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Neo4jClient } from '../clients/neo4j.js';
import { config } from '../config.js';

const NotebookSchema = z.enum(['kong', 'personal', 'music']);

const SearchConceptsInputSchema = z.object({
  query: z.string().min(1, 'query must not be empty'),
  notebook: NotebookSchema.optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

const AddRelationshipInputSchema = z.object({
  from_concept: z.string().min(1, 'from_concept must not be empty'),
  relationship: z.enum(['RELATED_TO', 'BROADER_THAN', 'LINKS_TO']),
  to_concept: z.string().min(1, 'to_concept must not be empty'),
  notebook: NotebookSchema.optional(),
});

export function registerConceptsTools(server: McpServer): void {
  // search_concepts
  server.tool(
    'search_concepts',
    'Search knowledge graph concepts by keyword. Returns matching concepts with notebook associations.',
    {
      query: z.string().min(1).describe('Keyword to search for'),
      notebook: NotebookSchema.optional().describe('Scope to a specific notebook (optional)'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results (default: 10)'),
    },
    async (input) => {
      const parsed = SearchConceptsInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.errors[0]?.message ?? 'Invalid input');
      }

      const client = new Neo4jClient(config.NEO4J_URI, config.NEO4J_USER, config.NEO4J_PASSWORD);

      const notebookFilter = parsed.data.notebook
        ? 'AND $notebook IN c.notebooks'
        : '';

      const cypher = `
        CALL db.index.fulltext.queryNodes("conceptNameIndex", $query)
        YIELD node AS c, score
        WHERE c:Concept ${notebookFilter}
        WITH c
        OPTIONAL MATCH (c)-[r]-()
        RETURN c.name AS name, c.notebooks AS notebooks, count(r) AS relationship_count
        ORDER BY relationship_count DESC
        LIMIT $limit
      `;

      const records = await client.runQuery(cypher, {
        query: parsed.data.query,
        notebook: parsed.data.notebook ?? null,
        limit: parsed.data.limit,
      });

      const concepts = records.map((r) => ({
        name: r.get('name') as string,
        notebooks: r.get('notebooks') as string[],
        relationship_count: (r.get('relationship_count') as { toNumber(): number }).toNumber(),
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ concepts }) }],
      };
    },
  );

  // add_relationship
  server.tool(
    'add_relationship',
    'Manually add a typed relationship between two concepts in the knowledge graph.',
    {
      from_concept: z.string().min(1).describe('Source concept name'),
      relationship: z.enum(['RELATED_TO', 'BROADER_THAN', 'LINKS_TO']).describe('Relationship type'),
      to_concept: z.string().min(1).describe('Target concept name'),
      notebook: NotebookSchema.optional().describe('Notebook context (optional)'),
    },
    async (input) => {
      const parsed = AddRelationshipInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.errors[0]?.message ?? 'Invalid input');
      }

      const client = new Neo4jClient(config.NEO4J_URI, config.NEO4J_USER, config.NEO4J_PASSWORD);

      const cypher = `
        MERGE (a:Concept {name: $from_concept})
        MERGE (b:Concept {name: $to_concept})
        MERGE (a)-[r:${parsed.data.relationship}]->(b)
        RETURN elementId(r) AS relationship_id
      `;

      const records = await client.runQuery(cypher, {
        from_concept: parsed.data.from_concept.toLowerCase(),
        to_concept: parsed.data.to_concept.toLowerCase(),
      });

      const record = records[0];
      if (!record) {
        throw new McpError(ErrorCode.InternalError, 'failed to create relationship');
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              status: 'ok',
              relationship_id: record.get('relationship_id') as string,
            }),
          },
        ],
      };
    },
  );
}
