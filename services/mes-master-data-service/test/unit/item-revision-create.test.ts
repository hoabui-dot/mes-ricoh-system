import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { masterDataRouter } from '../../src/infrastructure/http/master-data.router.js';

const ITEM_ID = '00000000-0000-0000-0000-000000000101';
const CURRENT_REVISION_ID = '00000000-0000-0000-0000-000000000102';
const NEW_REVISION_ID = '00000000-0000-0000-0000-000000000103';
const SITE_ID = '00000000-0000-0000-0000-000000000104';
const UOM_ID = '00000000-0000-0000-0000-000000000105';
const MATERIAL_GROUP_ID = '00000000-0000-0000-0000-000000000106';

function result(rows: Record<string, unknown>[] = []): QueryResult {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

describe('Item Revision successor creation', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    server = undefined;
  });

  it('keeps every INSERT target column aligned with its value expression', async () => {
    const effectiveFrom = new Date(Date.now() + 60_000).toISOString();
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const query = vi.fn(async (queryText: string, values: unknown[] = []) => {
      const sql = String(queryText);
      queries.push({ sql, values });
      if (sql.includes('SELECT master_id, code FROM md_item')) return result([{ master_id: ITEM_ID, code: 'TEST-FG' }]);
      if (sql.includes('SELECT r.*, i.code AS item_code')) return result([{
        master_id: CURRENT_REVISION_ID,
        item_id: ITEM_ID,
        lifecycle_status: 'Released',
        effective_from: new Date(Date.now() - 86_400_000).toISOString(),
        effective_to: null,
        name: { vi: 'Sản phẩm kiểm thử' },
        site_id: SITE_ID,
        item_group: 'FG',
        material_group_id: MATERIAL_GROUP_ID,
        base_uom_id: UOM_ID,
        planning_strategy: 'MakeToStock',
        procurement_type: 'Make',
        tracking_level: 'None',
        default_scrap_rate: 0,
      }]);
      if (sql.includes('SELECT master_id FROM md_uom')) return result([{ master_id: UOM_ID }]);
      if (sql.includes('INSERT INTO md_item_revision_numbering')) return result([{ current_value: 2 }]);
      if (sql.includes('INSERT INTO md_item_revision (')) return result([{ master_id: NEW_REVISION_ID, item_id: ITEM_ID }]);
      return result();
    });
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const app = express();
    app.use(express.json());
    app.use('/api/mes/master-data', masterDataRouter(pool));
    app.use((error: Error & { statusCode?: number }, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(error.statusCode || 500).json({ error: error.message });
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', resolve));
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/api/mes/master-data/items/${ITEM_ID}/revisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': '00000000-0000-0000-0000-000000000001',
        'X-Role-Code': 'PLANT_MANAGER',
      },
      body: JSON.stringify({
        name: { vi: 'Sản phẩm kiểm thử R2' },
        base_uom_id: UOM_ID,
        material_group_id: MATERIAL_GROUP_ID,
        effective_from: effectiveFrom,
        change_reason: 'Regression test',
      }),
    });

    expect(response.status).toBe(201);
    const insert = queries.find(({ sql }) => sql.includes('INSERT INTO md_item_revision ('));
    expect(insert).toBeDefined();
    expect(insert?.sql).toContain('$19');
    expect(insert?.values).toHaveLength(19);
    expect(insert?.values[18]).toBe(CURRENT_REVISION_ID);
    expect(queries.some(({ sql, values }) => sql.includes('UPDATE md_item_revision SET effective_to') && values[2] === CURRENT_REVISION_ID)).toBe(true);
    expect(queries.filter(({ sql }) => sql.includes('INSERT INTO md_item_revision_temporal_audit'))).toHaveLength(2);
    expect(queries.at(-1)?.sql).toBe('COMMIT');
  });
});
