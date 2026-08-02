type Translator = (key: string, params?: Record<string, string | number>) => string;

const workOrderErrorKeys: Record<string, string> = {
  WO_ROUTING_SNAPSHOT_MISSING: 'workOrders.errors.routingSnapshotMissing',
  WO_ROUTING_SNAPSHOT_UNAVAILABLE: 'workOrders.errors.routingSnapshotUnavailable',
  PRODUCTION_VERSION_REQUIRED: 'workOrders.errors.productionVersionRequired',
  WO_RESOURCE_ALLOCATION_INVALID: 'workOrders.errors.resourceAllocationInvalid',
  WO_NOT_FOUND: 'workOrders.errors.notFound',
  WO_EXECUTION_STATUS_INVALID: 'workOrders.errors.executionStatusInvalid',
  WO_OPERATION_EXECUTION_TARGET_UNRESOLVED: 'workOrders.errors.executionTargetUnresolved',
  WO_ALLOCATION_VERSION_CONFLICT: 'workOrders.errors.allocationVersionConflict',
  WO_OPERATION_ALLOCATION_MISSING: 'workOrders.errors.operationAllocationMissing',
  SHIFT_REQUIRED: 'workOrders.errors.shiftRequired',
  WO_PLANNING_SNAPSHOT_INCOMPLETE: 'workOrders.errors.planningSnapshotIncomplete',
  WO_PLANNING_SNAPSHOT_INVALID: 'workOrders.errors.planningSnapshotInvalid',
  SQL_SCAN_FAILED: 'workOrders.errors.sqlScanFailed',
  WO_CALENDAR_QUERY_FAILED: 'workOrders.errors.calendarQueryFailed',
  WO_WORKER_READINESS_QUERY_FAILED: 'workOrders.errors.workerReadinessQueryFailed',
  WORKER_CAPACITY_INSUFFICIENT: 'workOrders.errors.workerCapacityInsufficient',
  NO_EFFECTIVE_CAPABILITY: 'workOrders.errors.noEffectiveCapability',
  CALENDAR_NOT_CONFIGURED: 'workOrders.errors.calendarNotConfigured',
  NO_EFFECTIVE_PRODUCTION_STANDARD: 'workOrders.errors.noEffectiveProductionStandard',
  PRODUCTION_VERSION_NOT_FOUND: 'workOrders.errors.productionVersionNotFound',
  WORK_ORDER_MASTER_DATA_INCOMPLETE: 'workOrders.errors.masterDataIncomplete',
  WORK_ORDER_MASTER_DATA_QUERY_FAILED: 'workOrders.errors.masterDataQueryFailed',
  ROUTING_SITE_CONTEXT_INVALID: 'workOrders.errors.routingSiteContextInvalid',
  ROUTING_SITE_CONTEXT_AMBIGUOUS: 'workOrders.errors.routingSiteContextAmbiguous',
  PRODUCTION_VERSION_SITE_CONTEXT_INVALID: 'workOrders.errors.productionVersionSiteContextInvalid',
  RESOURCE_CAPACITY_CONFLICT: 'workOrders.errors.resourceCapacityConflict',
  RESOURCE_CANDIDATE_STALE: 'workOrders.errors.resourceCandidateStale',
  RESOURCE_ALLOCATION_FORBIDDEN: 'workOrders.errors.resourceAllocationForbidden',
  READINESS_REQUEST_INVALID: 'workOrders.errors.readinessRequestInvalid',
  ROUTING_OPERATION_NOT_FOUND: 'workOrders.errors.routingOperationNotFound',
  ROUTING_CONTEXT_INVALID: 'workOrders.errors.routingContextInvalid',
  SHIFT_SITE_INVALID: 'workOrders.errors.shiftSiteInvalid',
  CAPABILITY_EXPLICIT_DENY: 'workOrders.errors.capabilityExplicitDeny',
  INSUFFICIENT_CAPACITY: 'workOrders.errors.insufficientCapacity',
  CALENDAR_UNAVAILABLE: 'workOrders.errors.calendarUnavailable',
  CALENDAR_HOLIDAY: 'workOrders.errors.calendarHoliday',
  RESOURCE_PLANNED_DOWN: 'workOrders.errors.resourcePlannedDown',
  WORKSTATION_INACTIVE: 'workOrders.errors.workstationInactive',
  EQUIPMENT_NOT_AVAILABLE: 'workOrders.errors.equipmentNotAvailable',
  EQUIPMENT_OUT_OF_SERVICE: 'workOrders.errors.equipmentOutOfService',
  EQUIPMENT_INACTIVE: 'workOrders.errors.equipmentInactive',
  EQUIPMENT_ASSIGNMENT_INVALID: 'workOrders.errors.equipmentAssignmentInvalid',
  EQUIPMENT_MACHINE_UNIT_UNAVAILABLE: 'workOrders.errors.equipmentMachineUnitUnavailable',
  EQUIPMENT_CAPACITY_CONFLICT: 'workOrders.errors.equipmentCapacityConflict',
  EQUIPMENT_MAINTENANCE_STATE_UNKNOWN: 'workOrders.errors.equipmentMaintenanceUnknown',
  EQUIPMENT_CALIBRATION_STATE_UNKNOWN: 'workOrders.errors.equipmentCalibrationUnknown',
  EQUIPMENT_STATE_STALE: 'workOrders.errors.equipmentStateStale',
  EQUIPMENT_READINESS_UNKNOWN: 'workOrders.errors.equipmentReadinessUnknown',
  MACHINE_GROUP_NO_PRIMARY: 'workOrders.errors.machineGroupNoPrimary',
  MACHINE_GROUP_INSUFFICIENT_ACTIVE_MEMBERS: 'workOrders.errors.machineGroupInsufficientMembers',
  PRIMARY_MACHINE_UNAVAILABLE: 'workOrders.errors.primaryMachineUnavailable',
  REQUIRED_SUPPORTING_MACHINE_UNAVAILABLE: 'workOrders.errors.requiredSupportingMachineUnavailable',
  WORKSTATION_MACHINE_REQUIREMENT_UNSATISFIED: 'resourceFoundation.machineRequirementUnsatisfied',
  WORKSTATION_PRIMARY_MACHINE_MISSING: 'resourceFoundation.primaryMachineMissing',
  WORKSTATION_SUPPORTING_MACHINE_MISSING: 'resourceFoundation.supportingMachineMissing',
  WORKSTATION_MACHINE_QUANTITY_INSUFFICIENT: 'resourceFoundation.machineQuantityInsufficient',
  RESOURCE_ASSIGNMENT_WORKSTATION_MISMATCH: 'resourceFoundation.resourceAssignmentWorkstationMismatch',
  RESOURCE_ASSIGNMENT_EQUIPMENT_INVALID: 'resourceFoundation.resourceAssignmentEquipmentInvalid',
  RESOURCE_ASSIGNMENT_MACHINE_UNIT_INVALID: 'resourceFoundation.resourceAssignmentMachineUnitInvalid',
  MACHINE_UNIT_UNAVAILABLE: 'resourceFoundation.machineUnitUnavailable',
  MACHINE_UNIT_ALREADY_RESERVED: 'resourceFoundation.machineUnitAlreadyReserved',
  PRINT_STATION_RUNTIME_NOT_AVAILABLE: 'printStation.runtimeUnavailable',
  PRINT_STATION_RUNTIME_NOT_READY: 'printStation.runtimeNotReady',
  WO_LINE_SELECTION_REQUIRED: 'workOrders.errors.lineSelectionRequired',
  WO_LINE_RESOURCE_HOLD: 'workOrders.errors.lineResourceHold',
  WO_LINE_NOT_READY: 'workOrders.errors.lineNotReady',
  WO_LINE_MIXED_ALLOCATION_REJECTED: 'workOrders.errors.mixedLineRejected',
  WO_LINE_REPLAN_VERSION_CONFLICT: 'workOrders.errors.lineReplanVersionConflict',
  WO_LINE_REPLAN_AFTER_START_REQUIRES_EXECUTION_SEGMENT: 'workOrders.errors.lineTransferRequiresExecutionSegment',
  NO_RELEASED_EFFECTIVE_LINE_ELIGIBILITY: 'workOrders.errors.noReleasedEffectiveLineEligibility',
  NO_COMPLETE_FEASIBLE_LINE: 'workOrders.errors.noCompleteFeasibleLine',
  LINE_MISSING_WORK_CENTER: 'workOrders.errors.lineMissingWorkCenter',
  LINE_OPERATION_CAPABILITY_MISSING: 'workOrders.errors.lineOperationCapabilityMissing',
  LINE_PRODUCTION_STANDARD_MISSING: 'workOrders.errors.lineProductionStandardMissing',
  LINE_RESOURCE_CALENDAR_MISSING: 'workOrders.errors.lineResourceCalendarMissing',
  LINE_RESOURCE_CAPACITY_CONFLICT: 'workOrders.errors.lineResourceCapacityConflict',
};

export function translateWorkOrderError(raw: unknown, t: Translator): string {
  const value = String(raw || '').trim();
  if (!value) return t('common.unknownError');
  const code = value.split(':', 1)[0];
  if (code === 'WORK_ORDER_PRODUCTION_VERSION_CONTEXT_MISMATCH') {
    const field = value.split(':')[1] || 'configuration';
    return t('workOrders.errors.productionVersionContextMismatch', { field });
  }
  const key = workOrderErrorKeys[code];
  if (key) return t(key);
  if (/cannot scan NULL into \*string|no Production Version found for Item/i.test(value)) {
    return t('workOrders.errors.masterDataIncomplete');
  }
  return value;
}

export function translateMbomError(raw: unknown, t: Translator): string {
  const value = String(raw || '').trim();
  if (!value) return t('common.unknownError');
  const code = value.split(':', 1)[0];
  if (code.startsWith('MBOM_')) {
    const translated = t(`mbom.errors.${code}`);
    return translated === `mbom.errors.${code}` ? value : translated;
  }
  return value;
}
