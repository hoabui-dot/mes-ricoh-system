const EVENT_TYPES = [
  'WMS.MasterData.WarehouseCreated.v1',
  'WMS.MasterData.ZoneCreated.v1',
  'WMS.MasterData.LocationCreated.v1',
  'WMS.MasterData.StorageBinCreated.v1',
  'WMS.MasterData.ItemUOMMappingCreated.v1',
];

const localizedTextSchema = {
  type: ['object', 'null'],
  additionalProperties: { type: 'string' },
  properties: {
    vi: { type: 'string' },
    en: { type: 'string' },
    ja: { type: 'string' },
    ko: { type: 'string' },
  },
};

function schemaFor(eventType: string) {
  const payloadProperties: Record<string, unknown> = {
    warehouse_id: { type: 'string' },
    warehouse_code: { type: 'string' },
    warehouse_name: localizedTextSchema,
    zone_id: { type: 'string' },
    zone_code: { type: 'string' },
    zone_name: localizedTextSchema,
    location_id: { type: 'string' },
    location_code: { type: 'string' },
    location_name: localizedTextSchema,
    bin_id: { type: 'string' },
    bin_code: { type: 'string' },
    bin_name: localizedTextSchema,
    mapping_id: { type: 'string' },
    item_revision_id: { type: 'string' },
    storage_uom_code: { type: 'string' },
  };
  if (eventType === 'WMS.MasterData.LocationCreated.v1') {
    payloadProperties['location_purpose'] = { type: 'string', enum: ['Storage', 'WorkCenterStaging'] };
    payloadProperties['staging_for_work_center_ref'] = { type: ['string', 'null'] };
  }
  if (eventType === 'WMS.MasterData.WarehouseCreated.v1') {
    payloadProperties['warehouse_description'] = localizedTextSchema;
  }
  return {
  type: 'object',
  additionalProperties: true,
  properties: {
    event_id: { type: 'string' },
    event_type: { type: 'string' },
    occurred_at: { type: 'string' },
    source_service: { type: 'string' },
    trace_id: { type: 'string' },
    payload: {
      type: 'object',
      additionalProperties: true,
      properties: payloadProperties,
    },
  },
  required: ['event_id', 'event_type', 'occurred_at', 'source_service', 'trace_id', 'payload'],
  };
}

export async function registerEventSchemas(schemaRegistryUrl: string): Promise<void> {
  for (const eventType of EVENT_TYPES) {
    const subject = `${eventType}-value`;
    const response = await fetch(`${schemaRegistryUrl.replace(/\/$/, '')}/subjects/${subject}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/vnd.schemaregistry.v1+json' },
      body: JSON.stringify({ schemaType: 'JSON', schema: JSON.stringify(schemaFor(eventType)) }),
    });
    if (!response.ok) {
      const text = await response.text();
      if ((eventType === 'WMS.MasterData.LocationCreated.v1' || eventType === 'WMS.MasterData.WarehouseCreated.v1') && response.status === 409) {
        console.warn(`[SchemaRegistry] ${eventType} additive fields were not accepted by existing dev-registry compatibility: ${text}`);
        continue;
      }
      throw new Error(`Schema Registry registration failed for ${subject}: ${response.status} ${text}`);
    }
  }
  console.info(`[SchemaRegistry] Registered ${EVENT_TYPES.length} WMS master-data schemas`);
}
