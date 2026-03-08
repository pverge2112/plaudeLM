/**
 * fastapi.ts — Typed HTTP client for the FastAPI query service.
 *
 * Uses native Node.js 20 fetch. All errors mapped to McpError.
 * No hardcoded URLs — base URL comes from Config (CONSTITUTION III.1).
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class FastApiClient {
  constructor(private readonly baseUrl: string) {}

  async post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new McpError(
        ErrorCode.InternalError,
        'query service unavailable — check that the query service is running',
      );
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    let detail = 'unknown error';
    try {
      const errorBody = (await response.json()) as { detail?: string };
      if (errorBody.detail) detail = errorBody.detail;
    } catch {
      // ignore parse errors
    }

    if (response.status >= 500) {
      throw new McpError(
        ErrorCode.InternalError,
        `query service error (${response.status}) — check that the query service is running`,
      );
    }

    throw new McpError(
      ErrorCode.InvalidParams,
      `request rejected by query service: ${detail}`,
    );
  }
}
