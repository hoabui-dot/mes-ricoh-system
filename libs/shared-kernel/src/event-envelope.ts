import { v4 as uuidv4 } from 'uuid';

/**
 * Standard Event Envelope used by ALL services across MES / WMS / QMS clusters.
 *
 * Naming convention for event_type:
 *   <Cluster>.<BoundedContext>.<EventName>.v<N>
 *   e.g. "MES.MasterData.MBOMReleased.v1"
 *        "MES.Execution.WOCompleted.v1"
 *        "WMS.Inventory.StockReserved.v1"
 *
 * IMPORTANT: Never change the shape of this type without bumping the version
 * in the event_type string AND updating all consumers via contract tests.
 */
export interface EventEnvelope<TPayload = unknown> {
  /** UUID v4 — globally unique event identifier (used for idempotency) */
  readonly event_id: string;

  /**
   * Fully-qualified event type following naming convention.
   * The version suffix allows backward-compatible schema evolution.
   */
  readonly event_type: string;

  /** ISO-8601 UTC timestamp of when the domain event occurred */
  readonly occurred_at: string;

  /** Service that produced this event — matches service.manifest.yaml `service` field */
  readonly source_service: string;

  /**
   * Distributed trace ID (from OpenTelemetry context).
   * Allows correlating this event with the originating HTTP request trace.
   */
  readonly trace_id: string;

  /** Optional vNext metadata; existing v1 producers may omit these fields. */
  readonly aggregate_type?: string;
  readonly aggregate_id?: string;
  readonly aggregate_version?: number;
  readonly correlation_id?: string;
  readonly causation_id?: string;
  readonly site_id?: string;
  readonly schema_version?: number;
  readonly metadata?: Record<string, unknown>;

  /** Domain-specific event payload. Strongly typed per event. */
  readonly payload: TPayload;
}

/**
 * Factory function to create a new EventEnvelope.
 * Automatically generates event_id and occurred_at.
 *
 * @example
 * const envelope = createEventEnvelope({
 *   event_type: 'MES.MasterData.MBOMReleased.v1',
 *   source_service: 'mes-master-data-service',
 *   trace_id: getCurrentTraceId(),
 *   payload: { mbom_id: 'MBOM-001', revision: 'R1' },
 * });
 */
export function createEventEnvelope<TPayload>(
  params: Omit<EventEnvelope<TPayload>, 'event_id' | 'occurred_at'>,
): EventEnvelope<TPayload> {
  return {
    event_id: uuidv4(),
    occurred_at: new Date().toISOString(),
    event_type: params.event_type,
    source_service: params.source_service,
    trace_id: params.trace_id,
    payload: params.payload,
  };
}

/**
 * Type guard: checks if a value conforms to the EventEnvelope shape.
 * Useful in consumers when deserializing from Kafka.
 */
export function isEventEnvelope(value: unknown): value is EventEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['event_id'] === 'string' &&
    typeof obj['event_type'] === 'string' &&
    typeof obj['occurred_at'] === 'string' &&
    typeof obj['source_service'] === 'string' &&
    typeof obj['trace_id'] === 'string' &&
    'payload' in obj
  );
}

/** Stable Kafka key without changing the meaning of existing event versions. */
export function eventPartitionKey(envelope: Pick<EventEnvelope, 'event_id' | 'aggregate_id'>): string {
  return envelope.aggregate_id || envelope.event_id;
}
