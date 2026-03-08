/**
 * index.ts — Entry point. Selects transport based on MCP_TRANSPORT env var.
 *
 * stdio → Claude Desktop / Claude Code (no HTTP server)
 * sse   → HTTP/SSE server on MCP_PORT (for Kong MCP Gateway)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer, registerTools } from './server.js';
import { config } from './config.js';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'http';

async function main(): Promise<void> {
  const server = createServer();
  await registerTools(server);

  if (config.MCP_TRANSPORT === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // stdio mode: server runs until stdin closes
  } else {
    // SSE mode — bind HTTP server for Kong MCP Gateway
    const transports = new Map<string, SSEServerTransport>();

    const httpServer = createHttpServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'GET' && req.url === '/sse') {
          const transport = new SSEServerTransport('/messages', res);
          transports.set(transport.sessionId, transport);
          await server.connect(transport);
          transport.onclose = () => transports.delete(transport.sessionId);
        } else if (req.method === 'POST' && req.url?.startsWith('/messages')) {
          const sessionId = new URL(req.url, `http://localhost`).searchParams.get('sessionId');
          const transport = sessionId ? transports.get(sessionId) : undefined;
          if (transport) {
            await transport.handlePostMessage(req, res);
          } else {
            res.writeHead(404).end('Session not found');
          }
        } else if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } else {
          res.writeHead(404).end();
        }
      },
    );

    httpServer.listen(config.MCP_PORT, () => {
      process.stderr.write(`MCP SSE server listening on port ${config.MCP_PORT}\n`);
    });
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
