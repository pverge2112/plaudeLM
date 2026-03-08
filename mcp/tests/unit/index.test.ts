/**
 * Unit tests for index.ts transport selection.
 * RED phase — verifies transport branching behavior.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockConnect = jest.fn();
const mockStdioTransport = jest.fn().mockImplementation(() => ({}));
const mockSseTransport = jest.fn().mockImplementation(() => ({ sessionId: 'test-session' }));
const mockListen = jest.fn((_port: number, cb?: () => void) => { if (cb) cb(); return { on: jest.fn() }; });
const mockCreateHttpServer = jest.fn().mockReturnValue({ listen: mockListen });

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: mockStdioTransport,
}));

jest.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: mockSseTransport,
}));

jest.mock('http', () => ({
  createServer: mockCreateHttpServer,
}));

jest.mock('../../src/server.js', () => ({
  createServer: jest.fn().mockReturnValue({ connect: mockConnect }),
  registerTools: jest.fn().mockResolvedValue(undefined),
}));

describe('index.ts transport selection', () => {
  beforeEach(() => {
    jest.resetModules();
    mockConnect.mockReset();
    mockListen.mockClear();
    mockCreateHttpServer.mockClear();
    mockConnect.mockResolvedValue(undefined);
  });

  it('uses StdioServerTransport when MCP_TRANSPORT=stdio', async () => {
    jest.mock('../../src/config.js', () => ({
      config: {
        MCP_TRANSPORT: 'stdio',
        MCP_PORT: 3000,
      },
    }));

    await import('../../src/index.js');

    expect(mockStdioTransport).toHaveBeenCalledTimes(1);
    expect(mockCreateHttpServer).not.toHaveBeenCalled();
  });

  it('creates HTTP server when MCP_TRANSPORT=sse', async () => {
    jest.mock('../../src/config.js', () => ({
      config: {
        MCP_TRANSPORT: 'sse',
        MCP_PORT: 3000,
      },
    }));

    await import('../../src/index.js');

    expect(mockCreateHttpServer).toHaveBeenCalledTimes(1);
    expect(mockListen).toHaveBeenCalledWith(3000, expect.any(Function));
  });
});
