import { integer, jsonb, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { LocalizedText } from '@mom-platform/shared-kernel';

const auditColumns = {
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  rowVersion: integer('row_version').notNull().default(1),
};

export const wmsWarehouse = pgTable('wms_warehouse', {
  warehouseId: uuid('warehouse_id').primaryKey().defaultRandom(),
  warehouseCode: varchar('warehouse_code', { length: 30 }).notNull().unique(),
  warehouseName: jsonb('warehouse_name').$type<LocalizedText>().notNull(),
  warehouseDescription: jsonb('warehouse_description').$type<LocalizedText | null>(),
  siteId: uuid('site_id').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('Active'),
  ...auditColumns,
});

export const wmsZone = pgTable('wms_zone', {
  zoneId: uuid('zone_id').primaryKey().defaultRandom(),
  warehouseId: uuid('warehouse_id').notNull().references(() => wmsWarehouse.warehouseId),
  zoneCode: varchar('zone_code', { length: 30 }).notNull(),
  zoneName: jsonb('zone_name').$type<LocalizedText>().notNull(),
  zoneType: varchar('zone_type', { length: 30 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('Active'),
  ...auditColumns,
}, (table) => ({
  uqWarehouseZone: uniqueIndex('uq_wms_zone_warehouse_code').on(table.warehouseId, table.zoneCode),
}));

export const wmsStorageLocation = pgTable('wms_storage_location', {
  locationId: uuid('location_id').primaryKey().defaultRandom(),
  zoneId: uuid('zone_id').notNull().references(() => wmsZone.zoneId),
  locationCode: varchar('location_code', { length: 30 }).notNull(),
  locationName: jsonb('location_name').$type<LocalizedText>().notNull(),
  locationPurpose: varchar('location_purpose', { length: 30 }).notNull().default('Storage'),
  stagingForWorkCenterRef: uuid('staging_for_work_center_ref'),
  status: varchar('status', { length: 20 }).notNull().default('Active'),
  ...auditColumns,
}, (table) => ({
  uqZoneLocation: uniqueIndex('uq_wms_location_zone_code').on(table.zoneId, table.locationCode),
  uqStagingWorkCenter: uniqueIndex('uq_location_staging_work_center').on(table.stagingForWorkCenterRef),
}));

export const wmsStorageBin = pgTable('wms_storage_bin', {
  binId: uuid('bin_id').primaryKey().defaultRandom(),
  locationId: uuid('location_id').notNull().references(() => wmsStorageLocation.locationId),
  binCode: varchar('bin_code', { length: 30 }).notNull(),
  binName: jsonb('bin_name').$type<LocalizedText | null>(),
  capacityQty: numeric('capacity_qty', { precision: 18, scale: 3 }),
  capacityUomId: uuid('capacity_uom_id'),
  status: varchar('status', { length: 20 }).notNull().default('Active'),
  ...auditColumns,
}, (table) => ({
  uqLocationBin: uniqueIndex('uq_wms_bin_location_code').on(table.locationId, table.binCode),
}));

export const rmItemRevision = pgTable('rm_item_revision', {
  itemRevisionId: uuid('item_revision_id').primaryKey(),
  itemCode: varchar('item_code', { length: 50 }).notNull(),
  itemName: jsonb('item_name').$type<LocalizedText>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wmsItemUomMapping = pgTable('wms_item_uom_mapping', {
  mappingId: uuid('mapping_id').primaryKey().defaultRandom(),
  itemRevisionId: uuid('item_revision_id').notNull(),
  storageUomCode: varchar('storage_uom_code', { length: 20 }).notNull(),
  conversionFactor: numeric('conversion_factor', { precision: 18, scale: 6 }).notNull(),
  defaultBinCapacityQty: numeric('default_bin_capacity_qty', { precision: 18, scale: 3 }),
  ...auditColumns,
}, (table) => ({
  uqItemStorageUom: uniqueIndex('uq_wms_mapping_item_uom').on(table.itemRevisionId, table.storageUomCode),
}));
