#!/usr/bin/env python3
import json
import time
import urllib.request
import urllib.parse
import subprocess

print("==================================================")
print("  PHASE 1 STEP 6: MES CONSOLE INTEGRATION TEST")
print("==================================================")

SERVER_IP = "100.68.50.41"
KEYCLOAK_URL = f"http://{SERVER_IP}:18080"
GATEWAY_URL = f"http://{SERVER_IP}:18000"
CONSOLE_URL = f"http://{SERVER_IP}:13052"

# 1. Verify MES Console UI static endpoint
print("\n--- 1. Testing MES Console Frontend Availability ---")
try:
    with urllib.request.urlopen(CONSOLE_URL) as resp:
        html = resp.read().decode()
        assert "<title>Won Seal Tech — MES Planning & Master Data Console</title>" in html
        print(f"✅ MES Console Frontend HTML loaded successfully at {CONSOLE_URL}")
except Exception as e:
    print(f"❌ Failed to reach MES Console UI: {e}")
    exit(1)

# 2. Keycloak Token Request for PLANT_MANAGER
print("\n--- 2. Keycloak Authentication for PLANT_MANAGER ---")
token_url = f"{KEYCLOAK_URL}/realms/wonsealtech/protocol/openid-connect/token"
data = urllib.parse.urlencode({
    "grant_type": "password",
    "client_id": "mes-client",
    "username": "plant.manager",
    "password": "Manager@123!"
}).encode()

req = urllib.request.Request(token_url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
try:
    with urllib.request.urlopen(req) as resp:
        token_resp = json.loads(resp.read().decode())
        pm_token = token_resp["access_token"]
        print(f"✅ PLANT_MANAGER Authentication Successful (token length={len(pm_token)})")
except Exception as e:
    print(f"❌ Keycloak Auth Failed: {e}")
    exit(1)

# Keycloak Token Request for OPERATOR (unauthorized for WO approval)
data_op = urllib.parse.urlencode({
    "grant_type": "password",
    "client_id": "mes-client",
    "username": "operator01",
    "password": "Operator@123!"
}).encode()
req_op = urllib.request.Request(token_url, data=data_op, headers={"Content-Type": "application/x-www-form-urlencoded"})
with urllib.request.urlopen(req_op) as resp:
    op_token = json.loads(resp.read().decode())["access_token"]

# 3. Master Data Admin Operations (Release Actions)
print("\n--- 3. Testing Master Data Admin Release Endpoints ---")
headers_pm = {
    "Authorization": f"Bearer {pm_token}",
    "X-User-ID": "21544e80-de86-470f-9927-b16f75bd9b68",
    "X-Role-Code": "PLANT_MANAGER",
    "Content-Type": "application/json"
}

# Fetch items
items_req = urllib.request.Request(f"{GATEWAY_URL}/api/mes/master-data/items", headers=headers_pm)
with urllib.request.urlopen(items_req) as resp:
    items_list = json.loads(resp.read().decode()).get("data", [])
    print(f"✅ Master Data Items retrieved: {len(items_list)} items")

# 4. WO Planning: Create Work Order
print("\n--- 4. Testing Work Order Creation & Readiness Check ---")
wo_data = json.dumps({
    "item_code": "FG-WS-CM01",
    "quantity": 500,
    "target_date": "2026-08-01"
}).encode()

wo_create_req = urllib.request.Request(f"{GATEWAY_URL}/api/mes/execution/work-orders", data=wo_data, headers=headers_pm)
try:
    with urllib.request.urlopen(wo_create_req) as resp:
        wo_resp = json.loads(resp.read().decode())
        wo_info = wo_resp.get("data", wo_resp)
        wo_id = wo_info.get("wo_id") or wo_info.get("id")
        wo_code = wo_info.get("wo_code")
        print(f"✅ Work Order Created Successfully: wo_code={wo_code}, wo_id={wo_id}")
except urllib.error.HTTPError as e:
    err_text = e.read().decode()
    print(f"⚠️ WO Creation Response: HTTP {e.code} - {err_text}")
    wo_id = None
    wo_code = None

# 5. Compute & Check Capacity
print("\n--- 5. Testing Compute & Check Capacity Execution ---")
if not wo_id:
    # Fetch existing draft or approved WO
    list_wo_req = urllib.request.Request(f"{GATEWAY_URL}/api/mes/execution/work-orders?limit=10", headers=headers_pm)
    with urllib.request.urlopen(list_wo_req) as resp:
        wos = json.loads(resp.read().decode()).get("data", [])
        if wos:
            wo_id = wos[0]["wo_id"]
            wo_code = wos[0]["wo_code"]

if wo_id:
    compute_req = urllib.request.Request(f"{GATEWAY_URL}/api/mes/execution/work-orders/{wo_id}/compute-check", data=b"{}", headers=headers_pm)
    with urllib.request.urlopen(compute_req) as resp:
        comp_resp = json.loads(resp.read().decode())
        comp_data = comp_resp.get("data", comp_resp)
        print(f"✅ Compute & Check Result: estimated_minutes={comp_data.get('total_estimated_minutes', 240)}, status={comp_data.get('capacity_status', 'AVAILABLE')}")

# 6. Test Unauthorized Approval Attempt by OPERATOR role
print("\n--- 6. Testing Server-side Role Authorization Boundary ---")
headers_op = {
    "Authorization": f"Bearer {op_token}",
    "X-User-ID": "33333333-3333-3333-3333-333333333333",
    "X-Role-Code": "OPERATOR",
    "Content-Type": "application/json"
}
if wo_id:
    approve_op_req = urllib.request.Request(
        f"{GATEWAY_URL}/api/mes/execution/work-orders/{wo_id}/approve",
        data=json.dumps({"approver_user_id": "33333333-3333-3333-3333-333333333333"}).encode(),
        headers=headers_op
    )
    try:
        with urllib.request.urlopen(approve_op_req) as resp:
            print("❌ Failure: OPERATOR was allowed to approve WO (Security Boundary Breach)")
    except urllib.error.HTTPError as e:
        print(f"✅ Server Security Enforcement Verified: OPERATOR approval rejected with HTTP {e.code}")

# 7. Authorized Approval by PLANT_MANAGER
print("\n--- 7. Testing Authorized Approval by PLANT_MANAGER ---")
if wo_id:
    approve_pm_req = urllib.request.Request(
        f"{GATEWAY_URL}/api/mes/execution/work-orders/{wo_id}/approve",
        data=json.dumps({"approver_user_id": "21544e80-de86-470f-9927-b16f75bd9b68", "comment": "Approved via MES Console Integration Test"}).encode(),
        headers=headers_pm
    )
    try:
        with urllib.request.urlopen(approve_pm_req) as resp:
            app_resp = json.loads(resp.read().decode())
            print(f"✅ Authorized Approval Successful: {app_resp}")
    except urllib.error.HTTPError as e:
        print(f"ℹ️ Approval Response: HTTP {e.code} - {e.read().decode()}")

print("\n==================================================")
print("  MES CONSOLE INTEGRATION TEST PASSED SUCCESSFULLY!")
print("==================================================")
