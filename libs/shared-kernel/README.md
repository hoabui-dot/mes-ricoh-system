# @mom-platform/shared-kernel

**MOM Platform Shared-Kernel Library** — common infrastructure code used by all services across MES, WMS, and QMS clusters.

> ⚠️ **Critical Rule:** This package must **never** contain domain logic. It only contains infrastructure primitives that work for any bounded context.

## What's Inside

| Module | Purpose |
|--------|---------|
| `EventEnvelope<T>` | Standard event contract for all cross-service events |
| `createEventEnvelope()` | Factory to build envelopes with auto-generated `event_id` and `occurred_at` |
| `OutboxRelayWorker` | Background worker that polls `outbox_events` table and publishes to Kafka |
| `writeToOutbox()` | Writes an event to the outbox table within an existing DB transaction |
| `audit-trigger.sql` | SQL trigger template for `created_at`, `updated_at`, `created_by`, `updated_by` |
| `lifecycle-state-machine.sql` | Generic state transition validator as a SQL function |

## Installation

All services reference this package via npm workspace:

```json
// In service's package.json:
{
  "dependencies": {
    "@mom-platform/shared-kernel": "workspace:*"
  }
}
```

## Usage Examples

### Publishing an event with Outbox Pattern

```typescript
import { createEventEnvelope, writeToOutbox } from '@mom-platform/shared-kernel';

// Inside a repository method, within a transaction:
await db.transaction(async (client) => {
  // 1. Save domain record
  await client.query('INSERT INTO md_item ...', [...]);

  // 2. Write event to outbox (same transaction = atomic)
  const envelope = createEventEnvelope({
    event_type: 'MES.MasterData.ItemRevisionReleased.v1',
    source_service: 'mes-master-data-service',
    trace_id: getCurrentTraceId(), // from OTel context
    payload: { item_id: 'ITEM-001', revision: 'R1' },
  });
  await writeToOutbox(client, { topic: 'mes.master-data', envelope });
});
```

### Starting the Outbox Relay Worker

```typescript
import { OutboxRelayWorker } from '@mom-platform/shared-kernel';

// In main.ts, after DB pool is ready:
const relay = new OutboxRelayWorker({
  pool: dbPool,
  kafkaBrokers: process.env.KAFKA_BROKERS!.split(','),
  clientId: 'mes-master-data-service',
  pollIntervalMs: 500,
  batchSize: 100,
  maxRetries: 5,
});
await relay.start();

// Graceful shutdown:
process.on('SIGTERM', async () => {
  await relay.stop();
  await dbPool.end();
  process.exit(0);
});
```

### Event Naming Convention

```
<Cluster>.<BoundedContext>.<EventName>.v<N>

Examples:
  MES.MasterData.MBOMReleased.v1
  MES.Execution.WOCompleted.v1
  WMS.Inventory.StockReserved.v1
  QMS.Inspection.InspectionPassed.v1
```

## Versioning

This package is **versioned**. Services pin to a specific version via `workspace:*`. When making breaking changes:
1. Bump the version in `package.json`
2. Update `CHANGELOG.md`
3. Run contract tests across all consumers before merging

## Adding New Shared Primitives

Before adding to this package, ask: _"Is this logic domain-free and needed by 2+ services across different bounded contexts?"_

- If **yes** → add here
- If **no** → put it in the service or cluster that needs it
