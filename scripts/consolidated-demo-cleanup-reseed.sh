#!/usr/bin/env bash
set -euo pipefail

# Demo-only maintenance. Each SQL block is executed against the database owned by
# that service; this script never joins service databases or changes master data.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT_DIR/infra/docker-compose.yml")

if [[ "${APPLY:-0}" != "1" ]]; then
  echo "DRY RUN: set APPLY=1, APP_ENV=development, and CONFIRM_DEMO_CLEANUP=YES to apply cleanup."
  exit 0
fi
[[ "${APP_ENV:-}" == "development" || "${APP_ENV:-}" == "demo" ]] || { echo "Refusing cleanup outside APP_ENV=development|demo" >&2; exit 2; }
[[ "${CONFIRM_DEMO_CLEANUP:-}" == "YES" ]] || { echo "Refusing cleanup without CONFIRM_DEMO_CLEANUP=YES" >&2; exit 2; }

mes_exec() { "${COMPOSE[@]}" exec -T mes-execution-db psql -v ON_ERROR_STOP=1 -U mes_execution_user -d mes_execution_db -c "$1"; }
wms_outbound() { "${COMPOSE[@]}" exec -T wms-outbound-db psql -v ON_ERROR_STOP=1 -U wms_outbound_owner -d wms_outbound_db -c "$1"; }
wms_inventory() { "${COMPOSE[@]}" exec -T wms-inventory-db psql -v ON_ERROR_STOP=1 -U wms_inventory_owner -d wms_inventory_db -c "$1"; }
wms_inbound() { "${COMPOSE[@]}" exec -T wms-inbound-db psql -v ON_ERROR_STOP=1 -U wms_inbound_owner -d wms_inbound_db -c "$1"; }
qms_inspection() { "${COMPOSE[@]}" exec -T qms-inspection-db psql -v ON_ERROR_STOP=1 -U qms_inspection_owner -d qms_inspection_db -c "$1"; }
qms_ncr() { "${COMPOSE[@]}" exec -T qms-nonconformance-db psql -v ON_ERROR_STOP=1 -U qms_nonconformance_owner -d qms_nonconformance_db -c "$1"; }

echo "[1/5] MES execution transaction cleanup"
  mes_exec "TRUNCATE wo_operation_labor_assignment, wo_creation_workflow_event, wo_creation_workflow, material_consumption, operation_confirmation, execution_session, wo_approval_log, wo_material_requirement, wo_operation, wo_header, outbox_events, wo_numbering_daily RESTART IDENTITY CASCADE;"

echo "[2/5] WMS outbound and inventory transaction cleanup"
wms_outbound "TRUNCATE material_request, outbox_events RESTART IDENTITY CASCADE;"
wms_inventory "TRUNCATE inv_discrepancy_log, inv_stock_movement, inv_balance, inv_lot RESTART IDENTITY CASCADE;"
wms_inbound "TRUNCATE inbound_receipt_line, inbound_receipt RESTART IDENTITY CASCADE;"

echo "[3/5] QMS inspection and nonconformance transaction cleanup"
qms_inspection "TRUNCATE qms_inspection_result_detail, qms_inspection_result RESTART IDENTITY CASCADE;"
qms_ncr "TRUNCATE qms_capa_ncr_link, qms_ncr_disposition, qms_capa, qms_ncr RESTART IDENTITY CASCADE;"

echo "[4/5] Re-seed service-owned demo datasets"
(cd "$ROOT_DIR" && npm run seed:wms:demo)
(cd "$ROOT_DIR" && npm run seed:qms:demo)

echo "[4b/5] Re-apply MES master-data seed, labor fixtures, and read-model projections"
"${COMPOSE[@]}" restart mes-master-data-service >/dev/null
sleep 2
(cd "$ROOT_DIR" && npm run seed:mes:labor:demo)

echo "[5/5] Post-cleanup verification"
mes_exec "SELECT 'wo_header' AS table_name, count(*) FROM wo_header UNION ALL SELECT 'wo_operation', count(*) FROM wo_operation UNION ALL SELECT 'wo_material_requirement', count(*) FROM wo_material_requirement UNION ALL SELECT 'wo_operation_labor_assignment', count(*) FROM wo_operation_labor_assignment;"
wms_outbound "SELECT 'material_request' AS table_name, count(*) FROM material_request UNION ALL SELECT 'outbox_events', count(*) FROM outbox_events;"
wms_inventory "SELECT 'inv_lot' AS table_name, count(*) FROM inv_lot UNION ALL SELECT 'inv_stock_movement', count(*) FROM inv_stock_movement;"
qms_inspection "SELECT 'qms_inspection_result' AS table_name, count(*) FROM qms_inspection_result;"
qms_ncr "SELECT 'qms_ncr' AS table_name, count(*) FROM qms_ncr UNION ALL SELECT 'qms_capa', count(*) FROM qms_capa;"
"${COMPOSE[@]}" exec -T mes-master-data-db psql -v ON_ERROR_STOP=1 -U mes_master_data_user -d mes_master_data_db -c "SELECT 'demo_employees' AS fixture, count(*) FROM md_employee WHERE code LIKE 'EMP-%' UNION ALL SELECT 'demo_schedules', count(*) FROM md_employee_shift_schedule s JOIN md_employee e ON e.master_id = s.employee_id WHERE e.code LIKE 'EMP-%';"
echo "Demo cleanup and reseed completed. Master-data databases were not truncated."
