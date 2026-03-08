/**
 * notebooks.ts — `list_notebooks` tool: collection stats from Qdrant + Neo4j.
 * Implemented in Phase 6 (US4).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { QdrantClientWrapper } from '../clients/qdrant.js';
import { Neo4jClient } from '../clients/neo4j.js';
import { config } from '../config.js';

const NOTEBOOKS = ['kong', 'personal', 'music'] as const;

export function registerNotebooksTool(server: McpServer): void {
  server.tool(
    'list_notebooks',
    'List all notebooks with their document, chunk, and concept counts.',
    {},
    async () => {
      const qdrant = new QdrantClientWrapper(config.QDRANT_URL);
      const neo4j = new Neo4jClient(config.NEO4J_URI, config.NEO4J_USER, config.NEO4J_PASSWORD);

      const notebooks = await Promise.all(
        NOTEBOOKS.map(async (name) => {
          const [qdrantStats, neo4jStats] = await Promise.all([
            qdrant.getCollectionStats(name),
            neo4j.runQuery(
              `
              MATCH (d:Document {notebook: $notebook})
              OPTIONAL MATCH (c:Concept) WHERE $notebook IN c.notebooks
              RETURN count(DISTINCT d) AS document_count, count(DISTINCT c) AS concept_count
              `,
              { notebook: name },
            ),
          ]);

          const record = neo4jStats[0];
          if (!record) {
            throw new McpError(ErrorCode.InternalError, 'graph store returned no results for notebook stats');
          }

          return {
            name,
            chunk_count: qdrantStats.chunk_count,
            document_count: (record.get('document_count') as { toNumber(): number }).toNumber(),
            concept_count: (record.get('concept_count') as { toNumber(): number }).toNumber(),
          };
        }),
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ notebooks }) }],
      };
    },
  );
}
