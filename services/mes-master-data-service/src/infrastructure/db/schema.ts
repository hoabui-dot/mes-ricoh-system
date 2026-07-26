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
  date,
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
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  timezone: varchar('timezone', { length: 80 }).notNull().default('Asia/Ho_Chi_Minh'),
  address: text('address'),
});

export const mdShopfloor = pgTable('md_shopfloor', {
  masterId: uuid('master_id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull(),
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  description: jsonb('description').$type<Record<string, string>>(),
  versionNo: integer('version_no').notNull().default(1),
  siteId: uuid('site_id').notNull(),
  lifecycleStatus: masterLifecycleStatus('lifecycle_status').notNull().default('Draft'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  rowVersion: integer('row_version').notNull().default(1),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
});

export const mdProductionArea = pgTable('md_production_area', {
  ...commonMasterColumns(),
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  siteId: uuid('site_id').notNull(),
  parentAreaId: uuid('parent_area_id'),
  areaType: varchar('area_type', { length: 50 }).notNull().default('Production'),
  description: jsonb('description').$type<Record<string, string>>(),
  sequenceNo: integer('sequence_no').notNull().default(0),
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
  crossesMidnight: boolean('crosses_midnight').notNull().default(false),
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
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  itemId: uuid('item_id').notNull(),
  revisionCode: varchar('revision_code', { length: 30 }).notNull(),
  siteId: uuid('site_id').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  itemGroup: varchar('item_group', { length: 80 }).notNull(),
  baseUomId: uuid('base_uom_id').notNull(),
  planningStrategy: varchar('planning_strategy', { length: 40 }).notNull(),
  procurementType: varchar('procurement_type', { length: 40 }).notNull(),
  trackingLevel: varchar('tracking_level', { length: 40 }).notNull(),
  defaultScrapRate: numeric('default_scrap_rate', { precision: 8, scale: 4 }).notNull(),
  specificationRef: varchar('specification_ref', { length: 255 }),
  changeReason: varchar('change_reason', { length: 500 }),
  releasedBy: uuid('released_by'),
  previousRevisionId: uuid('previous_revision_id'),
});

export const mdMbomHeader = pgTable('md_mbom_header', {
  ...commonMasterColumns(),
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  description: jsonb('description').$type<Record<string, string>>(),
  itemRevisionId: uuid('item_revision_id').notNull(),
  siteId: uuid('site_id').notNull(),
  businessVersion: varchar('business_version', { length: 30 }).notNull().default('1'),
  purpose: varchar('purpose', { length: 30 }).notNull().default('Standard'),
  baseQuantity: numeric('base_quantity', { precision: 18, scale: 6 }).notNull(),
  baseUomId: uuid('base_uom_id').notNull(),
  changeReason: jsonb('change_reason').$type<Record<string, string>>(),
  engineeringNote: jsonb('engineering_note').$type<Record<string, string>>(),
  referenceDocument: varchar('reference_document', { length: 500 }),
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
  description: jsonb('description').$type<Record<string, string>>(),
  operationType: varchar('operation_type', { length: 50 }).notNull(),
  confirmationMode: varchar('confirmation_mode', { length: 50 }).notNull(),
  quantityReporting: varchar('quantity_reporting', { length: 30 }).notNull().default('GoodOnly'),
  requiresMaterialScan: boolean('requires_material_scan').notNull().default(false),
  requiresOutputLabel: boolean('requires_output_label').notNull().default(false),
  allowPartialCompletion: boolean('allow_partial_completion').notNull().default(false),
  operatorInstructionSummary: jsonb('operator_instruction_summary').$type<Record<string, string>>(),
  qualityRequirementSummary: jsonb('quality_requirement_summary').$type<Record<string, string>>(),
  isSchedulable: boolean('is_schedulable').notNull().default(true),
});

export const mdRoutingHeader = pgTable('md_routing_header', {
  ...commonMasterColumns(),
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  description: jsonb('description').$type<Record<string, string>>(),
  businessVersion: varchar('business_version', { length: 30 }).notNull().default('1'),
  routingType: varchar('routing_type', { length: 30 }).notNull().default('Standard'),
  productionPurpose: jsonb('production_purpose').$type<Record<string, string>>(),
  changeReason: jsonb('change_reason').$type<Record<string, string>>(),
  engineeringNote: jsonb('engineering_note').$type<Record<string, string>>(),
  referenceDocument: varchar('reference_document', { length: 500 }),
});

export const mdRoutingOperation = pgTable('md_routing_operation', {
  ...commonMasterColumns(),
  routingHeaderId: uuid('routing_header_id').notNull(),
  operationId: uuid('operation_id').notNull(),
  workCenterId: uuid('work_center_id').notNull(),
  seq: integer('seq').notNull(),
  predecessorSeq: integer('predecessor_seq'),
  schedulingMode: varchar('scheduling_mode', { length: 30 }).notNull().default('Finite'),
  queueTimeMin: numeric('queue_time_min', { precision: 12, scale: 3 }).notNull().default('0'),
  moveTimeMin: numeric('move_time_min', { precision: 12, scale: 3 }).notNull().default('0'),
  overlapAllowed: boolean('overlap_allowed').notNull().default(false),
  transferBatchQty: numeric('transfer_batch_qty', { precision: 18, scale: 6 }),
  milestoneFlag: boolean('milestone_flag').notNull().default(false),
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
  siteId: uuid('site_id'),
  routingOperationId: uuid('routing_operation_id'),
  baseQuantity: numeric('base_quantity', { precision: 18, scale: 6 }).notNull().default('1'),
  standardYield: numeric('standard_yield', { precision: 8, scale: 4 }).notNull().default('1'),
  sourceMethod: varchar('source_method', { length: 30 }).notNull().default('Engineering'),
  sampleSize: integer('sample_size'),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validTo: timestamp('valid_to', { withTimezone: true }),
  reviewDueDate: timestamp('review_due_date', { withTimezone: true }),
});

export const mdWorkInstruction = pgTable('md_work_instruction', {
  ...commonMasterColumns(),
  operationId: uuid('operation_id').notNull(),
  instructionText: text('instruction_text').notNull(),
  documentUrl: text('document_url'),
});

export const mdWorkCenter = pgTable('md_work_center', {
  ...commonMasterColumns(),
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  siteId: uuid('site_id').notNull(),
  areaId: uuid('area_id').notNull(),
  shopfloorId: uuid('shopfloor_id'),
  workCenterType: varchar('work_center_type', { length: 50 }).notNull().default('Production'),
  activeFlag: boolean('active_flag').notNull().default(true),
  resourceType: varchar('resource_type', { length: 30 }).notNull().default('MachineGroup'),
  capacityModel: varchar('capacity_model', { length: 30 }).notNull().default('TimeBased'),
  finiteCapacityFlag: boolean('finite_capacity_flag').notNull().default(false),
  defaultShiftId: uuid('default_shift_id'),
  maxConcurrentJobs: integer('max_concurrent_jobs').notNull().default(1),
});

export const mdWorkstation = pgTable('md_workstation', {
  ...commonMasterColumns(),
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  siteId: uuid('site_id').notNull(),
  workCenterId: uuid('work_center_id'),
  shopfloorId: uuid('shopfloor_id'),
  workstationType: varchar('workstation_type', { length: 50 }).notNull().default('Kiosk'),
  activeFlag: boolean('active_flag').notNull().default(true),
  areaId: uuid('area_id'),
  description: jsonb('description').$type<Record<string, string>>(),
  executionMode: varchar('execution_mode', { length: 30 }).notNull().default('Kiosk'),
  maxConcurrentJobs: integer('max_concurrent_jobs').notNull().default(1),
  defaultTerminalId: uuid('default_terminal_id'),
  machineRequirementFlag: boolean('machine_requirement_flag').notNull().default(true),
});

export const mdEquipment = pgTable('md_equipment', {
  ...commonMasterColumns(),
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  siteId: uuid('site_id').notNull(),
  workCenterId: uuid('work_center_id'),
  equipmentType: varchar('equipment_type', { length: 80 }).notNull(),
  activeFlag: boolean('active_flag').notNull().default(true),
  description: jsonb('description').$type<Record<string, string>>(),
  manufacturer: varchar('manufacturer', { length: 100 }),
  model: varchar('model', { length: 100 }),
  serialNumber: varchar('serial_number', { length: 100 }),
  planningResourceFlag: boolean('planning_resource_flag').notNull().default(false),
  executionStatus: varchar('execution_status', { length: 30 }).notNull().default('Available'),
  defaultEfficiency: numeric('default_efficiency', { precision: 7, scale: 4 }).notNull().default('1'),
  quantity: integer('quantity').notNull().default(1),
});

export const mdMachineUnit = pgTable('md_machine_unit', {
  machineUnitId: uuid('machine_unit_id').defaultRandom().primaryKey(),
  machineId: uuid('machine_id').notNull(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  unitSequence: integer('unit_sequence').notNull(),
  serialNumber: varchar('serial_number', { length: 100 }),
  executionStatus: varchar('execution_status', { length: 30 }).notNull().default('Available'),
  activeFlag: boolean('active_flag').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mdWorkstationMachineGroup = pgTable('md_workstation_machine_group', {
  ...commonMasterColumns(),
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  description: jsonb('description').$type<Record<string, string>>(),
  siteId: uuid('site_id').notNull(),
  shopfloorId: uuid('shopfloor_id').notNull(),
  workCenterId: uuid('work_center_id').notNull(),
  workstationId: uuid('workstation_id').notNull(),
  groupType: varchar('group_type', { length: 50 }),
  minimumRequiredMachines: integer('minimum_required_machines').notNull().default(1),
  maximumConcurrentJobs: integer('maximum_concurrent_jobs').notNull().default(1),
});

export const mdWorkstationMachineRequirement = pgTable('md_workstation_machine_requirement', {
  requirementId: uuid('requirement_id').defaultRandom().primaryKey(),
  machineGroupId: uuid('machine_group_id').notNull(), machineId: uuid('machine_id').notNull(),
  role: varchar('role', { length: 20 }).notNull(), requiredQuantity: integer('required_quantity').notNull().default(1),
  requirementType: varchar('requirement_type', { length: 20 }).notNull().default('Required'),
  pinnedMachineUnitIds: jsonb('pinned_machine_unit_ids').$type<string[]>().notNull().default([]), sequenceNo: integer('sequence_no').notNull().default(1),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(), effectiveTo: timestamp('effective_to', { withTimezone: true }), activeFlag: boolean('active_flag').notNull().default(true),
  createdBy: uuid('created_by').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedBy: uuid('updated_by'), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), endedBy: uuid('ended_by'), endedAt: timestamp('ended_at', { withTimezone: true }),
});

export const mdWorkstationOperationCapability = pgTable('md_workstation_operation_capability', {
  capabilityId: uuid('capability_id').defaultRandom().primaryKey(), workstationId: uuid('workstation_id').notNull(), operationId: uuid('operation_id').notNull(), cycleTimeSec: numeric('cycle_time_sec', { precision: 12, scale: 3 }).notNull(), setupTimeMin: numeric('setup_time_min', { precision: 12, scale: 3 }).notNull().default('0'), baseQuantity: numeric('base_quantity', { precision: 18, scale: 6 }).notNull().default('1'), efficiencyFactor: numeric('efficiency_factor', { precision: 7, scale: 4 }).notNull().default('1'), schedulingMode: varchar('scheduling_mode', { length: 30 }).notNull().default('Finite'), effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(), effectiveTo: timestamp('effective_to', { withTimezone: true }), activeFlag: boolean('active_flag').notNull().default(true), createdBy: uuid('created_by').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedBy: uuid('updated_by'), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mdResourceAssignment = pgTable('md_resource_assignment', {
  ...commonMasterColumns(),
  name: jsonb('name').$type<Record<string, string>>().notNull(),
  workCenterId: uuid('work_center_id').notNull(),
  workstationId: uuid('workstation_id'),
  equipmentId: uuid('equipment_id'),
  assignmentType: varchar('assignment_type', { length: 50 }).notNull(),
  siteId: uuid('site_id').notNull(),
  assignmentRole: varchar('assignment_role', { length: 20 }).notNull().default('Primary'),
  schedulingFlag: boolean('scheduling_flag').notNull().default(false),
  oeeAggregationFlag: boolean('oee_aggregation_flag').notNull().default(false),
  machineGroupId: uuid('machine_group_id'),
  machineUnitId: uuid('machine_unit_id'),
  requirementType: varchar('requirement_type', { length: 20 }).notNull().default('Required'),
  sequenceNo: integer('sequence_no').notNull().default(1),
});

export const mdResourceCapability = pgTable('md_resource_capability', {
  ...commonMasterColumns(),
  operationId: uuid('operation_id').notNull(),
  workCenterId: uuid('work_center_id').notNull(),
  equipmentId: uuid('equipment_id'),
  capabilityType: varchar('capability_type', { length: 50 }).notNull().default('Eligible'),
  cycleTimeSec: numeric('cycle_time_sec', { precision: 12, scale: 3 }).notNull().default('0'),
  activeFlag: boolean('active_flag').notNull().default(true),
  siteId: uuid('site_id'),
  productRevisionId: uuid('product_revision_id'),
  itemGroup: varchar('item_group', { length: 80 }),
  eligibility: boolean('eligibility').notNull().default(true),
  priorityNo: integer('priority_no').notNull().default(1),
  speedFactor: numeric('speed_factor', { precision: 7, scale: 4 }).notNull().default('1'),
  minLotSize: numeric('min_lot_size', { precision: 18, scale: 6 }),
  maxLotSize: numeric('max_lot_size', { precision: 18, scale: 6 }),
  setupFamily: varchar('setup_family', { length: 50 }),
});

export const mdResourceCalendar = pgTable('md_resource_calendar', {
  ...commonMasterColumns(),
  workCenterId: uuid('work_center_id').notNull(),
  equipmentId: uuid('equipment_id'),
  availableFrom: timestamp('available_from', { withTimezone: true }).notNull(),
  availableTo: timestamp('available_to', { withTimezone: true }).notNull(),
  capacityPercent: numeric('capacity_percent', { precision: 8, scale: 4 }).notNull().default('1'),
  siteId: uuid('site_id'),
  resourceType: varchar('resource_type', { length: 20 }),
  resourceId: uuid('resource_id'),
  workstationId: uuid('workstation_id'),
  calendarDate: date('calendar_date'),
  shiftId: uuid('shift_id'),
  availabilityStatus: varchar('availability_status', { length: 20 }).notNull().default('Available'),
  availableMinutes: integer('available_minutes').notNull().default(0),
  capacityFactor: numeric('capacity_factor', { precision: 7, scale: 4 }).notNull().default('1'),
  reasonId: uuid('reason_id'),
  note: jsonb('note').$type<Record<string, string>>(),
});

export const mdSkill = pgTable('md_skill', {
  ...commonMasterColumns(),
  skillGroup: varchar('skill_group', { length: 80 }).notNull(),
  description: jsonb('description').$type<Record<string, string>>(),
  minimumLevel: varchar('minimum_level', { length: 10 }).notNull(),
  skillGroupId: uuid('skill_group_id'),
  scope: varchar('scope', { length: 20 }).notNull().default('Employee'),
  legacyFlag: boolean('legacy_flag').notNull().default(false),
});

export const mdSkillGroup = pgTable('md_skill_group', {
  skillGroupId: uuid('skill_group_id').defaultRandom().primaryKey(), code: varchar('code', { length: 80 }).notNull().unique(), name: jsonb('name').$type<Record<string, string>>().notNull(), description: jsonb('description').$type<Record<string, string>>(), scope: varchar('scope', { length: 20 }).notNull().default('Employee'), legacyFlag: boolean('legacy_flag').notNull().default(false), lifecycleStatus: varchar('lifecycle_status', { length: 20 }).notNull().default('Draft'), createdBy: uuid('created_by').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedBy: uuid('updated_by'), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mdWorkCenterComposition = pgTable('md_work_center_composition', {
  compositionId: uuid('composition_id').defaultRandom().primaryKey(), workCenterId: uuid('work_center_id').notNull(), workstationId: uuid('workstation_id').notNull(), operationId: uuid('operation_id').notNull(), effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(), effectiveTo: timestamp('effective_to', { withTimezone: true }), activeFlag: boolean('active_flag').notNull().default(true), createdBy: uuid('created_by').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedBy: uuid('updated_by'), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), endedBy: uuid('ended_by'), endedAt: timestamp('ended_at', { withTimezone: true }),
});

export const mdEmployee = pgTable('md_employee', {
  ...commonMasterColumns(),
  siteId: uuid('site_id').notNull(),
  defaultWorkCenterId: uuid('default_work_center_id'),
  employeeStatus: varchar('employee_status', { length: 20 }).notNull().default('Active'),
  hiredDate: date('hired_date'),
});

export const mdEmployeeSkill = pgTable('md_employee_skill', {
  employeeId: uuid('employee_id').notNull(),
  skillId: uuid('skill_id').notNull(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  activeFlag: boolean('active_flag').notNull().default(true),
  level: varchar('level', { length: 10 }).notNull(),
  qualificationStatus: varchar('qualification_status', { length: 20 }).notNull().default('Active'),
  certificateCode: varchar('certificate_code', { length: 100 }),
  certifiedAt: timestamp('certified_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  endedBy: uuid('ended_by'),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  rowVersion: integer('row_version').notNull().default(1),
});

export const mdEmployeeShiftSchedule = pgTable('md_employee_shift_schedule', {
  scheduleId: uuid('schedule_id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id').notNull(),
  shiftId: uuid('shift_id').notNull(),
  workCenterId: uuid('work_center_id'),
  scheduleDate: date('schedule_date').notNull(),
  scheduleStatus: varchar('schedule_status', { length: 20 }).notNull().default('Scheduled'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  rowVersion: integer('row_version').notNull().default(1),
});

export const mdOperationSkillRequirement = pgTable('md_operation_skill_requirement', {
  ...commonMasterColumns(),
  operationId: uuid('operation_id').notNull(),
  skillId: uuid('skill_id').notNull(),
  minimumLevel: varchar('minimum_level', { length: 10 }).notNull(),
  siteId: uuid('site_id'),
  routingOperationId: uuid('routing_operation_id'),
  requiredPersons: integer('required_persons').notNull().default(1),
  mandatoryFlag: boolean('mandatory_flag').notNull().default(true),
  activeFlag: boolean('active_flag').notNull().default(true),
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
