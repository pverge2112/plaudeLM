/**
 * Unit tests for FastApiClient
 * RED phase — all deps mocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock config before importing client
jest.mock('../../../src/config.js', () => ({
  config: {
    QUERY_SERVICE_URL: 'http://localhost:8000',
  },
}));

describe('FastApiClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns typed response on successful 2xx', async () => {
    const payload = { answer: 'test', citations: [], concepts_used: [] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response);

    const { FastApiClient } = await import('../../../src/clients/fastapi.js');
    const client = new FastApiClient('http://localhost:8000');
    const result = await client.post<typeof payload>('/query', { question: 'test', notebook: 'kong' });

    expect(result).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/query',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws McpError with InvalidParams on 4xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'validation error' }),
    } as Response);

    const { FastApiClient } = await import('../../../src/clients/fastapi.js');
    const client = new FastApiClient('http://localhost:8000');

    await expect(client.post('/query', {})).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
    });
  });

  it('throws McpError with InternalError on 5xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'service unavailable' }),
    } as Response);

    const { FastApiClient } = await import('../../../src/clients/fastapi.js');
    const client = new FastApiClient('http://localhost:8000');

    await expect(client.post('/query', {})).rejects.toMatchObject({
      code: ErrorCode.InternalError,
    });
  });

  it('throws McpError with InternalError on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    const { FastApiClient } = await import('../../../src/clients/fastapi.js');
    const client = new FastApiClient('http://localhost:8000');

    await expect(client.post('/query', {})).rejects.toMatchObject({
      code: ErrorCode.InternalError,
    });
  });
});
