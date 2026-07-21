// ⚠️ MUST be first import — initializes OpenTelemetry before any other code
import './instrumentation.js';

import express from 'express';
import { Pool } from 'pg';
import { OutboxRelayWorker } from '@mom-platform/shared-kernel';
import { helloRouter } from './infrastructure/http/hello.router.js';
import { runMigrations } from './infrastructure/db/migrate.js';

const PORT = parseInt(process.env['PORT'] ?? '3010', 10);
const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://hello_user:hello_pass@localhost:5432/hello_world_db';
const KAFKA_BROKERS = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');

async function bootstrap() {
  // ── 1. Database ─────────────────────────────────────────────────────────
  const pool = new Pool({ connectionString: DATABASE_URL });

  // Wait for DB to be ready (simple retry)
  let dbReady = false;
  for (let i = 0; i < 10; i++) {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
      console.info('[Bootstrap] Database connection established');
      break;
    } catch {
      console.warn(`[Bootstrap] DB not ready yet, retrying (${i + 1}/10)...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!dbReady) throw new Error('Database never became ready');

  // ── 2. Migrations ───────────────────────────────────────────────────────
  await runMigrations(pool);

  // ── 3. Outbox Relay Worker ──────────────────────────────────────────────
  const relay = new OutboxRelayWorker({
    pool,
    kafkaBrokers: KAFKA_BROKERS,
    clientId: 'hello-world-service',
    pollIntervalMs: 1000,
    batchSize: 50,
    maxRetries: 3,
  });
  await relay.start();

  // ── 4. HTTP Server ──────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // Health + readiness
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'hello-world-service', uptime: process.uptime() });
  });

  // Prometheus metrics (minimal)
  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(`# HELP hello_world_requests_total Total number of requests\n# TYPE hello_world_requests_total counter\nhello_world_requests_total 0\n`);
  });

  // Business routes
  app.use('/api/hello', helloRouter(pool));

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[HTTP] Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  });

  const server = app.listen(PORT, () => {
    console.info(`[Bootstrap] hello-world-service listening on :${PORT}`);
    console.info(`[Bootstrap] → GET http://localhost:${PORT}/api/hello`);
    console.info(`[Bootstrap] → GET http://localhost:${PORT}/health`);
  });

  // ── 5. Graceful Shutdown ────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.info(`[Bootstrap] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await relay.stop();
      await pool.end();
      console.info('[Bootstrap] Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[Bootstrap] Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});
