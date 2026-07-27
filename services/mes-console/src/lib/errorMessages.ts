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
  PRODUCTION_VERSION_NOT_FOUND: 'workOrders.errors.productionVersionNotFound',
  WORK_ORDER_MASTER_DATA_INCOMPLETE: 'workOrders.errors.masterDataIncomplete',
  WORK_ORDER_MASTER_DATA_QUERY_FAILED: 'workOrders.errors.masterDataQueryFailed',
  ROUTING_SITE_CONTEXT_INVALID: 'workOrders.errors.routingSiteContextInvalid',
  ROUTING_SITE_CONTEXT_AMBIGUOUS: 'workOrders.errors.routingSiteContextAmbiguous',
  PRODUCTION_VERSION_SITE_CONTEXT_INVALID: 'workOrders.errors.productionVersionSiteContextInvalid',
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
