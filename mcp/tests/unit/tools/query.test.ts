/**
 * Unit tests for query tool handler.
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

describe('query tool handler', () => {
  let registeredHandler: (input: unknown) => Promise<unknown>;
  const mockServer = {
    tool: jest.fn((_name: string, _desc: string, _schema: unknown, handler: (input: unknown) => Promise<unknown>) => {
      registeredHandler = handler;
    }),
  };

  beforeEach(async () => {
    jest.resetModules();
    mockPost.mockReset();
    const { registerQueryTool } = await import('../../../src/tools/query.js');
    registerQueryTool(mockServer as never);
  });

  it('calls FastApiClient.post with correct payload', async () => {
    mockPost.mockResolvedValueOnce({
      answer: 'Kong is an API gateway.',
      citations: [],
      concepts_used: [],
    });

    await registeredHandler({ question: 'What is Kong?', notebook: 'kong' });
    expect(mockPost).toHaveBeenCalledWith('/query', expect.objectContaining({ question: 'What is Kong?', notebook: 'kong' }));
  });

  it('returns formatted output with answer and citations', async () => {
    mockPost.mockResolvedValueOnce({
      answer: 'answer text',
      citations: [{ chunk_id: '123e4567-e89b-12d3-a456-426614174000', document_title: 'doc', chunk_text: 'text', score: 0.9 }],
      concepts_used: ['kong'],
    });

    const result = await registeredHandler({ question: 'test', notebook: 'kong' }) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.answer).toBe('answer text');
    expect(parsed.citations).toHaveLength(1);
  });

  it('propagates InternalError from FastAPI', async () => {
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');
    mockPost.mockRejectedValueOnce(new McpError(ErrorCode.InternalError, 'service down'));

    await expect(registeredHandler({ question: 'test', notebook: 'kong' })).rejects.toMatchObject({
      code: ErrorCode.InternalError,
    });
  });

  it('returns answer with empty citations array (not an error)', async () => {
    mockPost.mockResolvedValueOnce({ answer: 'No content found.', citations: [], concepts_used: [] });

    const result = await registeredHandler({ question: 'obscure', notebook: 'music' }) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.citations).toHaveLength(0);
    expect(parsed.answer).toBeDefined();
  });
});
