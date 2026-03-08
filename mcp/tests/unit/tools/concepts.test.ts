/**
 * Unit tests for search_concepts and add_relationship tool handlers.
 * All deps mocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const mockRunQuery = jest.fn();
const mockRunWrite = jest.fn();
jest.mock('../../../src/clients/neo4j.js', () => ({
  Neo4jClient: jest.fn().mockImplementation(() => ({
    runQuery: mockRunQuery,
    runWrite: mockRunWrite,
  })),
}));
jest.mock('../../../src/config.js', () => ({
  config: { NEO4J_URI: 'bolt://localhost:7687', NEO4J_USER: 'neo4j', NEO4J_PASSWORD: 'changeme' },
}));

describe('search_concepts tool handler', () => {
  let searchHandler: (input: unknown) => Promise<unknown>;
  let addHandler: (input: unknown) => Promise<unknown>;

  const mockServer = {
    tool: jest.fn(),
  };

  beforeAll(async () => {
    const handlers: Array<(input: unknown) => Promise<unknown>> = [];
    mockServer.tool.mockImplementation(
      (_name: string, _desc: string, _schema: unknown, handler: (input: unknown) => Promise<unknown>) => {
        handlers.push(handler);
      },
    );
    const { registerConceptsTools } = await import('../../../src/tools/concepts.js');
    registerConceptsTools(mockServer as never);
    [searchHandler, addHandler] = handlers;
  });

  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRunWrite.mockReset();
  });

  it('calls Neo4j full-text index query for search_concepts', async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        get: (key: string) => ({ name: 'api gateway', notebooks: ['kong'], relationship_count: { toNumber: () => 5 } }[key]),
      },
    ]);

    await searchHandler({ query: 'api gateway' });
    expect(mockRunQuery).toHaveBeenCalledWith(expect.stringContaining('fulltext'), expect.any(Object));
  });

  it('propagates Neo4j error as InternalError for search_concepts', async () => {
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');
    mockRunQuery.mockRejectedValueOnce(new McpError(ErrorCode.InternalError, 'neo4j down'));

    await expect(searchHandler({ query: 'test' })).rejects.toMatchObject({ code: ErrorCode.InternalError });
  });

  it('calls Neo4j MERGE write for add_relationship', async () => {
    mockRunQuery.mockResolvedValueOnce([{ get: (_key: string) => 'rel:1:2:3' }]);

    await addHandler({ from_concept: 'kong', relationship: 'RELATED_TO', to_concept: 'api gateway' });
    expect(mockRunQuery).toHaveBeenCalledWith(expect.stringContaining('MERGE'), expect.any(Object));
  });

  it('propagates Neo4j error as InternalError for add_relationship', async () => {
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');
    mockRunQuery.mockRejectedValueOnce(new McpError(ErrorCode.InternalError, 'neo4j down'));

    await expect(
      addHandler({ from_concept: 'a', relationship: 'RELATED_TO', to_concept: 'b' }),
    ).rejects.toMatchObject({ code: ErrorCode.InternalError });
  });
});
