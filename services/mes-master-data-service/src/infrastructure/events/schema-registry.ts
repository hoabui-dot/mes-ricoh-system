const EVENT_TYPES = [
  'MES.MasterData.SiteReleased.v1',
  'MES.MasterData.ItemReleased.v1',
  'MES.MasterData.UomReleased.v1',
  'MES.MasterData.ItemRevisionReleased.v1',
  'MES.MasterData.ItemRevisionReleased.v2',
  'MES.MasterData.MBOMReleased.v1',
  'MES.MasterData.MBOMReleased.v2',
  'MES.MasterData.RoutingReleased.v1',
  'MES.MasterData.ProductionVersionReleased.v1',
  'MES.MasterData.ProductionStandardReleased.v1',
  'MES.MasterData.WorkCenterActivated.v1',
  'MES.MasterData.WorkCenterActivated.v2',
  'MES.MasterData.EquipmentActivated.v1',
  'MES.MasterData.EquipmentActivated.v2',
  'MES.MasterData.EmployeeCreated.v1',
  'MES.MasterData.ShiftCreated.v1',
  'MES.MasterData.EmployeeScheduleAssigned.v1',
  'MES.MasterData.EmployeeSkillAssigned.v1',
];

const schema = {
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
      properties: {
        master_id: { type: 'string' },
        code: { type: 'string' },
        version_no: { type: 'integer' },
        site_id: { type: ['string', 'null'] },
      },
    },
  },
  required: ['event_id', 'event_type', 'occurred_at', 'source_service', 'trace_id', 'payload'],
};

export async function registerEventSchemas(schemaRegistryUrl: string): Promise<void> {
  for (const eventType of EVENT_TYPES) {
    const subject = `${eventType}-value`;
    const response = await fetch(`${schemaRegistryUrl.replace(/\/$/, '')}/subjects/${subject}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/vnd.schemaregistry.v1+json' },
      body: JSON.stringify({ schemaType: 'JSON', schema: JSON.stringify(schema) }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Schema Registry registration failed for ${subject}: ${response.status} ${text}`);
    }
  }
  console.info(`[SchemaRegistry] Registered ${EVENT_TYPES.length} MES master-data schemas`);
}
