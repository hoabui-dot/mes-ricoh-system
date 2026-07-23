import { boolean, integer, jsonb, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { LocalizedText } from '@mom-platform/shared-kernel';

export const qmsDefectCode = pgTable('qms_defect_code', {
  defectCodeId: uuid('defect_code_id').primaryKey().defaultRandom(),
  defectCode: varchar('defect_code', { length: 40 }).notNull().unique(),
  defectName: jsonb('defect_name').$type<LocalizedText>().notNull(),
  defectCategory: varchar('defect_category', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('Active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const qmsInspectionPlan = pgTable('qms_inspection_plan', {
  planId: uuid('plan_id').primaryKey().defaultRandom(),
  planCode: varchar('plan_code', { length: 40 }).notNull().unique(),
  planName: jsonb('plan_name').$type<LocalizedText>().notNull(),
  planDescription: jsonb('plan_description').$type<LocalizedText | null>(),
  itemRevisionId: uuid('item_revision_id').notNull(),
  operationId: uuid('operation_id').notNull(),
  siteId: uuid('site_id').notNull(),
  planVersion: integer('plan_version').notNull().default(1),
  samplingMethod: varchar('sampling_method', { length: 20 }).notNull().default('Full'),
  sampleSize: numeric('sample_size', { precision: 18, scale: 3 }),
  status: varchar('status', { length: 20 }).notNull().default('Draft'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  rowVersion: integer('row_version').notNull().default(1),
}, (table) => ({ uqPlanScopeVersion: uniqueIndex('uq_qms_plan_scope_version').on(table.itemRevisionId, table.operationId, table.siteId, table.planVersion) }));

export const qmsInspectionCharacteristic = pgTable('qms_inspection_characteristic', {
  characteristicId: uuid('characteristic_id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => qmsInspectionPlan.planId),
  sequenceNo: integer('sequence_no').notNull(),
  characteristicCode: varchar('characteristic_code', { length: 40 }).notNull(),
  characteristicName: jsonb('characteristic_name').$type<LocalizedText>().notNull(),
  measurementType: varchar('measurement_type', { length: 20 }).notNull(),
  specMin: numeric('spec_min', { precision: 18, scale: 6 }),
  specMax: numeric('spec_max', { precision: 18, scale: 6 }),
  targetValue: numeric('target_value', { precision: 18, scale: 6 }),
  uomId: uuid('uom_id'),
  defaultDefectCodeId: uuid('default_defect_code_id').references(() => qmsDefectCode.defectCodeId),
  mandatoryFlag: boolean('mandatory_flag').notNull().default(true),
}, (table) => ({ uqPlanSequence: uniqueIndex('uq_qms_plan_characteristic_sequence').on(table.planId, table.sequenceNo), uqPlanCode: uniqueIndex('uq_qms_plan_characteristic_code').on(table.planId, table.characteristicCode) }));

export const qmsInspectionResult = pgTable('qms_inspection_result', {
  resultId: uuid('result_id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').references(() => qmsInspectionPlan.planId),
  workOrderId: uuid('work_order_id').notNull(),
  workCenterId: uuid('work_center_id'),
  itemRevisionId: uuid('item_revision_id').notNull(),
  lotOrLabelRef: varchar('lot_or_label_ref', { length: 120 }),
  inspectedQty: numeric('inspected_qty', { precision: 18, scale: 6 }).notNull(),
  passedQty: numeric('passed_qty', { precision: 18, scale: 6 }).notNull().default('0'),
  failedQty: numeric('failed_qty', { precision: 18, scale: 6 }).notNull().default('0'),
  overallResult: varchar('overall_result', { length: 20 }),
  inspectorUserId: uuid('inspector_user_id'),
  inspectedAt: timestamp('inspected_at', { withTimezone: true }),
  sourceEventId: uuid('source_event_id').notNull().unique(),
  missingPlanFlag: boolean('missing_plan_flag').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const qmsInspectionResultDetail = pgTable('qms_inspection_result_detail', {
  detailId: uuid('detail_id').primaryKey().defaultRandom(),
  resultId: uuid('result_id').notNull().references(() => qmsInspectionResult.resultId),
  characteristicId: uuid('characteristic_id').notNull().references(() => qmsInspectionCharacteristic.characteristicId),
  measuredValue: numeric('measured_value', { precision: 18, scale: 6 }),
  resultFlag: varchar('result_flag', { length: 10 }).notNull(),
  defectCodeId: uuid('defect_code_id').references(() => qmsDefectCode.defectCodeId),
  comment: varchar('comment', { length: 1000 }),
});

export const qmsRmItemRevision = pgTable('qms_rm_item_revision', { itemRevisionId: uuid('item_revision_id').primaryKey(), itemCode: varchar('item_code', { length: 50 }).notNull(), itemName: jsonb('item_name').$type<LocalizedText>().notNull(), lifecycleStatus: varchar('lifecycle_status', { length: 20 }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow() });
export const qmsRmOperation = pgTable('qms_rm_operation', { operationId: uuid('operation_id').primaryKey(), operationCode: varchar('operation_code', { length: 50 }).notNull(), operationName: jsonb('operation_name').$type<LocalizedText>().notNull(), operationType: varchar('operation_type', { length: 50 }).notNull(), siteId: uuid('site_id'), lifecycleStatus: varchar('lifecycle_status', { length: 20 }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow() });
export const qmsRmSite = pgTable('qms_rm_site', { siteId: uuid('site_id').primaryKey(), siteCode: varchar('site_code', { length: 30 }).notNull(), siteName: jsonb('site_name').$type<LocalizedText>().notNull(), lifecycleStatus: varchar('lifecycle_status', { length: 20 }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow() });
export const qmsRmUom = pgTable('qms_rm_uom', { uomId: uuid('uom_id').primaryKey(), uomCode: varchar('uom_code', { length: 20 }).notNull(), uomName: jsonb('uom_name').$type<LocalizedText>().notNull(), lifecycleStatus: varchar('lifecycle_status', { length: 20 }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow() });
