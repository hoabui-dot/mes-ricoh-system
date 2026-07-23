export type ResourceDefinition = {
  resource: string;
  tableName: string;
  idColumn: string;
  codeColumn?: string;
  localizedColumns: string[];
  createEventType?: string;
  allowedCreateColumns: string[];
  allowedUpdateColumns: string[];
};

export const RESOURCE_DEFINITIONS: Record<string, ResourceDefinition> = {
  warehouses: {
    resource: 'warehouses',
    tableName: 'wms_warehouse',
    idColumn: 'warehouse_id',
    codeColumn: 'warehouse_code',
    localizedColumns: ['warehouse_name', 'warehouse_description'],
    createEventType: 'WMS.MasterData.WarehouseCreated.v1',
    allowedCreateColumns: ['warehouse_code', 'warehouse_name', 'warehouse_description', 'site_id', 'status'],
    allowedUpdateColumns: ['warehouse_code', 'warehouse_name', 'warehouse_description', 'site_id', 'status'],
  },
  zones: {
    resource: 'zones',
    tableName: 'wms_zone',
    idColumn: 'zone_id',
    codeColumn: 'zone_code',
    localizedColumns: ['zone_name'],
    createEventType: 'WMS.MasterData.ZoneCreated.v1',
    allowedCreateColumns: ['warehouse_id', 'zone_code', 'zone_name', 'zone_type', 'status'],
    allowedUpdateColumns: ['zone_code', 'zone_name', 'zone_type', 'status'],
  },
  locations: {
    resource: 'locations',
    tableName: 'wms_storage_location',
    idColumn: 'location_id',
    codeColumn: 'location_code',
    localizedColumns: ['location_name'],
    createEventType: 'WMS.MasterData.LocationCreated.v1',
    allowedCreateColumns: ['zone_id', 'location_code', 'location_name', 'location_purpose', 'staging_for_work_center_ref', 'status'],
    allowedUpdateColumns: ['location_code', 'location_name', 'location_purpose', 'staging_for_work_center_ref', 'status'],
  },
  bins: {
    resource: 'bins',
    tableName: 'wms_storage_bin',
    idColumn: 'bin_id',
    codeColumn: 'bin_code',
    localizedColumns: ['bin_name'],
    createEventType: 'WMS.MasterData.StorageBinCreated.v1',
    allowedCreateColumns: ['location_id', 'bin_code', 'bin_name', 'capacity_qty', 'capacity_uom_id', 'status'],
    allowedUpdateColumns: ['bin_code', 'bin_name', 'capacity_qty', 'capacity_uom_id', 'status'],
  },
  'item-uom-mappings': {
    resource: 'item-uom-mappings',
    tableName: 'wms_item_uom_mapping',
    idColumn: 'mapping_id',
    localizedColumns: [],
    createEventType: 'WMS.MasterData.ItemUOMMappingCreated.v1',
    allowedCreateColumns: ['item_revision_id', 'storage_uom_code', 'conversion_factor', 'default_bin_capacity_qty'],
    allowedUpdateColumns: [],
  },
};

export const RESOURCE_BY_TABLE = new Map(Object.values(RESOURCE_DEFINITIONS).map((definition) => [definition.tableName, definition]));
