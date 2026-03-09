/**
 * server.ts — McpServer instantiation and tool registry.
 *
 * Tools are registered by their respective handler modules.
 * Import order here determines tool registration order.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'plaudelm',
    version: '0.1.0',
  });
  return server;
}

/**
 * Register all 7 tools onto the server instance.
 * Called from index.ts after server creation.
 * Tools import and self-register during this call.
 */
export async function registerTools(server: McpServer): Promise<void> {
  // Dynamic imports ensure tools are registered in declaration order.
  // Each tool module calls server.tool() to register itself.
  const [
    { registerQueryTool },
    { registerIngestTool },
    { registerConceptsTools },
    { registerNotebooksTool },
    { registerGraphTool },
    { registerAudioTool },
  ] = await Promise.all([
    import('./tools/query.js'),
    import('./tools/ingest.js'),
    import('./tools/concepts.js'),
    import('./tools/notebooks.js'),
    import('./tools/graph.js'),
    import('./tools/audio.js'),
  ]);

  registerQueryTool(server);
  registerIngestTool(server);
  registerConceptsTools(server);
  registerNotebooksTool(server);
  registerGraphTool(server);
  registerAudioTool(server);
}
