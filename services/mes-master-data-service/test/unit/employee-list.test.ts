import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool, QueryResult } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { masterDataRouter } from '../../src/infrastructure/http/master-data.router.js';

function result(rows: Record<string, unknown>[] = []): QueryResult {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

describe('Employee list', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    server = undefined;
  });

  it('keeps varchar shift names as text instead of parsing them as JSON', async () => {
    const query = vi.fn(async (queryText: string) => {
      const sql = String(queryText);
      expect(sql).toContain('MAX(sh.name) FILTER (WHERE sch.schedule_date = CURRENT_DATE) AS today_shift_name');
      expect(sql).not.toMatch(/sh\.name[^\n]+::jsonb AS today_shift_name/);
      return result([{
        master_id: '00000000-0000-0000-0000-000000000201',
        code: 'EMP-MIX-001',
        name: 'Mixing Operator 001',
        today_shift_code: 'SHIFT-A',
        today_shift_name: 'Day Shift',
      }]);
    });
    const pool = { query } as unknown as Pool;
    const app = express();
    app.use('/api/mes/master-data', masterDataRouter(pool));
    app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(500).json({ error: error.message });
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', resolve));
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/api/mes/master-data/employees?limit=10`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [{ code: 'EMP-MIX-001', today_shift_name: 'Day Shift' }],
    });
  });
});
