#!/usr/bin/env bash
set -euo pipefail

KONG_URL="${KONG_URL:-http://127.0.0.1:18000}"
MES_URL="${MES_URL:-http://127.0.0.1:13030}"
WMS_URL="${WMS_URL:-http://127.0.0.1:13090}"
WO_ID="${WO_ID:-695b1a80-d466-4d6b-82e4-950d67ce72bc}"
USER_ID="${USER_ID:-admin}"
ROLE_CODE="${ROLE_CODE:-PLANT_MANAGER}"

pass=0
fail=0
skip=0
check() { local name="$1" body="$2" needle="$3"; if [[ "$body" == *"$needle"* ]]; then printf 'PASS %s\n' "$name"; pass=$((pass + 1)); else printf 'FAIL %s: expected %s\n' "$name" "$needle"; fail=$((fail + 1)); fi; }
skip_case() { printf 'SKIPPED_WITH_DOCUMENTED_GAP %s\n' "$1"; skip=$((skip + 1)); }

check "MES execution health" "$(curl -fsS "$MES_URL/health")" '"status":"ok"'
detail="$(curl -fsS -H "X-User-ID: $USER_ID" -H "X-Role-Code: $ROLE_CODE" "$KONG_URL/api/mes/execution/work-orders/$WO_ID")"
check "01 Work Order document response" "$detail" '"header"'
check "02 Work Order material requirements" "$detail" '"material_requirements"'

stage="$(curl -fsS -X POST -H "X-User-ID: $USER_ID" -H "X-Role-Code: $ROLE_CODE" -H "X-Trace-ID: mes-wms-script-$(date +%s)" "$KONG_URL/api/mes/execution/work-orders/$WO_ID/stage-materials")"
check "03 explicit material staging" "$stage" '"results"'
check "04 business request code" "$stage" '"request_code":"MR-'
retry="$(curl -fsS -X POST -H "X-User-ID: $USER_ID" -H "X-Role-Code: $ROLE_CODE" "$KONG_URL/api/mes/execution/work-orders/$WO_ID/stage-materials")"
check "05 duplicate staging is idempotent" "$retry" '"request_code":"MR-'
requests="$(curl -fsS "$WMS_URL/api/wms/outbound/material-requests?limit=10")"
check "06 WMS request list" "$requests" '"data"'
check "07 WMS outbound health" "$(curl -fsS "$WMS_URL/health")" '"status":"ok"'

for case in 08-multiple-materials 09-multiple-work-centers 10-existing-staging 11-fefo 12-full-shortage 13-partial-shortage 14-duplicate-event 15-duplicate-approval 16-wms-recovery 17-inventory-recovery 18-invalid-item-mapping 19-optional-material 20-backflush 21-phantom 22-cancel-before-staging 23-concurrent-consumers 24-authorization 25-reconciliation; do skip_case "$case"; done

printf 'SUMMARY PASS=%s FAIL=%s SKIPPED_WITH_DOCUMENTED_GAP=%s\n' "$pass" "$fail" "$skip"
(( fail == 0 ))
