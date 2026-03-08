/**
 * Unit tests for QdrantClient wrapper
 * RED phase — all deps mocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const mockGetCollection = jest.fn();
jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    getCollection: mockGetCollection,
  })),
}));

jest.mock('../../../src/config.js', () => ({
  config: { QDRANT_URL: 'http://localhost:6333' },
}));

describe('QdrantClientWrapper', () => {
  beforeEach(() => {
    mockGetCollection.mockReset();
    jest.resetModules();
  });

  it('returns chunk_count and document_count from collection info', async () => {
    mockGetCollection.mockResolvedValueOnce({
      vectors_count: 42,
      points_count: 42,
      segments_count: 1,
    });

    const { QdrantClientWrapper } = await import('../../../src/clients/qdrant.js');
    const client = new QdrantClientWrapper('http://localhost:6333');
    const stats = await client.getCollectionStats('kong');

    expect(stats.chunk_count).toBe(42);
    expect(mockGetCollection).toHaveBeenCalledWith('kong');
  });

  it('throws McpError with InternalError when Qdrant is unavailable', async () => {
    mockGetCollection.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const { QdrantClientWrapper } = await import('../../../src/clients/qdrant.js');
    const client = new QdrantClientWrapper('http://localhost:6333');

    await expect(client.getCollectionStats('kong')).rejects.toMatchObject({
      code: ErrorCode.InternalError,
    });
  });
});
