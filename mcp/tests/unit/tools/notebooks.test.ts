/**
 * Unit tests for list_notebooks tool handler.
 * All deps mocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const mockGetCollectionStats = jest.fn();
const mockRunQuery = jest.fn();

jest.mock('../../../src/clients/qdrant.js', () => ({
  QdrantClientWrapper: jest.fn().mockImplementation(() => ({ getCollectionStats: mockGetCollectionStats })),
}));
jest.mock('../../../src/clients/neo4j.js', () => ({
  Neo4jClient: jest.fn().mockImplementation(() => ({ runQuery: mockRunQuery })),
}));
jest.mock('../../../src/config.js', () => ({
  config: {
    QDRANT_URL: 'http://localhost:6333',
    NEO4J_URI: 'bolt://localhost:7687',
    NEO4J_USER: 'neo4j',
    NEO4J_PASSWORD: 'changeme',
  },
}));

const makeNeo4jRecord = (docCount: number, conceptCount: number) => ({
  get: (key: string) => ({
    document_count: { toNumber: () => docCount },
    concept_count: { toNumber: () => conceptCount },
  }[key]),
});

describe('list_notebooks tool handler', () => {
  let registeredHandler: (input: unknown) => Promise<unknown>;
  const mockServer = {
    tool: jest.fn((_name: string, _desc: string, _schema: unknown, handler: (input: unknown) => Promise<unknown>) => {
      registeredHandler = handler;
    }),
  };

  beforeEach(async () => {
    jest.resetModules();
    mockGetCollectionStats.mockReset();
    mockRunQuery.mockReset();
    const { registerNotebooksTool } = await import('../../../src/tools/notebooks.js');
    registerNotebooksTool(mockServer as never);
  });

  it('calls QdrantClient.getCollectionStats for each of the 3 notebooks', async () => {
    mockGetCollectionStats.mockResolvedValue({ chunk_count: 10, document_count: 0 });
    mockRunQuery.mockResolvedValue([makeNeo4jRecord(2, 5)]);

    await registeredHandler({});
    expect(mockGetCollectionStats).toHaveBeenCalledTimes(3);
    expect(mockGetCollectionStats).toHaveBeenCalledWith('kong');
    expect(mockGetCollectionStats).toHaveBeenCalledWith('personal');
    expect(mockGetCollectionStats).toHaveBeenCalledWith('music');
  });

  it('calls Neo4j for document and concept counts per notebook', async () => {
    mockGetCollectionStats.mockResolvedValue({ chunk_count: 0, document_count: 0 });
    mockRunQuery.mockResolvedValue([makeNeo4jRecord(0, 0)]);

    await registeredHandler({});
    expect(mockRunQuery).toHaveBeenCalledTimes(3);
  });

  it('returns notebook with zero counts when collection is empty', async () => {
    mockGetCollectionStats.mockResolvedValue({ chunk_count: 0, document_count: 0 });
    mockRunQuery.mockResolvedValue([makeNeo4jRecord(0, 0)]);

    const result = await registeredHandler({}) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0]!.text);
    const music = parsed.notebooks.find((n: { name: string }) => n.name === 'music');
    expect(music.chunk_count).toBe(0);
    expect(music.document_count).toBe(0);
  });

  it('throws InternalError when Qdrant is unavailable', async () => {
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');
    mockGetCollectionStats.mockRejectedValue(new McpError(ErrorCode.InternalError, 'qdrant down'));

    await expect(registeredHandler({})).rejects.toMatchObject({ code: ErrorCode.InternalError });
  });

  it('throws InternalError when Neo4j is unavailable', async () => {
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');
    mockGetCollectionStats.mockResolvedValue({ chunk_count: 5, document_count: 0 });
    mockRunQuery.mockRejectedValue(new McpError(ErrorCode.InternalError, 'neo4j down'));

    await expect(registeredHandler({})).rejects.toMatchObject({ code: ErrorCode.InternalError });
  });
});
