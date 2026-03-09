/**
 * Unit tests for ingest_document tool handler.
 * All deps mocked — fetch is mocked via jest.spyOn(global, 'fetch').
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

jest.mock('../../../src/config.js', () => ({
  config: { N8N_WEBHOOK_URL: 'http://localhost:5678/webhook' },
}));

describe('ingest_document tool handler', () => {
  let registeredHandler: (input: unknown) => Promise<unknown>;
  const mockServer = {
    tool: jest.fn(
      (
        _name: string,
        _desc: string,
        _schema: unknown,
        handler: (input: unknown) => Promise<unknown>,
      ) => {
        registeredHandler = handler;
      },
    ),
  };

  let fetchSpy: jest.SpiedFunction<typeof global.fetch>;

  beforeEach(async () => {
    jest.resetModules();
    fetchSpy = jest.spyOn(global, 'fetch');
    const { registerIngestTool } = await import('../../../src/tools/ingest.js');
    registerIngestTool(mockServer as never);
  });

  it('calls n8n webhook with correct payload for url source', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 'ok', chunks_ingested: 10, concepts_extracted: 3, title: 'Test' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await registeredHandler({
      source_type: 'url',
      notebook: 'personal',
      title: 'Test',
      url: 'https://example.com',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:5678/webhook/ingest',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns mapped output on success', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 'ok', chunks_ingested: 5, concepts_extracted: 2, title: 'Article' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = (await registeredHandler({
      source_type: 'url',
      notebook: 'kong',
      title: 'Article',
      url: 'https://docs.konghq.com',
    })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.status).toBe('ok');
    expect(parsed.chunks_ingested).toBe(5);
  });

  it('throws InternalError when n8n webhook is unreachable', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(
      registeredHandler({
        source_type: 'url',
        notebook: 'kong',
        title: 'Doc',
        url: 'https://example.com',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.InternalError });
  });

  it('throws InternalError when n8n returns non-ok status', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'workflow error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      registeredHandler({
        source_type: 'url',
        notebook: 'kong',
        title: 'Doc',
        url: 'https://example.com',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.InternalError });
  });

  it('throws InvalidParams for missing url when source_type=url', async () => {
    await expect(
      registeredHandler({ source_type: 'url', notebook: 'personal', title: 'Missing URL' }),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
  });
});
