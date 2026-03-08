/**
 * Unit tests for ingest_document tool handler.
 * All deps mocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const mockPost = jest.fn();
jest.mock('../../../src/clients/fastapi.js', () => ({
  FastApiClient: jest.fn().mockImplementation(() => ({ post: mockPost })),
}));
jest.mock('../../../src/config.js', () => ({
  config: { QUERY_SERVICE_URL: 'http://localhost:8000' },
}));

describe('ingest_document tool handler', () => {
  let registeredHandler: (input: unknown) => Promise<unknown>;
  const mockServer = {
    tool: jest.fn((_name: string, _desc: string, _schema: unknown, handler: (input: unknown) => Promise<unknown>) => {
      registeredHandler = handler;
    }),
  };

  beforeEach(async () => {
    jest.resetModules();
    mockPost.mockReset();
    const { registerIngestTool } = await import('../../../src/tools/ingest.js');
    registerIngestTool(mockServer as never);
  });

  it('calls FastApiClient.post with correct payload for url source', async () => {
    mockPost.mockResolvedValueOnce({ status: 'ok', chunks_ingested: 10, concepts_extracted: 3, title: 'Test' });

    await registeredHandler({ source_type: 'url', notebook: 'personal', title: 'Test', url: 'https://example.com' });
    expect(mockPost).toHaveBeenCalledWith('/ingest', expect.objectContaining({ source_type: 'url', notebook: 'personal' }));
  });

  it('returns mapped output on success', async () => {
    mockPost.mockResolvedValueOnce({ status: 'ok', chunks_ingested: 5, concepts_extracted: 2, title: 'Article' });

    const result = await registeredHandler({
      source_type: 'url', notebook: 'kong', title: 'Article', url: 'https://docs.konghq.com',
    }) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.status).toBe('ok');
    expect(parsed.chunks_ingested).toBe(5);
  });

  it('propagates InternalError from FastAPI 5xx', async () => {
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');
    mockPost.mockRejectedValueOnce(new McpError(ErrorCode.InternalError, 'service down'));

    await expect(
      registeredHandler({ source_type: 'url', notebook: 'kong', title: 'Doc', url: 'https://example.com' }),
    ).rejects.toMatchObject({ code: ErrorCode.InternalError });
  });

  it('throws InvalidParams for missing url when source_type=url', async () => {
    await expect(
      registeredHandler({ source_type: 'url', notebook: 'personal', title: 'Missing URL' }),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
  });
});
