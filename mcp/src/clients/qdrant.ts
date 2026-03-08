/**
 * qdrant.ts — Qdrant REST client wrapper.
 *
 * Wraps @qdrant/js-client-rest. All errors mapped to McpError.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface CollectionStats {
  chunk_count: number;
  document_count: number;
}

export class QdrantClientWrapper {
  private readonly client: QdrantClient;

  constructor(url: string) {
    this.client = new QdrantClient({ url });
  }

  async getCollectionStats(collectionName: string): Promise<CollectionStats> {
    try {
      const info = await this.client.getCollection(collectionName);
      return {
        chunk_count: info.points_count ?? 0,
        document_count: 0, // document count comes from Neo4j; Qdrant only tracks chunks
      };
    } catch (err) {
      throw new McpError(
        ErrorCode.InternalError,
        `vector store unavailable — check that Qdrant is running (collection: ${collectionName})`,
      );
    }
  }
}
