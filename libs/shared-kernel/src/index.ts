/**
 * @mom-platform/shared-kernel
 *
 * Public API of the Shared-Kernel library.
 * Import from this package in all services — never import internal files directly.
 *
 * @example
 * import { createEventEnvelope, OutboxRelayWorker, writeToOutbox } from '@mom-platform/shared-kernel';
 */

// ── Event Envelope ────────────────────────────────────────────────────────────
export {
  type EventEnvelope,
  createEventEnvelope,
  isEventEnvelope,
} from './event-envelope.js';

// ── Outbox Pattern ────────────────────────────────────────────────────────────
export {
  type OutboxEvent,
  type OutboxRelayConfig,
  OutboxRelayWorker,
  writeToOutbox,
  OUTBOX_TABLE_SQL,
} from './outbox-publisher.js';
