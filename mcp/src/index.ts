/**
 * index.ts — Entry point. Selects transport based on MCP_TRANSPORT env var.
 *
 * stdio           → Claude Desktop / Claude Code (no HTTP server)
 * sse             → Streamable HTTP server on MCP_PORT (for Kong MCP Gateway)
 *
 * Streamable HTTP uses a single endpoint (POST /mcp) per the MCP spec.
 * Each session is identified by the `mcp-session-id` response header.
 * GET /mcp is supported for server-initiated SSE streams.
 * DELETE /mcp closes a session.
 * GET /health is available for Docker healthchecks.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createServer, registerTools } from './server.js';
import { config } from './config.js';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'http';
import { randomUUID } from 'crypto';

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function main(): Promise<void> {
  if (config.MCP_TRANSPORT === 'stdio') {
    const server = createServer();
    await registerTools(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // stdio mode: server runs until stdin closes
  } else {
    // Streamable HTTP mode — single endpoint for Kong MCP Gateway
    // Each session gets its own Server instance (SDK only supports one connection per instance)
    const transports = new Map<string, StreamableHTTPServerTransport>();

    const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const path = req.url?.split('?')[0];

      // Health check — used by Docker and Kong upstream healthchecks
      if (req.method === 'GET' && path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      // MCP Streamable HTTP endpoint — accepts both '/' (strip_path:true via Kong) and '/mcp' (direct)
      if (path === '/mcp' || path === '/' || path === '') {
        if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            const sessionId = req.headers['mcp-session-id'] as string | undefined;

            let transport: StreamableHTTPServerTransport;

            if (sessionId && transports.has(sessionId)) {
              // Existing session — reuse transport
              transport = transports.get(sessionId)!;
            } else if (!sessionId && isInitializeRequest(body)) {
              // New session — create a fresh server + transport per connection
              const server = createServer();
              await registerTools(server);
              transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                onsessioninitialized: (id) => {
                  transports.set(id, transport);
                },
              });
              transport.onclose = () => {
                if (transport.sessionId) transports.delete(transport.sessionId);
              };
              await server.connect(transport as Transport);
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Bad Request: missing or invalid session ID' }));
              return;
            }

            await transport.handleRequest(req, res, body);
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (req.method === 'GET') {
          // Server-initiated SSE stream for an existing session
          const sessionId = req.headers['mcp-session-id'] as string | undefined;
          const transport = sessionId ? transports.get(sessionId) : undefined;
          if (!transport) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or missing mcp-session-id' }));
            return;
          }
          await transport.handleRequest(req, res);
          return;
        }

        if (req.method === 'DELETE') {
          // Client-initiated session termination
          const sessionId = req.headers['mcp-session-id'] as string | undefined;
          if (sessionId) {
            const transport = transports.get(sessionId);
            if (transport) {
              await transport.close();
              transports.delete(sessionId);
            }
          }
          res.writeHead(200).end();
          return;
        }

        res.writeHead(405).end();
        return;
      }

      res.writeHead(404).end();
    });

    httpServer.listen(config.MCP_PORT, () => {
      process.stderr.write(`MCP Streamable HTTP server listening on port ${config.MCP_PORT}\n`);
    });
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
