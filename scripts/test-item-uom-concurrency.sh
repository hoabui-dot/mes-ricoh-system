#!/usr/bin/env bash
set -euo pipefail

# Safe demo verification for the UOM create-or-reuse race. The unique index and
# service conflict handler must reduce two simultaneous creates to one UOM row.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT_DIR/infra/docker-compose.yml")
HOST="${MES_API_HOST:-http://localhost:18000}"
CODE="UOM-RACE-$(date +%s)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

for slot in 1 2; do
  curl -fsS -X POST "$HOST/api/mes/master-data/uoms" \
    -H 'Content-Type: application/json' -H 'X-User-ID: 00000000-0000-0000-0000-000000000001' \
    -H 'X-Role-Code: PROD_MANAGER' -d "{\"code\":\"$CODE\",\"name\":\"Race UOM\",\"uom_class\":\"Quantity\",\"decimal_precision\":3}" \
    >"$TMP_DIR/response-$slot.json" 2>"$TMP_DIR/error-$slot.log" &
done
wait

COUNT="$(${COMPOSE[@]} exec -T mes-master-data-db psql -U mes_master_data_user -d mes_master_data_db -Atc "SELECT COUNT(*) FROM md_uom WHERE UPPER(code) = UPPER('$CODE');")"
test "$COUNT" = "1"
echo "UOM concurrency verification passed: $CODE -> exactly one row"
