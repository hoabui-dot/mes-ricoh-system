const EVENT_TYPES = [
  'QMS.Inspection.InspectionPlanReleased.v1',
  'QMS.Inspection.InspectionResultRecorded.v1',
  'QMS.Inspection.InspectionFailed.v1',
];

export async function registerEventSchemas(url: string): Promise<void> {
  const base = url.replace(/\/$/, '');
  for (const eventType of EVENT_TYPES) {
    const schema = { type: 'object', additionalProperties: true, properties: { event_id: { type: 'string' }, event_type: { type: 'string' }, occurred_at: { type: 'string' }, source_service: { type: 'string' }, trace_id: { type: 'string' }, payload: { type: 'object', additionalProperties: true } }, required: ['event_id', 'event_type', 'occurred_at', 'source_service', 'trace_id', 'payload'] };
    const response = await fetch(`${base}/subjects/${eventType}-value/versions`, { method: 'POST', headers: { 'content-type': 'application/vnd.schemaregistry.v1+json' }, body: JSON.stringify({ schemaType: 'JSON', schema: JSON.stringify(schema) }) });
    if (!response.ok && response.status !== 409) throw new Error(`Schema Registry registration failed for ${eventType}: ${response.status}`);
  }
}
