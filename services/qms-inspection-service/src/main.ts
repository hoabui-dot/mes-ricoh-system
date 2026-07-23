import './instrumentation.js';
import express from 'express';
import { Pool } from 'pg';
import { OutboxRelayWorker } from '@mom-platform/shared-kernel';
import { runMigrations } from './infrastructure/db/migrate.js';
import { seedQmsInspection } from './infrastructure/db/seed.js';
import { inspectionRouter } from './infrastructure/http/inspection.router.js';
import { registerEventSchemas } from './infrastructure/events/schema-registry.js';
import { MesInspectionConsumer } from './infrastructure/events/mes-consumer.js';

const PORT = Number(process.env['PORT'] ?? 3110);
const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://qms_inspection_user:qms_inspection_pass@localhost:15442/qms_inspection_db';
const MIGRATION_DATABASE_URL = process.env['MIGRATION_DATABASE_URL'] ?? DATABASE_URL;
const KAFKA_BROKERS = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');
const SCHEMA_REGISTRY_URL = process.env['SCHEMA_REGISTRY_URL'] ?? 'http://localhost:18081';

async function waitForDb(pool: Pool): Promise<void> { for (let attempt = 1; attempt <= 15; attempt += 1) { try { await pool.query('SELECT 1'); return; } catch { await new Promise((resolve) => setTimeout(resolve, 2000)); } } throw new Error('Database never became ready'); }

async function bootstrap(): Promise<void> {
  const migrationPool = new Pool({ connectionString: MIGRATION_DATABASE_URL }); await waitForDb(migrationPool); await runMigrations(migrationPool); if (process.env['SEED_ON_STARTUP'] !== 'false') await seedQmsInspection(migrationPool);
  const pool = MIGRATION_DATABASE_URL === DATABASE_URL ? migrationPool : new Pool({ connectionString: DATABASE_URL }); await waitForDb(pool);
  try { await registerEventSchemas(SCHEMA_REGISTRY_URL); } catch (error) { console.warn('[SchemaRegistry] Registration skipped:', error); }
  const relay = new OutboxRelayWorker({ pool, kafkaBrokers: KAFKA_BROKERS, clientId: 'qms-inspection-service', pollIntervalMs: 1000, batchSize: 50, maxRetries: 3 }); await relay.start();
  const consumer = new MesInspectionConsumer(pool, KAFKA_BROKERS); await consumer.start();
  const app = express(); app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'qms-inspection-service', uptime: process.uptime() }));
  app.get('/metrics', (_req, res) => { res.type('text/plain').send('# HELP qms_inspection_service_up Service health\n# TYPE qms_inspection_service_up gauge\nqms_inspection_service_up 1\n'); });
  app.use('/api/qms/inspection', inspectionRouter(pool));
  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));
  app.use((error: Error & { statusCode?: number; errorCode?: string; details?: unknown; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { const mapped: Record<string, number> = { '23505': 409, '23514': 422, '23503': 422 }; console.error('[HTTP] Unhandled error:', error); res.status(error.statusCode ?? (error.code ? mapped[error.code] : undefined) ?? 500).json({ error: error.errorCode ?? (error.statusCode ? error.message : 'Internal Server Error'), message: error.message, details: error.details }); });
  const server = app.listen(PORT, () => console.info(`[Bootstrap] qms-inspection-service listening on :${PORT}`));
  const shutdown = async () => { server.close(async () => { await consumer.stop(); await relay.stop(); await pool.end(); if (pool !== migrationPool) await migrationPool.end(); process.exit(0); }); setTimeout(() => process.exit(1), 10000); };
  process.on('SIGTERM', () => void shutdown()); process.on('SIGINT', () => void shutdown());
}
bootstrap().catch((error) => { console.error('[Bootstrap] Fatal error:', error); process.exit(1); });
