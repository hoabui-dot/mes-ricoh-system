export interface TableDefinition {
  resource: string;
  tableName: string;
  eventType?: string;
  releaseEventName?: string;
  protectedAfterRelease?: boolean;
}

export const TABLES: TableDefinition[] = [
  { resource: 'sites', tableName: 'md_site' },
  { resource: 'shopfloors', tableName: 'md_shopfloor' },
  { resource: 'production-areas', tableName: 'md_production_area' },
  { resource: 'uoms', tableName: 'md_uom' },
  { resource: 'uom-conversions', tableName: 'md_uom_conversion' },
  { resource: 'shifts', tableName: 'md_shift' },
  { resource: 'reason-codes', tableName: 'md_reason_code' },
  { resource: 'items', tableName: 'md_item' },
  { resource: 'material-groups', tableName: 'md_material_group' },
  {
    resource: 'item-revisions',
    tableName: 'md_item_revision',
    eventType: 'MES.MasterData.ItemRevisionReleased.v2',
    releaseEventName: 'ItemRevisionReleased',
    protectedAfterRelease: true,
  },
  {
    resource: 'mbom-headers',
    tableName: 'md_mbom_header',
    eventType: 'MES.MasterData.MBOMReleased.v2',
    releaseEventName: 'MBOMReleased',
    protectedAfterRelease: true,
  },
  { resource: 'mbom-lines', tableName: 'md_mbom_line', protectedAfterRelease: true },
  { resource: 'component-substitutes', tableName: 'md_component_substitute' },
  {
    resource: 'production-versions',
    tableName: 'md_production_version',
    eventType: 'MES.MasterData.ProductionVersionReleased.v1',
    releaseEventName: 'ProductionVersionReleased',
  },
  { resource: 'ebom-headers', tableName: 'md_ebom_header', protectedAfterRelease: true },
  { resource: 'ebom-lines', tableName: 'md_ebom_line', protectedAfterRelease: true },
  { resource: 'operations', tableName: 'md_operation' },
  {
    resource: 'routing-headers',
    tableName: 'md_routing_header',
    eventType: 'MES.MasterData.RoutingReleased.v1',
    releaseEventName: 'RoutingReleased',
    protectedAfterRelease: true,
  },
  { resource: 'routing-operations', tableName: 'md_routing_operation', protectedAfterRelease: true },
  {
    resource: 'production-standards',
    tableName: 'md_production_standard',
    eventType: 'MES.MasterData.ProductionStandardReleased.v1',
    releaseEventName: 'ProductionStandardReleased',
    protectedAfterRelease: true,
  },
  { resource: 'work-instructions', tableName: 'md_work_instruction' },
  {
    resource: 'work-centers',
    tableName: 'md_work_center',
    eventType: 'MES.MasterData.WorkCenterActivated.v2',
    releaseEventName: 'WorkCenterActivated',
  },
  { resource: 'workstations', tableName: 'md_workstation' },
  { resource: 'machine-groups', tableName: 'md_workstation_machine_group' },
  { resource: 'machine-requirements', tableName: 'md_workstation_machine_requirement' },
  { resource: 'workstation-operation-capabilities', tableName: 'md_workstation_operation_capability' },
  {
    resource: 'equipment',
    tableName: 'md_equipment',
    eventType: 'MES.MasterData.EquipmentActivated.v2',
    releaseEventName: 'EquipmentActivated',
  },
  { resource: 'resource-assignments', tableName: 'md_resource_assignment' },
  { resource: 'resource-capabilities', tableName: 'md_resource_capability' },
  { resource: 'resource-calendars', tableName: 'md_resource_calendar' },
  { resource: 'skills', tableName: 'md_skill' },
  { resource: 'skill-groups', tableName: 'md_skill_group' },
  { resource: 'resource-skill-assignments', tableName: 'md_resource_skill_assignment' },
  { resource: 'work-center-compositions', tableName: 'md_work_center_composition' },
  {
    resource: 'employees',
    tableName: 'md_employee',
    eventType: 'MES.MasterData.EmployeeCreated.v1',
  },
  { resource: 'operation-skill-requirements', tableName: 'md_operation_skill_requirement' },
  { resource: 'role-permissions', tableName: 'md_role_permission' },
  { resource: 'user-resource-scopes', tableName: 'md_user_resource_scope' },
];

export const TABLE_BY_RESOURCE = new Map(TABLES.map((table) => [table.resource, table]));
