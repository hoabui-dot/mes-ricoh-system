import { Kafka, type Consumer } from 'kafkajs';
import { Pool } from 'pg';

type Envelope = {
  eventId?: string;
  EventId?: string;
  eventType?: string;
  EventType?: string;
  occurredAt?: string;
  OccurredAt?: string;
  stationId?: string;
  StationId?: string;
  payload?: Record<string, unknown>;
  Payload?: Record<string, unknown>;
};

type PrinterSnapshot = {
  printerId?: string | undefined;
  printerCode: string;
  adapterId?: string | undefined;
  status: string;
  lastHeartbeatAt?: string | undefined;
  lastError?: string | undefined;
  details?: unknown;
};

const TOPIC = 'station.events.printer';

export class PrintStationRuntimeConsumer {
  private consumer: Consumer | null = null;

  constructor(private readonly pool: Pool, private readonly brokers: string[]) {}

  async start(): Promise<void> {
    const kafka = new Kafka({ clientId: 'mes-master-data-print-station-runtime', brokers: this.brokers });
    this.consumer = kafka.consumer({ groupId: 'mes-master-data-print-station-runtime' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    await this.consumer.run({ eachMessage: async ({ message }) => {
      if (message.value) await this.process(message.value.toString('utf8'));
    }});
    console.info(`[PrintStationRuntime] Listening for ${TOPIC}`);
  }

  async stop(): Promise<void> {
    if (this.consumer) await this.consumer.disconnect();
  }

  private async process(raw: string): Promise<void> {
    let envelope: Envelope;
    try { envelope = JSON.parse(raw) as Envelope; } catch { return; }
    const eventId = envelope.eventId ?? envelope.EventId;
    const eventType = envelope.eventType ?? envelope.EventType;
    const payload = envelope.payload ?? envelope.Payload;
    if (!eventId || !eventType || !payload) return;

    const stationCode = stringValue(payload, 'printStationId', 'print_station_id', 'stationId', 'station_id')
      ?? envelope.stationId ?? envelope.StationId;
    const printerCode = stringValue(payload, 'printerCode', 'printer_code');
    if (!stationCode || !printerCode) return;

    const eventAt = dateValue(stringValue(payload, 'timestamp')) ?? dateValue(envelope.occurredAt ?? envelope.OccurredAt) ?? new Date();
    const status = normalizeStatus(stringValue(payload, 'status'));
    const adapterId = stringValue(payload, 'adapterId', 'adapter_id');
    const error = stringValue(payload, 'errorMessage', 'error_message');
    const details = payload.details ?? {};
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const station = await client.query<{ master_id: string }>(
        'SELECT master_id FROM md_print_station WHERE code = $1 AND is_active = TRUE FOR UPDATE', [stationCode]);
      if (!station.rows[0]) { await client.query('ROLLBACK'); return; }

      const accepted = await client.query(
        `INSERT INTO md_print_station_runtime_events (event_id, print_station_id, event_type, occurred_at)
         VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [eventId, station.rows[0].master_id, eventType, eventAt.toISOString()]);
      if (!accepted.rows[0]) { await client.query('COMMIT'); return; }

      const current = await client.query<{
        printer_snapshot: PrinterSnapshot[];
        runtime_status: string;
        adapter_id: string | null;
        last_error: string | null;
      }>('SELECT printer_snapshot, runtime_status, adapter_id, last_error FROM md_print_station_runtime_projection WHERE print_station_id = $1 FOR UPDATE', [station.rows[0].master_id]);
      const existing = current.rows[0];
      const snapshot = Array.isArray(existing?.printer_snapshot) ? [...existing.printer_snapshot] : [];
      const item: PrinterSnapshot = {
        printerId: stringValue(payload, 'printerId', 'printer_id'),
        printerCode,
        adapterId,
        status,
        lastHeartbeatAt: eventAt.toISOString(),
        lastError: error ?? undefined,
        details,
      };
      const index = snapshot.findIndex((entry) => entry.printerCode === printerCode);
      if (index >= 0) snapshot[index] = { ...snapshot[index], ...item };
      else snapshot.push(item);
      const online = snapshot.filter((entry) => ['ONLINE', 'IDLE', 'BUSY', 'PRINTING'].includes(entry.status)).length;
      const ready = snapshot.filter((entry) => ['ONLINE', 'IDLE'].includes(entry.status)).length;
      const busy = snapshot.filter((entry) => ['BUSY', 'PRINTING'].includes(entry.status)).length;
      const offline = snapshot.filter((entry) => entry.status === 'OFFLINE').length;
      const activeForWork = online;
      const errors = snapshot.filter((entry) => entry.status === 'ERROR').length;
      const runtimeStatus = status === 'ERROR' ? 'ERROR' : online > 0 ? 'ONLINE' : 'OFFLINE';
      const lastError = error ?? (status === 'ERROR' ? existing?.last_error : null);

      await client.query(
        `INSERT INTO md_print_station_runtime_projection
           (print_station_id, station_code, adapter_id, runtime_status, kafka_status, printer_count, online_printer_count, error_printer_count,
            registered_printer_count, ready_printer_count, busy_printer_count, offline_printer_count, active_for_work_printer_count,
            last_heartbeat_at, last_status_change_at, last_event_id, last_event_type, last_error, printer_snapshot, details, updated_at)
         VALUES ($1,$2,$3,$4,'CONNECTED',$5,$6,$7,$5,$8,$9,$10,$6,$11,$12,$13,$14,$15,$16,$17,NOW())
         ON CONFLICT (print_station_id) DO UPDATE SET
           adapter_id = COALESCE(EXCLUDED.adapter_id, md_print_station_runtime_projection.adapter_id),
           runtime_status = EXCLUDED.runtime_status,
           kafka_status = 'CONNECTED',
           printer_count = EXCLUDED.printer_count,
           online_printer_count = EXCLUDED.online_printer_count,
           error_printer_count = EXCLUDED.error_printer_count,
           registered_printer_count = EXCLUDED.registered_printer_count,
           ready_printer_count = EXCLUDED.ready_printer_count,
           busy_printer_count = EXCLUDED.busy_printer_count,
           offline_printer_count = EXCLUDED.offline_printer_count,
           active_for_work_printer_count = EXCLUDED.active_for_work_printer_count,
           last_heartbeat_at = GREATEST(md_print_station_runtime_projection.last_heartbeat_at, EXCLUDED.last_heartbeat_at),
           last_status_change_at = CASE WHEN EXCLUDED.last_event_type = 'printer.status.changed' THEN EXCLUDED.last_status_change_at ELSE md_print_station_runtime_projection.last_status_change_at END,
           last_event_id = EXCLUDED.last_event_id,
           last_event_type = EXCLUDED.last_event_type,
           last_error = EXCLUDED.last_error,
           printer_snapshot = EXCLUDED.printer_snapshot,
           details = EXCLUDED.details,
           updated_at = NOW()`,
        [station.rows[0].master_id, stationCode, adapterId ?? existing?.adapter_id ?? null, runtimeStatus, snapshot.length, online, errors,
          ready, busy, offline, eventAt.toISOString(), eventType === 'printer.status.changed' ? eventAt.toISOString() : null,
          eventId, eventType, lastError, JSON.stringify(snapshot), JSON.stringify(details)]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('[PrintStationRuntime] Event processing failed:', error);
    } finally { client.release(); }
  }
}

function stringValue(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  const entries = Object.entries(value);
  for (const key of keys) {
    const entry = entries.find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
    if (typeof entry === 'string' && entry) return entry;
  }
  return undefined;
}

function dateValue(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeStatus(value: string | undefined): string {
  const status = (value ?? 'UNKNOWN').toUpperCase();
  if (['ONLINE', 'IDLE', 'BUSY', 'PRINTING'].includes(status)) return 'ONLINE';
  if (['ERROR', 'PAPER_OUT', 'RIBBON_OUT'].includes(status)) return 'ERROR';
  if (status === 'OFFLINE') return 'OFFLINE';
  return 'UNKNOWN';
}
