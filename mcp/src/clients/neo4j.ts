/**
 * neo4j.ts — Async Neo4j driver wrapper.
 *
 * Session created per call, always closed in finally (CONSTITUTION III.5).
 * All errors mapped to McpError.
 */

import neo4j, { type Record as Neo4jRecord, type QueryResult } from 'neo4j-driver';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class Neo4jClient {
  private readonly driver: ReturnType<typeof neo4j.driver>;

  constructor(uri: string, user: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  async runQuery(cypher: string, params: Record<string, unknown>): Promise<Neo4jRecord[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, `Neo4j query failed: ${msg}`);
    } finally {
      await session.close();
    }
  }

  async runWrite(cypher: string, params: Record<string, unknown>): Promise<QueryResult['summary']> {
    const session = this.driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      const result = await session.run(cypher, params);
      return result.summary;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, `Neo4j write failed: ${msg}`);
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
