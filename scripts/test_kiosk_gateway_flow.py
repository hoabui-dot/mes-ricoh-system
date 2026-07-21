#!/usr/bin/env python3
import json
import os
import subprocess
import time
import urllib.request
import urllib.parse
from websocket import create_connection

HOST = os.getenv("PUBLIC_HOST", "100.68.50.41")
KONG_URL = f"http://{HOST}:18000"
WS_URL = f"ws://{HOST}:18000/api/mes/kiosk-gateway/ws"

print("==================================================")
print("  PHASE 1 STEP 5: KIOSK GATEWAY & UI INTEGRATION TEST")
print("==================================================\n")

headers = {
    "Content-Type": "application/json"
}

terminal_id = "KIOSK-MOLD-01"

# 1. List Terminals
print("--- 1. Listing Terminals ---")
list_url = f"{KONG_URL}/api/mes/kiosk-gateway/terminals"
req = urllib.request.Request(list_url, headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    terminals = data.get("data", [])
    print(f"✅ Terminals retrieved: {len(terminals)} registered shopfloor terminals")
    for t in terminals:
        print(f"   └─ [{t['terminal_code']}] id={t['terminal_id']}, work_center={t['work_center_id']}, status={t['status']}")

# 2. Keycloak Direct Access Grant Login
print("\n--- 2. Keycloak Direct Access Grant Terminal Login ---")
login_url = f"{KONG_URL}/api/mes/kiosk-gateway/terminals/{terminal_id}/login"
login_body = {
    "employee_id": "operator01",
    "pin": "Operator@123!"
}
req = urllib.request.Request(login_url, data=json.dumps(login_body).encode(), headers=headers)
try:
    with urllib.request.urlopen(req) as resp:
        login_data = json.loads(resp.read().decode())
        access_token = login_data["access_token"]
        user_id = login_data.get("user_id", "operator01")
        print(f"✅ Direct Access Grant Auth Successful: token_length={len(access_token)}, user_id={user_id}")
except urllib.error.HTTPError as e:
    print(f"❌ Login error ({e.code}): {e.read().decode()}")
    raise e

# 3. WebSocket Connection & Authentication Frame
print("\n--- 3. Testing WebSocket Connection & Auth Frame ---")
ws_uri = f"{WS_URL}?terminal_id={terminal_id}"
ws = create_connection(ws_uri)
print(f"✅ Connected to WebSocket Gateway: {ws_uri}")

auth_frame = {"type": "auth", "token": access_token}
ws.send(json.dumps(auth_frame))
time.sleep(1)

# Check DB status is ONLINE
status_cmd = f"docker exec -i mes-kiosk-gateway-db psql -U mes_kiosk_user -d mes_kiosk_gateway_db -c \"SELECT terminal_code, status FROM terminal WHERE terminal_code = '{terminal_id}' OR terminal_id::text = '{terminal_id}';\""
status_out = subprocess.check_output(status_cmd, shell=True).decode()
print(f"✅ DB Terminal Status after Auth Frame:\n{status_out}")
assert "ONLINE" in status_out, "Expected ONLINE status in DB"

# 4. Heartbeat Exchange
print("--- 4. Testing Heartbeat Frame & ACK ---")
heartbeat_frame = {"type": "heartbeat"}
ws.send(json.dumps(heartbeat_frame))
ack_msg = ws.recv()
ack_data = json.loads(ack_msg)
print(f"✅ Received Heartbeat ACK: {ack_data}")
assert ack_data.get("type") == "heartbeat_ack", "Expected heartbeat_ack response"

# 5. Offline Queueing & Reconnect Drain Test
print("\n--- 5. Offline Message Queueing & Reconnect Drain Test ---")
ws.close()
time.sleep(1)

# Insert pending message in outbound_message_queue while terminal is offline
insert_queue_cmd = f"""docker exec -i mes-kiosk-gateway-db psql -U mes_kiosk_user -d mes_kiosk_gateway_db -c "
INSERT INTO outbound_message_queue (terminal_id, payload, event_type, status)
SELECT terminal_id, '{{\\"wo_code\\": \\"WO-TEST-QUEUED\\", \\"action\\": \\"ASSIGNED\\"}}'::jsonb, 'MES.Execution.WOCreated.v1', 'PENDING'
FROM terminal WHERE terminal_code = '{terminal_id}' OR terminal_id::text = '{terminal_id}';
" """
subprocess.check_call(insert_queue_cmd, shell=True)
print("✅ Queued 1 offline message into outbound_message_queue (status=PENDING)")

# Reconnect WebSocket
ws_reconnect = create_connection(ws_uri)
ws_reconnect.send(json.dumps(auth_frame))
time.sleep(1)

# Receive drained message
drained_msg = ws_reconnect.recv()
drained_data = json.loads(drained_msg)
print(f"✅ Received Drained Queued Message on Reconnect: {drained_data}")
assert drained_data.get("type") == "queued_event", "Expected queued_event type"

ws_reconnect.close()

# Verify DB message status updated to DELIVERED
queue_status_cmd = f"docker exec -i mes-kiosk-gateway-db psql -U mes_kiosk_user -d mes_kiosk_gateway_db -c \"SELECT message_id, event_type, status, delivered_at FROM outbound_message_queue;\""
queue_out = subprocess.check_output(queue_status_cmd, shell=True).decode()
print(f"✅ Outbound Message Queue DB Status:\n{queue_out}")
assert "DELIVERED" in queue_out, "Expected DELIVERED status in queue DB"

print("==================================================")
print("  KIOSK GATEWAY INTEGRATION TEST PASSED SUCCESSFULLY!")
print("==================================================")
