import { Router, type Request, type Response, type NextFunction } from 'express';
import { Pool } from 'pg';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { v4 as uuidv4 } from 'uuid';
import { createEventEnvelope, writeToOutbox } from '@mom-platform/shared-kernel';

const TRACER_NAME = 'hello-world-service';
const TOPIC = 'platform.hello.HelloWorldCreated.v1';
const EVENT_TYPE = 'Platform.Hello.HelloWorldCreated.v1';

export interface HelloResponse {
  message: string;
  greeting_id: string;
  user_id: string;
  role_code: string;
  trace_id: string;
  timestamp: string;
}

export function helloRouter(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/hello
   *
   * Protected by Kong API Gateway JWT verification.
   * Kong injects X-User-ID and X-Role-Code headers from the decoded JWT.
   * This service trusts these headers — does NOT re-verify the JWT.
   *
   * Publishes HelloWorldCreated event via Outbox pattern.
   */
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    const tracer = trace.getTracer(TRACER_NAME);

    return tracer.startActiveSpan('hello.create', async (span) => {
      try {
        // ── Read Gateway-injected headers ───────────────────────────────
        const userId = (req.headers['x-user-id'] as string | undefined) ?? 'anonymous';
        const roleCode = (req.headers['x-role-code'] as string | undefined) ?? 'UNKNOWN';
        const traceId = (req.headers['x-trace-id'] as string | undefined) ?? span.spanContext().traceId;

        span.setAttributes({
          'hello.user_id': userId,
          'hello.role_code': roleCode,
          'hello.trace_id': traceId,
        });

        // ── Set session user for audit trigger ──────────────────────────
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);

          const greetingId = uuidv4();
          const message = `Xin chào từ MOM Platform! User: ${userId} | Role: ${roleCode}`;

          // ── Persist to DB ───────────────────────────────────────────
          await client.query(
            `INSERT INTO greetings (id, message, user_id, role_code, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [greetingId, message, userId, roleCode],
          );

          // ── Write to Outbox (same transaction) ──────────────────────
          const envelope = createEventEnvelope({
            event_type: EVENT_TYPE,
            source_service: 'hello-world-service',
            trace_id: traceId,
            payload: {
              greeting_id: greetingId,
              message,
              requested_by_user_id: userId,
              requested_by_role: roleCode,
            },
          });

          await writeToOutbox(client, { topic: TOPIC, envelope });

          await client.query('COMMIT');

          span.setStatus({ code: SpanStatusCode.OK });
          span.end();

          const response: HelloResponse = {
            message,
            greeting_id: greetingId,
            user_id: userId,
            role_code: roleCode,
            trace_id: traceId,
            timestamp: new Date().toISOString(),
          };

          // Forward trace ID in response header for correlation
          res.setHeader('X-Trace-ID', traceId);
          res.json(response);
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.end();
        next(err);
      }
    });
  });

  return router;
}
