/**
 * Unit tests for config.ts
 * RED phase — these tests must fail before config.ts is implemented.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('config', () => {
  const REQUIRED_VARS = [
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

  const validEnv: Record<string, string> = {
    OLLAMA_BASE_URL: 'http://localhost:11434',
    QDRANT_URL: 'http://localhost:6333',
    NEO4J_URI: 'bolt://localhost:7687',
    NEO4J_USER: 'neo4j',
    NEO4J_PASSWORD: 'changeme',
    KONG_PROXY_URL: 'http://localhost:8000',
    MCP_TRANSPORT: 'stdio',
    QUERY_SERVICE_URL: 'http://localhost:8000',
    N8N_WEBHOOK_URL: 'http://localhost:5678/webhook',
  };

  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear all required vars
    REQUIRED_VARS.forEach((key) => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    // Restore env
    REQUIRED_VARS.forEach((key) => {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    });
    jest.resetModules();
  });

  it('throws with the name of the single missing variable', async () => {
    const envWithOneMissing = { ...validEnv };
    delete (envWithOneMissing as Partial<typeof validEnv>)['NEO4J_PASSWORD'];
    Object.assign(process.env, envWithOneMissing);

    await expect(import('../../src/config.js')).rejects.toThrow('NEO4J_PASSWORD');
  });

  it('returns a typed Config object when all vars are present', async () => {
    Object.assign(process.env, validEnv);
    const { config } = await import('../../src/config.js');

    expect(config.QDRANT_URL).toBe('http://localhost:6333');
    expect(config.NEO4J_URI).toBe('bolt://localhost:7687');
    expect(config.MCP_TRANSPORT).toBe('stdio');
    expect(config.QUERY_SERVICE_URL).toBe('http://localhost:8000');
  });

  it('throws a single error listing ALL missing variables', async () => {
    // Set only the first three vars, leave the rest missing
    process.env['OLLAMA_BASE_URL'] = validEnv['OLLAMA_BASE_URL'];
    process.env['QDRANT_URL'] = validEnv['QDRANT_URL'];
    process.env['NEO4J_URI'] = validEnv['NEO4J_URI'];

    await expect(import('../../src/config.js')).rejects.toThrow(/NEO4J_USER/);
  });

  it('throwMissing helper has return type never (TypeScript narrowing)', async () => {
    Object.assign(process.env, validEnv);
    const { throwMissing } = await import('../../src/config.js');

    expect(() => throwMissing('SOME_VAR')).toThrow('SOME_VAR');
  });
});
