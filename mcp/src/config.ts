/**
 * config.ts — Environment variable validation.
 *
 * Reads all required env vars at module load time.
 * Throws a single descriptive error listing ALL missing vars if any are absent.
 * Never starts the server in a partially-configured state (CONSTITUTION III.2).
 */

export interface Config {
  OLLAMA_BASE_URL: string;
  QDRANT_URL: string;
  NEO4J_URI: string;
  NEO4J_USER: string;
  NEO4J_PASSWORD: string;
  KONG_PROXY_URL: string;
  MCP_TRANSPORT: 'stdio' | 'sse';
  MCP_PORT: number;
  QUERY_SERVICE_URL: string;
  N8N_WEBHOOK_URL: string;
}

/**
 * Throws at the call site with a clear message naming the missing variable.
 * Return type is `never` so TypeScript narrows the surrounding expression to `string`.
 */
export function throwMissing(name: string): never {
  throw new Error(`Missing required environment variable: ${name}`);
}

function loadConfig(): Config {
  const required: Array<keyof Omit<Config, 'MCP_PORT'>> = [
    'OLLAMA_BASE_URL',
    'QDRANT_URL',
    'NEO4J_URI',
    'NEO4J_USER',
    'NEO4J_PASSWORD',
    'KONG_PROXY_URL',
    'MCP_TRANSPORT',
    'QUERY_SERVICE_URL',
    'N8N_WEBHOOK_URL',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Ensure all variables are set before starting the MCP server.',
    );
  }

  const transport = process.env['MCP_TRANSPORT'] as string;
  if (transport !== 'stdio' && transport !== 'sse') {
    throw new Error(
      `MCP_TRANSPORT must be "stdio" or "sse", got: "${transport}"`,
    );
  }

  return {
    OLLAMA_BASE_URL: process.env['OLLAMA_BASE_URL'] ?? throwMissing('OLLAMA_BASE_URL'),
    QDRANT_URL: process.env['QDRANT_URL'] ?? throwMissing('QDRANT_URL'),
    NEO4J_URI: process.env['NEO4J_URI'] ?? throwMissing('NEO4J_URI'),
    NEO4J_USER: process.env['NEO4J_USER'] ?? throwMissing('NEO4J_USER'),
    NEO4J_PASSWORD: process.env['NEO4J_PASSWORD'] ?? throwMissing('NEO4J_PASSWORD'),
    KONG_PROXY_URL: process.env['KONG_PROXY_URL'] ?? throwMissing('KONG_PROXY_URL'),
    MCP_TRANSPORT: transport,
    MCP_PORT: process.env['MCP_PORT'] ? parseInt(process.env['MCP_PORT'], 10) : 3000,
    QUERY_SERVICE_URL: process.env['QUERY_SERVICE_URL'] ?? throwMissing('QUERY_SERVICE_URL'),
    N8N_WEBHOOK_URL: process.env['N8N_WEBHOOK_URL'] ?? throwMissing('N8N_WEBHOOK_URL'),
  };
}

export const config: Config = loadConfig();
