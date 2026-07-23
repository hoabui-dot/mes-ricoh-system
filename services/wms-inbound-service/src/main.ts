import express from 'express';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { runMigrations } from './infrastructure/db/migrate.js';
import { createInventoryReceiptClient } from './infrastructure/client/inventory-receipt-client.js';

const PORT = Number(process.env['PORT'] ?? '3080');
const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://wms_inbound_user:wms_inbound_pass@localhost:15440/wms_inbound_db';
const MIGRATION_DATABASE_URL = process.env['MIGRATION_DATABASE_URL'] ?? DATABASE_URL;
const INVENTORY_SERVICE_URL = (process.env['INVENTORY_SERVICE_URL'] ?? 'http://localhost:3070').replace(/\/$/, '');
const inventoryReceiptClient = createInventoryReceiptClient(INVENTORY_SERVICE_URL);

async function waitForDb(pool: Pool): Promise<void> {
  for (let i = 0; i < 15; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error('Database never became ready');
}

function getUser(req: express.Request): string | null {
  const value = req.headers['x-user-id'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function confirmReceipt(pool: Pool, receiptId: string, userId: string | null): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const receipt = await client.query('SELECT receipt_id, warehouse_location_id, status FROM inbound_receipt WHERE receipt_id = $1 FOR UPDATE', [receiptId]);
    if (!receipt.rows[0]) throw Object.assign(new Error('Receipt not found'), { statusCode: 404 });
    if (receipt.rows[0].status !== 'Draft') throw Object.assign(new Error('Receipt is not Draft'), { statusCode: 409 });
    const lines = await client.query('SELECT item_revision_id, lot_code, qty::float8, uom_code, expiry_date::text FROM inbound_receipt_line WHERE receipt_id = $1 ORDER BY lot_code', [receiptId]);
    for (const line of lines.rows) {
      await inventoryReceiptClient.postReceipt({
        lot_code: line.lot_code,
        item_revision_id: line.item_revision_id,
        location_id: receipt.rows[0].warehouse_location_id,
        qty: line.qty,
        uom_code: line.uom_code,
        expiry_date: line.expiry_date,
      }, userId);
    }
    await client.query(`UPDATE inbound_receipt SET status = 'Confirmed', confirmed_at = NOW() WHERE receipt_id = $1`, [receiptId]);
    await client.query('COMMIT');
    return { receipt_id: receiptId, status: 'Confirmed', line_count: lines.rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function createReceipt(client: PoolClient, body: Record<string, unknown>, userId: string | null): Promise<Record<string, unknown>> {
  const receiptCode = typeof body['receipt_code'] === 'string' && body['receipt_code'] ? body['receipt_code'] : `RCV-${Date.now()}`;
  const locationId = body['warehouse_location_id'];
  if (typeof locationId !== 'string' || locationId.length === 0) throw Object.assign(new Error('warehouse_location_id is required'), { statusCode: 400 });
  const receiptId = randomUUID();
  await client.query(
    `INSERT INTO inbound_receipt (receipt_id, receipt_code, warehouse_location_id, created_by) VALUES ($1, $2, $3, $4)`,
    [receiptId, receiptCode, locationId, userId],
  );
  const lines = Array.isArray(body['lines']) ? body['lines'] : [];
  for (const raw of lines) {
    const line = raw as Record<string, unknown>;
    await client.query(
      `INSERT INTO inbound_receipt_line (receipt_id, item_revision_id, lot_code, qty, uom_code, expiry_date)
       VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::date)`,
      [receiptId, line['item_revision_id'], line['lot_code'], line['qty'], line['uom_code'], line['expiry_date'] ?? ''],
    );
  }
  return { receipt_id: receiptId, receipt_code: receiptCode, status: 'Draft', line_count: lines.length };
}

async function bootstrap(): Promise<void> {
  const migrationPool = new Pool({ connectionString: MIGRATION_DATABASE_URL });
  await waitForDb(migrationPool);
  await runMigrations(migrationPool);
  if (MIGRATION_DATABASE_URL !== DATABASE_URL) await migrationPool.end();
  const pool = MIGRATION_DATABASE_URL === DATABASE_URL ? migrationPool : new Pool({ connectionString: DATABASE_URL });
  await waitForDb(pool);

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'wms-inbound-service' }));
  app.post('/api/wms/inbound/receipts', async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await createReceipt(client, req.body as Record<string, unknown>, getUser(req));
      await client.query('COMMIT');
      res.status(201).json(row);
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  });
  app.post('/api/wms/inbound/receipts/:id/confirm', async (req, res, next) => {
    try {
      res.json(await confirmReceipt(pool, req.params['id'], getUser(req)));
    } catch (err) {
      next(err);
    }
  });
  app.get('/api/wms/inbound/receipts/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT * FROM inbound_receipt WHERE receipt_id = $1', [req.params['id']]);
      if (!rows[0]) return res.status(404).json({ error: 'Not Found' });
      return res.json(rows[0]);
    } catch (err) {
      return next(err);
    }
  });
  app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });
  app.listen(PORT, () => console.info(`[Bootstrap] wms-inbound-service listening on :${PORT}`));
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});
