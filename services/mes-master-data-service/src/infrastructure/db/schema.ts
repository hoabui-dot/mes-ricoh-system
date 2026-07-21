import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const masterLifecycleStatus = pgEnum('master_lifecycle_status', [
  'Draft',
  'InReview',
  'Released',
  'Inactive',
  'Obsolete',
]);

export const commonMasterColumns = () => ({
  masterId: uuid('master_id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  versionNo: integer('version_no').notNull().default(1),
  lifecycleStatus: masterLifecycleStatus('lifecycle_status').notNull().default('Draft'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rowVersion: integer('row_version').notNull().default(1),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
});

export const mdSite = pgTable('md_site', {
  ...commonMasterColumns(),
  timezone: varchar('timezone', { length: 80 }).notNull().default('Asia/Ho_Chi_Minh'),
  address: text('address'),
});

export const mdProductionArea = pgTable('md_production_area', {
  ...commonMasterColumns(),
  siteId: uuid('site_id').notNull(),
  parentAreaId: uuid('parent_area_id'),
  areaType: varchar('area_type', { length: 50 }).notNull().default('Production'),
});

export const mdUom = pgTable('md_uom', {
  ...commonMasterColumns(),
  uomClass: varchar('uom_class', { length: 50 }).notNull(),
  decimalPrecision: integer('decimal_precision').notNull().default(6),
});

export const mdUomConversion = pgTable('md_uom_conversion', {
  ...commonMasterColumns(),
  fromUomId: uuid('from_uom_id').notNull(),
  toUomId: uuid('to_uom_id').notNull(),
  factor: numeric('factor', { precision: 18, scale: 8 }).notNull(),
});

export const mdShift = pgTable('md_shift', {
  ...commonMasterColumns(),
  siteId: uuid('site_id').notNull(),
  startTime: varchar('start_time', { length: 8 }).notNull(),
  endTime: varchar('end_time', { length: 8 }).notNull(),
});

export const mdReasonCode = pgTable('md_reason_code', {
  ...commonMasterColumns(),
  reasonType: varchar('reason_type', { length: 50 }).notNull(),
  requiresComment: boolean('requires_comment').notNull().default(false),
});

export const mdItem = pgTable('md_item', {
  ...commonMasterColumns(),
  itemGroup: varchar('item_group', { length: 80 }).notNull(),
  itemType: varchar('item_type', { length: 40 }).notNull(),
  baseUomId: uuid('base_uom_id').notNull(),
});

export const mdItemRevision = pgTable('md_item_revision', {
  ...commonMasterColumns(),
  itemId: uuid('item_id').notNull(),
  revisionCode: varchar('revision_code', { length: 30 }).notNull(),
  siteId: uuid('site_id').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
});

export const mdMbomHeader = pgTable('md_mbom_header', {
  ...commonMasterColumns(),
  itemRevisionId: uuid('item_revision_id').notNull(),
  siteId: uuid('site_id').notNull(),
  baseQuantity: numeric('base_quantity', { precision: 18, scale: 6 }).notNull(),
  baseUomId: uuid('base_uom_id').notNull(),
});

export const mdMbomLine = pgTable('md_mbom_line', {
  ...commonMasterColumns(),
  mbomHeaderId: uuid('mbom_header_id').notNull(),
  parentLineId: uuid('parent_line_id'),
  seq: integer('seq').notNull(),
  componentRevisionId: uuid('component_revision_id').notNull(),
  quantityPer: numeric('quantity_per', { precision: 18, scale: 6 }).notNull(),
  uomId: uuid('uom_id').notNull(),
  scrapRate: numeric('scrap_rate', { precision: 8, scale: 4 }).notNull().default('0'),
  issueOperationId: uuid('issue_operation_id'),
  backflushFlag: boolean('backflush_flag').notNull().default(false),
  phantomFlag: boolean('phantom_flag').notNull().default(false),
});

export const mdComponentSubstitute = pgTable('md_component_substitute', {
  ...commonMasterColumns(),
  mbomLineId: uuid('mbom_line_id').notNull(),
  substituteRevisionId: uuid('substitute_revision_id').notNull(),
  priority: integer('priority').notNull().default(1),
});

export const mdProductionVersion = pgTable('md_production_version', {
  ...commonMasterColumns(),
  itemRevisionId: uuid('item_revision_id').notNull(),
  mbomHeaderId: uuid('mbom_header_id').notNull(),
  routingHeaderId: uuid('routing_header_id').notNull(),
  siteId: uuid('site_id').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
});

export const mdOperation = pgTable('md_operation', {
  ...commonMasterColumns(),
  operationType: varchar('operation_type', { length: 50 }).notNull(),
  confirmationMode: varchar('confirmation_mode', { length: 50 }).notNull(),
  requiresMaterialScan: boolean('requires_material_scan').notNull().default(false),
  requiresOutputLabel: boolean('requires_output_label').notNull().default(false),
  isSchedulable: boolean('is_schedulable').notNull().default(true),
});

export const mdRoutingHeader = pgTable('md_routing_header', {
  ...commonMasterColumns(),
  itemRevisionId: uuid('item_revision_id').notNull(),
  siteId: uuid('site_id').notNull(),
});

export const mdRoutingOperation = pgTable('md_routing_operation', {
  ...commonMasterColumns(),
  routingHeaderId: uuid('routing_header_id').notNull(),
  operationId: uuid('operation_id').notNull(),
  workCenterId: uuid('work_center_id').notNull(),
  seq: integer('seq').notNull(),
  predecessorSeq: integer('predecessor_seq'),
});

export const mdProductionStandard = pgTable('md_production_standard', {
  ...commonMasterColumns(),
  itemRevisionId: uuid('item_revision_id').notNull(),
  operationId: uuid('operation_id').notNull(),
  workCenterId: uuid('work_center_id').notNull(),
  equipmentId: uuid('equipment_id'),
  laborCount: integer('labor_count').notNull().default(1),
  skillId: uuid('skill_id'),
  minimumLevel: varchar('minimum_level', { length: 10 }),
  setupTimeMin: numeric('setup_time_min', { precision: 12, scale: 3 }),
  cycleTimeSec: numeric('cycle_time_sec', { precision: 12, scale: 3 }),
  efficiencyFactor: numeric('efficiency_factor', { precision: 8, scale: 4 }).notNull().default('1'),
});

export const mdWorkInstruction = pgTable('md_work_instruction', {
  ...commonMasterColumns(),
  operationId: uuid('operation_id').notNull(),
  instructionText: text('instruction_text').notNull(),
  documentUrl: text('document_url'),
});

export const mdWorkCenter = pgTable('md_work_center', {
  ...commonMasterColumns(),
  siteId: uuid('site_id').notNull(),
  areaId: uuid('area_id').notNull(),
  workCenterType: varchar('work_center_type', { length: 50 }).notNull().default('Production'),
  activeFlag: boolean('active_flag').notNull().default(true),
});

export const mdWorkstation = pgTable('md_workstation', {
  ...commonMasterColumns(),
  siteId: uuid('site_id').notNull(),
  workCenterId: uuid('work_center_id').notNull(),
  workstationType: varchar('workstation_type', { length: 50 }).notNull().default('Kiosk'),
  activeFlag: boolean('active_flag').notNull().default(true),
});

export const mdEquipment = pgTable('md_equipment', {
  ...commonMasterColumns(),
  siteId: uuid('site_id').notNull(),
  workCenterId: uuid('work_center_id').notNull(),
  equipmentType: varchar('equipment_type', { length: 80 }).notNull(),
  activeFlag: boolean('active_flag').notNull().default(true),
});

export const mdResourceAssignment = pgTable('md_resource_assignment', {
  ...commonMasterColumns(),
  workCenterId: uuid('work_center_id').notNull(),
  workstationId: uuid('workstation_id'),
  equipmentId: uuid('equipment_id'),
  assignmentType: varchar('assignment_type', { length: 50 }).notNull(),
});

export const mdResourceCapability = pgTable('md_resource_capability', {
  ...commonMasterColumns(),
  operationId: uuid('operation_id').notNull(),
  workCenterId: uuid('work_center_id').notNull(),
  equipmentId: uuid('equipment_id'),
  capabilityType: varchar('capability_type', { length: 50 }).notNull().default('Eligible'),
  activeFlag: boolean('active_flag').notNull().default(true),
});

export const mdResourceCalendar = pgTable('md_resource_calendar', {
  ...commonMasterColumns(),
  workCenterId: uuid('work_center_id').notNull(),
  equipmentId: uuid('equipment_id'),
  availableFrom: timestamp('available_from', { withTimezone: true }).notNull(),
  availableTo: timestamp('available_to', { withTimezone: true }).notNull(),
  capacityPercent: numeric('capacity_percent', { precision: 8, scale: 4 }).notNull().default('1'),
});

export const mdSkill = pgTable('md_skill', {
  ...commonMasterColumns(),
  skillGroup: varchar('skill_group', { length: 80 }).notNull(),
  minimumLevel: varchar('minimum_level', { length: 10 }).notNull(),
});

export const mdOperationSkillRequirement = pgTable('md_operation_skill_requirement', {
  ...commonMasterColumns(),
  operationId: uuid('operation_id').notNull(),
  skillId: uuid('skill_id').notNull(),
  minimumLevel: varchar('minimum_level', { length: 10 }).notNull(),
});

export const mdRolePermission = pgTable('md_role_permission', {
  ...commonMasterColumns(),
  roleCode: varchar('role_code', { length: 80 }).notNull(),
  permissionCode: varchar('permission_code', { length: 120 }).notNull(),
  resourceType: varchar('resource_type', { length: 80 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(),
});

export const mdUserResourceScope = pgTable('md_user_resource_scope', {
  ...commonMasterColumns(),
  userId: uuid('user_id').notNull(),
  roleCode: varchar('role_code', { length: 80 }).notNull(),
  scopeType: varchar('scope_type', { length: 80 }).notNull(),
  scopeResourceId: uuid('scope_resource_id').notNull(),
  conditionExpression: text('condition_expression'),
});

export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey(),
  eventType: text('event_type').notNull(),
  topic: text('topic').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  retryCount: integer('retry_count').notNull().default(0),
  errorMessage: text('error_message'),
});

export const schemaMigrations = pgTable('schema_migrations', {
  name: text('name').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

export const uniqueCodeVersionIndexes = [
  uniqueIndex('uq_md_site_code_version').on(mdSite.code, mdSite.versionNo),
  uniqueIndex('uq_md_item_code_version').on(mdItem.code, mdItem.versionNo),
];
