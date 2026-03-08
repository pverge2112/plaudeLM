/**
 * Unit tests for get_document_graph tool handler.
 * All deps mocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const mockRunQuery = jest.fn();
jest.mock('../../../src/clients/neo4j.js', () => ({
  Neo4jClient: jest.fn().mockImplementation(() => ({ runQuery: mockRunQuery })),
}));
jest.mock('../../../src/config.js', () => ({
  config: { NEO4J_URI: 'bolt://localhost:7687', NEO4J_USER: 'neo4j', NEO4J_PASSWORD: 'changeme' },
}));

describe('get_document_graph tool handler', () => {
  let registeredHandler: (input: unknown) => Promise<unknown>;
  const mockServer = {
    tool: jest.fn((_name: string, _desc: string, _schema: unknown, handler: (input: unknown) => Promise<unknown>) => {
      registeredHandler = handler;
    }),
  };

  beforeEach(async () => {
    jest.resetModules();
    mockRunQuery.mockReset();
    const { registerGraphTool } = await import('../../../src/tools/graph.js');
    registerGraphTool(mockServer as never);
  });

  it('calls Neo4j traversal query for valid document title', async () => {
    // First call: check document exists
    mockRunQuery.mockResolvedValueOnce([{ get: (_k: string) => ({ properties: { id: 'uuid', title: 'Doc', source_type: 'url', notebook: 'kong' } }) }]);
    // Second call: full graph
    mockRunQuery.mockResolvedValueOnce([{
      get: (k: string) => ({
        d: { properties: { id: 'uuid', title: 'Doc', source_type: 'url', notebook: 'kong' } },
        chunks: [],
        concepts: [],
        relationships: [],
      }[k]),
    }]);

    await registeredHandler({ document_title: 'Doc' });
    expect(mockRunQuery).toHaveBeenCalledTimes(2);
  });

  it('throws InvalidParams with title in message when document not found', async () => {
    mockRunQuery.mockResolvedValueOnce([]); // empty = not found

    await expect(registeredHandler({ document_title: 'Missing Doc' })).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining('Missing Doc'),
    });
  });

  it('throws InternalError when Neo4j is unavailable', async () => {
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');
    mockRunQuery.mockRejectedValueOnce(new McpError(ErrorCode.InternalError, 'neo4j down'));

    await expect(registeredHandler({ document_title: 'Some Doc' })).rejects.toMatchObject({
      code: ErrorCode.InternalError,
    });
  });
});
