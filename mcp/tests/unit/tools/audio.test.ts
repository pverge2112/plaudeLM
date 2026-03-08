/**
 * Unit tests for audio_overview tool handler.
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

describe('audio_overview tool handler', () => {
  let registeredHandler: (input: unknown) => Promise<unknown>;
  const mockServer = {
    tool: jest.fn((_name: string, _desc: string, _schema: unknown, handler: (input: unknown) => Promise<unknown>) => {
      registeredHandler = handler;
    }),
  };

  beforeEach(async () => {
    jest.resetModules();
    mockPost.mockReset();
    const { registerAudioTool } = await import('../../../src/tools/audio.js');
    registerAudioTool(mockServer as never);
  });

  it('calls FastApiClient.post with /audio-overview', async () => {
    mockPost.mockResolvedValueOnce({ script: 'a'.repeat(200), audio_path: '/tmp/audio.mp3', duration_seconds: 120 });

    await registeredHandler({ notebook: 'kong', topic: 'rate limiting' });
    expect(mockPost).toHaveBeenCalledWith('/audio-overview', expect.objectContaining({ notebook: 'kong', topic: 'rate limiting' }));
  });

  it('throws InternalError when service is down', async () => {
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');
    mockPost.mockRejectedValueOnce(new McpError(ErrorCode.InternalError, 'service down'));

    await expect(registeredHandler({ notebook: 'kong', topic: 'test' })).rejects.toMatchObject({
      code: ErrorCode.InternalError,
    });
  });

  it('throws InternalError when script is shorter than 200 chars', async () => {
    mockPost.mockResolvedValueOnce({ script: 'too short', audio_path: '/tmp/audio.mp3', duration_seconds: 5 });

    await expect(registeredHandler({ notebook: 'kong', topic: 'test' })).rejects.toMatchObject({
      code: ErrorCode.InternalError,
      message: expect.stringContaining('too short'),
    });
  });
});
