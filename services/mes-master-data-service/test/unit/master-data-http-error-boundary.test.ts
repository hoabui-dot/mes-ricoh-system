import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { masterDataRouter } from '../../src/infrastructure/http/master-data.router.js';

describe('master-data HTTP error boundary', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    server = undefined;
  });

  async function request(method: 'POST' | 'PUT', path: string, body: Record<string, unknown> = { name: { en: 'Missing required Vietnamese value' } }) {
    const app = express();
    app.use(express.json());
    app.use('/api/mes/master-data', masterDataRouter({} as Pool));
    app.use((error: Error & { statusCode?: number }, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(error.statusCode || 500).json({ error: error.message });
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${port}/api/mes/master-data${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it.each([
    ['POST', '/mbom-headers'],
    ['PUT', '/mbom-headers/00000000-0000-0000-0000-000000000001'],
    ['POST', '/production-lines'],
    ['PUT', '/production-lines/00000000-0000-0000-0000-000000000001'],
  ] as const)('returns a client error instead of terminating the process for invalid localized %s payloads', async (method, path) => {
    const response = await request(method, path);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'name must be LocalizedText with a non-empty vi value',
    });
  });

  it('accepts empty optional locale fields emitted by localized forms', async () => {
    const response = await request('POST', '/mbom-headers/aggregate', {
      name: { vi: 'MBOM hợp lệ', en: '', ja: '', ko: '' },
      description: { vi: '', en: '', ja: '', ko: '' },
      lines: [],
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: 'MBOM_NO_LINES' });
  });

  it('does not expose the retired EBOM resource', async () => {
    const response = await request('POST', '/ebom-headers', { name: { vi: 'EBOM không còn được MES quản lý' } });
    expect(response.status).toBe(404);
  });
});
