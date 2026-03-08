/**
 * Unit tests for Neo4jClient wrapper
 * RED phase — all deps mocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const mockRun = jest.fn();
const mockClose = jest.fn();
const mockSession = jest.fn().mockReturnValue({
  run: mockRun,
  close: mockClose,
});
const mockDriver = jest.fn().mockReturnValue({
  session: mockSession,
  close: jest.fn(),
});

jest.mock('neo4j-driver', () => ({
  __esModule: true,
  default: {
    driver: mockDriver,
    auth: { basic: jest.fn().mockReturnValue({}) },
    session: { WRITE: 'WRITE' },
  },
}));

jest.mock('../../../src/config.js', () => ({
  config: {
    NEO4J_URI: 'bolt://localhost:7687',
    NEO4J_USER: 'neo4j',
    NEO4J_PASSWORD: 'changeme',
  },
}));

describe('Neo4jClient', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockClose.mockReset();
    jest.resetModules();
  });

  it('runQuery returns typed records', async () => {
    const fakeRecords = [{ get: (key: string) => ({ name: 'test' }[key]) }];
    mockRun.mockResolvedValueOnce({ records: fakeRecords });

    const { Neo4jClient } = await import('../../../src/clients/neo4j.js');
    const client = new Neo4jClient('bolt://localhost:7687', 'neo4j', 'changeme');
    const result = await client.runQuery('MATCH (c:Concept) RETURN c', {});

    expect(result).toEqual(fakeRecords);
  });

  it('runWrite returns summary', async () => {
    const fakeSummary = { counters: { nodesCreated: () => 1 } };
    mockRun.mockResolvedValueOnce({ records: [], summary: fakeSummary });

    const { Neo4jClient } = await import('../../../src/clients/neo4j.js');
    const client = new Neo4jClient('bolt://localhost:7687', 'neo4j', 'changeme');
    const result = await client.runWrite('MERGE (c:Concept {name: $name})', { name: 'test' });

    expect(result).toEqual(fakeSummary);
  });

  it('throws McpError with InternalError when Neo4j is unavailable', async () => {
    mockRun.mockRejectedValueOnce(new Error('ServiceUnavailable'));

    const { Neo4jClient } = await import('../../../src/clients/neo4j.js');
    const client = new Neo4jClient('bolt://localhost:7687', 'neo4j', 'changeme');

    await expect(client.runQuery('MATCH (n) RETURN n', {})).rejects.toMatchObject({
      code: ErrorCode.InternalError,
    });
  });

  it('always closes the session in a finally block', async () => {
    mockRun.mockRejectedValueOnce(new Error('timeout'));

    const { Neo4jClient } = await import('../../../src/clients/neo4j.js');
    const client = new Neo4jClient('bolt://localhost:7687', 'neo4j', 'changeme');

    try {
      await client.runQuery('MATCH (n) RETURN n', {});
    } catch {
      // expected
    }

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
