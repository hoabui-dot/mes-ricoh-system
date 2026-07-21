#!/usr/bin/env python3
import json
import os
import subprocess
import urllib.request
import urllib.parse

HOST = os.getenv("PUBLIC_HOST", "100.68.50.41")
KONG_URL = f"http://{HOST}:18000"

print("==================================================")
print("  PHASE 1 STEP 4: EXECUTION SERVICE STAGE B TEST")
print("==================================================\n")

headers = {
    "Content-Type": "application/json",
    "X-User-ID": "11111111-1111-1111-1111-111111111111",
    "X-Role-Code": "OPERATOR"
}

# 1. Create Work Order
print("--- 1. Creating Work Order ---")
create_wo_url = f"{KONG_URL}/api/mes/execution/work-orders"
create_body = {
    "item_revision_id": "16e323c4-0cb8-41e6-ad57-3f2c4810a1bf",
    "item_code": "FG-WS-CM01",
    "item_name": "Cao su chân máy ô tô",
    "quantity": 100.0,
    "uom_id": "20000000-0000-0000-0000-000000000001",
    "site_id": "9f785cbd-98aa-4b2c-98ef-287a189e760c"
}
req = urllib.request.Request(create_wo_url, data=json.dumps(create_body).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    wo_data = json.loads(resp.read().decode())
    wo_id = wo_data["wo_id"]
    wo_code = wo_data["wo_code"]
    print(f"✅ WO Created: wo_id={wo_id}, wo_code={wo_code}, status={wo_data['status']}")

# 2. Approve Work Order
print("\n--- 2. Approving Work Order ---")
approve_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/approve"
approve_headers = dict(headers)
approve_headers["X-Role-Code"] = "PLANT_MANAGER"
approve_body = {"comment": "Approved for real-time shopfloor execution"}
req = urllib.request.Request(approve_url, data=json.dumps(approve_body).encode(), headers=approve_headers)
with urllib.request.urlopen(req) as resp:
    app_data = json.loads(resp.read().decode())
    print(f"✅ WO Approved & Released: status={app_data['status']}")

# 3. Get WO Operations
get_wo_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}"
req = urllib.request.Request(get_wo_url, headers=headers)
with urllib.request.urlopen(req) as resp:
    full_wo = json.loads(resp.read().decode())
    ops = full_wo["operations"]
    print(f"\n--- WO Routing Operations ({len(ops)}) ---")
    for op in ops:
        print(f"   └─ Seq {op['sequence_no']}: op_code={op['operation_code']}, op_id={op['wo_operation_id']}, status={op['status']}")

op_map = {op["operation_code"]: op["wo_operation_id"] for op in ops}

# 4. OP-MIX Execution
print("\n--- 4. Executing OP-MIX ---")
op_mix_id = op_map.get("OP-MIX")
start_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_mix_id}/start"
req = urllib.request.Request(start_url, data=json.dumps({"terminal_ref": "MIX-TERMINAL-01"}).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    s_mix = json.loads(resp.read().decode())
    session_mix_id = s_mix["session_id"]
    print(f"✅ OP-MIX Started: session_id={session_mix_id}")

confirm_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_mix_id}/confirm"
confirm_mix_body = {
    "session_id": session_mix_id,
    "qty_good": 100.0,
    "qty_scrap": 0.0,
    "scanned_material_code": "RM-CHEM-01",
    "idempotency_attempt": "MIX-01"
}
req = urllib.request.Request(confirm_url, data=json.dumps(confirm_mix_body).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    c_mix = json.loads(resp.read().decode())
    mother_label_id = c_mix.get("output_label_id")
    print(f"✅ OP-MIX Confirmed: confirmation_id={c_mix['confirmation_id']}, output_mother_label_id={mother_label_id}")

# 5. OP-PREP Execution (Manual Scan Enforcement)
print("\n--- 5. Executing OP-PREP ---")
op_prep_id = op_map.get("OP-PREP")
start_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_prep_id}/start"
req = urllib.request.Request(start_url, data=json.dumps({"terminal_ref": "PREP-TERMINAL-01"}).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    s_prep = json.loads(resp.read().decode())
    session_prep_id = s_prep["session_id"]
    print(f"✅ OP-PREP Started: session_id={session_prep_id}")

confirm_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_prep_id}/confirm"
confirm_prep_body = {
    "session_id": session_prep_id,
    "qty_good": 100.0,
    "qty_scrap": 0.0,
    "scanned_material_code": "RM-STL-05-R1",
    "idempotency_attempt": "PREP-01"
}
req = urllib.request.Request(confirm_url, data=json.dumps(confirm_prep_body).encode(), headers=headers)
try:
    with urllib.request.urlopen(req) as resp:
        c_prep = json.loads(resp.read().decode())
        print(f"✅ OP-PREP Confirmed: confirmation_id={c_prep['confirmation_id']}")
except urllib.error.HTTPError as e:
    print(f"❌ OP-PREP error ({e.code}): {e.read().decode()}")
    raise e

# 6. OP-CUT Execution (QR Split Call)
print("\n--- 6. Executing OP-CUT (QR Split Call) ---")
op_cut_id = op_map.get("OP-CUT")
start_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_cut_id}/start"
req = urllib.request.Request(start_url, data=json.dumps({"terminal_ref": "CUT-TERMINAL-01"}).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    s_cut = json.loads(resp.read().decode())
    session_cut_id = s_cut["session_id"]
    print(f"✅ OP-CUT Started: session_id={session_cut_id}")

confirm_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_cut_id}/confirm"
confirm_cut_body = {
    "session_id": session_cut_id,
    "qty_good": 100.0,
    "qty_scrap": 0.0,
    "scanned_label_id": mother_label_id,
    "pieces": [
        {"quantity": 50.0, "uom_id": "20000000-0000-0000-0000-000000000001"},
        {"quantity": 50.0, "uom_id": "20000000-0000-0000-0000-000000000001"}
    ],
    "idempotency_attempt": "CUT-01"
}
req = urllib.request.Request(confirm_url, data=json.dumps(confirm_cut_body).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    c_cut = json.loads(resp.read().decode())
    child_label_id = c_cut.get("output_label_id")
    print(f"✅ OP-CUT Confirmed: confirmation_id={c_cut['confirmation_id']}, child_label_id={child_label_id}")

# 7. OP-MOLD Execution (Consume + Issue Calls)
print("\n--- 7. Executing OP-MOLD (Consume Child + Issue Output) ---")
op_mold_id = op_map.get("OP-MOLD")
start_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_mold_id}/start"
req = urllib.request.Request(start_url, data=json.dumps({"terminal_ref": "MOLD-TERMINAL-01"}).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    s_mold = json.loads(resp.read().decode())
    session_mold_id = s_mold["session_id"]
    print(f"✅ OP-MOLD Started: session_id={session_mold_id}")

confirm_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_mold_id}/confirm"
confirm_mold_body = {
    "session_id": session_mold_id,
    "qty_good": 100.0,
    "qty_scrap": 0.0,
    "scanned_label_id": child_label_id,
    "idempotency_attempt": "MOLD-01"
}
req = urllib.request.Request(confirm_url, data=json.dumps(confirm_mold_body).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    c_mold = json.loads(resp.read().decode())
    fg_label_id = c_mold.get("output_label_id")
    print(f"✅ OP-MOLD Confirmed: confirmation_id={c_mold['confirmation_id']}, fg_label_id={fg_label_id}")

# 8. OP-TRIM Execution
print("\n--- 8. Executing OP-TRIM ---")
op_trim_id = op_map.get("OP-TRIM")
start_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_trim_id}/start"
req = urllib.request.Request(start_url, data=json.dumps({"terminal_ref": "TRIM-TERMINAL-01"}).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    s_trim = json.loads(resp.read().decode())
    session_trim_id = s_trim["session_id"]
    print(f"✅ OP-TRIM Started: session_id={session_trim_id}")

confirm_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_trim_id}/confirm"
confirm_trim_body = {
    "session_id": session_trim_id,
    "qty_good": 98.0,
    "qty_scrap": 2.0,
    "idempotency_attempt": "TRIM-01"
}
req = urllib.request.Request(confirm_url, data=json.dumps(confirm_trim_body).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    c_trim = json.loads(resp.read().decode())
    print(f"✅ OP-TRIM Confirmed: confirmation_id={c_trim['confirmation_id']}")

# 9. OP-QC Inspection Execution
print("\n--- 9. Executing OP-QC Inspection ---")
op_qc_id = op_map.get("OP-QC")
start_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_qc_id}/start"
req = urllib.request.Request(start_url, data=json.dumps({"terminal_ref": "QC-TERMINAL-01"}).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    s_qc = json.loads(resp.read().decode())
    session_qc_id = s_qc["session_id"]
    print(f"✅ OP-QC Started: session_id={session_qc_id}")

confirm_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_qc_id}/confirm"
confirm_qc_body = {
    "session_id": session_qc_id,
    "qty_good": 98.0,
    "qty_scrap": 0.0,
    "idempotency_attempt": "QC-01"
}
req = urllib.request.Request(confirm_url, data=json.dumps(confirm_qc_body).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    c_qc = json.loads(resp.read().decode())
    pass_label_id = c_qc.get("output_label_id")
    print(f"✅ OP-QC Confirmed PASS: confirmation_id={c_qc['confirmation_id']}, pass_label_id={pass_label_id}")

# 10. Verify Final Work Order Completion Status
print("\n--- 10. Verifying Work Order Final Completion Status ---")
req = urllib.request.Request(get_wo_url, headers=headers)
with urllib.request.urlopen(req) as resp:
    final_wo = json.loads(resp.read().decode())
    print(f"✅ Work Order Final Status: wo_code={final_wo['header']['wo_code']}, status={final_wo['header']['status']}")
    assert final_wo['header']['status'] == "Completed", f"Expected Completed status, got {final_wo['header']['status']}"

# 11. Check Material Consumption Records
print("\n--- 11. Checking Material Consumption Records ---")
consumption_url = f"{KONG_URL}/api/mes/execution/work-orders/{wo_id}/operations/{op_prep_id}/consumption"
req = urllib.request.Request(consumption_url, headers=headers)
with urllib.request.urlopen(req) as resp:
    c_list = json.loads(resp.read().decode())
    print(f"✅ OP-PREP Material Consumption Records ({len(c_list['data'])}):")
    for row in c_list['data']:
        print(f"   └─ Source={row['source']}, qty={row['qty_consumed']}, comp_rev={row['component_revision_id']}")

# 12. Check DB Outbox Events Status
print("\n--- 12. Checking Transactional Outbox Events Status ---")
outbox_cmd = "docker exec -i mes-execution-db psql -U mes_execution_user -d mes_execution_db -c \"SELECT id, event_type, topic, status FROM outbox_events;\""
outbox_out = subprocess.check_output(outbox_cmd, shell=True).decode()
print(outbox_out)

print("==================================================")
print("  STAGE B EXECUTION FLOW TEST COMPLETED SUCCESSFULLY!")
print("==================================================")
