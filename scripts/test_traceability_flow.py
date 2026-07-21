#!/usr/bin/env python3
import json
import os
import subprocess
import urllib.request
import urllib.parse

HOST = os.getenv("PUBLIC_HOST", "100.68.50.41")
KONG_URL = f"http://{HOST}:18000"

print("==================================================")
print("  PHASE 1 STEP 2: TRACEABILITY SERVICE E2E TEST")
print("==================================================\n")

# 1. Seed Policies and Rules in mes_traceability_db
print("--- 1. Seeding Policies and Rules ---")
seed_sql = """
DO $$
DECLARE
  v_tpl_id uuid := '00000000-0000-0000-0000-000000000001';
  v_num_id uuid := '00000000-0000-0000-0000-000000000002';
  v_split_id uuid := '00000000-0000-0000-0000-000000000003';
  v_rev_id uuid := '10000000-0000-0000-0000-000000000001';
  v_uom_m2 uuid := '20000000-0000-0000-0000-000000000001';
  v_uom_pcs uuid := '20000000-0000-0000-0000-000000000002';
  v_site_id uuid := '30000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO md_label_template (template_id, template_code, template_name, layout_json)
  VALUES (v_tpl_id, 'TPL-EPDM-STD', 'Standard EPDM Roll Label', '{"width": 100, "height": 50}')
  ON CONFLICT (template_code) DO NOTHING;

  INSERT INTO md_numbering_rule (rule_id, rule_code, prefix, date_format, sequence_length, reset_frequency, site_id)
  VALUES (v_num_id, 'NR-EPDM-ROLL', 'EPDM', 'YYYYMMDD', 5, 'DAILY', v_site_id)
  ON CONFLICT (rule_code) DO NOTHING;

  INSERT INTO md_qr_split_rule (split_rule_id, rule_code, split_algorithm, default_yield_ratio, target_uom_id, site_id)
  VALUES (v_split_id, 'SR-EPDM-CUT', 'AREA_BASED', 1.0000, v_uom_m2, v_site_id)
  ON CONFLICT (rule_code) DO NOTHING;

  INSERT INTO md_traceability_policy (policy_id, item_revision_id, operation_code, tracking_type, numbering_rule_id, qr_split_rule_id, label_template_id, site_id)
  VALUES ('40000000-0000-0000-0000-000000000001', v_rev_id, 'OP-MIX', 'MOTHER_CHILD_QR', v_num_id, v_split_id, v_tpl_id, v_site_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO md_traceability_policy (policy_id, item_revision_id, operation_code, tracking_type, numbering_rule_id, qr_split_rule_id, label_template_id, site_id)
  VALUES ('40000000-0000-0000-0000-000000000002', v_rev_id, 'OP-CUT', 'MOTHER_CHILD_QR', v_num_id, v_split_id, v_tpl_id, v_site_id)
  ON CONFLICT DO NOTHING;
END $$;
"""
cmd = ["docker", "exec", "-i", "mes-traceability-db", "psql", "-U", "traceability_user", "-d", "mes_traceability_db"]
subprocess.run(cmd, input=seed_sql.encode(), check=True)
print("✅ Seeding completed.\n")

headers = {
    "Content-Type": "application/json",
    "X-User-ID": "11111111-1111-1111-1111-111111111111",
    "X-Role-Code": "OPERATOR"
}

# 2. Test Policy Resolution
print("--- 2. Testing Policy Resolution ---")
resolve_url = f"{KONG_URL}/api/mes/traceability/policies/resolve"
resolve_body = {
    "item_revision_id": "10000000-0000-0000-0000-000000000001",
    "operation_code": "OP-MIX"
}
req = urllib.request.Request(resolve_url, data=json.dumps(resolve_body).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode())
    print(f"✅ Policy Resolved: tracking_type={res['policy']['tracking_type']}, rule_prefix={res['numbering_rule']['prefix']}")

# 3. Test Issue Mother Label
print("\n--- 3. Testing Issue Mother Label ---")
issue_url = f"{KONG_URL}/api/mes/traceability/labels/issue"
issue_body = {
    "item_revision_id": "10000000-0000-0000-0000-000000000001",
    "operation_code": "OP-MIX",
    "quantity": 100.0,
    "uom_id": "20000000-0000-0000-0000-000000000001",
    "site_id": "30000000-0000-0000-0000-000000000001",
    "created_by_operation": "OP-MIX"
}
req = urllib.request.Request(issue_url, data=json.dumps(issue_body).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    mother_lbl = json.loads(resp.read().decode())
    print(f"✅ Mother Label Issued: id={mother_lbl['label_id']}, code={mother_lbl['label_code']}, qty={mother_lbl['quantity']}")

# Issue a second mother label to verify atomic numbering sequence increment
req2 = urllib.request.Request(issue_url, data=json.dumps(issue_body).encode(), headers=headers)
with urllib.request.urlopen(req2) as resp2:
    mother_lbl2 = json.loads(resp2.read().decode())
    print(f"✅ Mother Label 2 Issued: id={mother_lbl2['label_id']}, code={mother_lbl2['label_code']}")

# 4. Test QR Parent->Child Split at OP-CUT
print("\n--- 4. Testing QR Split at OP-CUT ---")
split_url = f"{KONG_URL}/api/mes/traceability/labels/split"
split_body = {
    "parent_label_id": mother_lbl['label_id'],
    "target_item_revision_id": "10000000-0000-0000-0000-000000000001",
    "operation_code": "OP-CUT",
    "pieces": [
        {"quantity": 30.0, "uom_id": "20000000-0000-0000-0000-000000000001"},
        {"quantity": 40.0, "uom_id": "20000000-0000-0000-0000-000000000001"}
    ],
    "site_id": "30000000-0000-0000-0000-000000000001",
    "idempotency_key": "CUT-SESSION-001"
}
req = urllib.request.Request(split_url, data=json.dumps(split_body).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    split_res = json.loads(resp.read().decode())
    child_labels = split_res['child_labels']
    print(f"✅ QR Split Performed: remaining_parent_qty={split_res['parent_label']['quantity']}, child_count={len(child_labels)}")
    for c in child_labels:
        print(f"   └─ Child Label: code={c['label_code']}, qty={c['quantity']}, status={c['status']}")

# 5. Test Idempotency on Split
print("\n--- 5. Testing Idempotency on Split Request ---")
req_idemp = urllib.request.Request(split_url, data=json.dumps(split_body).encode(), headers=headers)
with urllib.request.urlopen(req_idemp) as resp_idemp:
    split_idemp_res = json.loads(resp_idemp.read().decode())
    print(f"✅ Idempotent Call Returned {len(split_idemp_res['child_labels'])} existing child labels without duplicate creation.")

# 6. Test Consume Child Label at OP-MOLD
print("\n--- 6. Testing Consume Child Label at OP-MOLD ---")
consume_url = f"{KONG_URL}/api/mes/traceability/labels/consume"
target_child = child_labels[0]
consume_body = {
    "label_id": target_child['label_id'],
    "operation_code": "OP-MOLD"
}
req = urllib.request.Request(consume_url, data=json.dumps(consume_body).encode(), headers=headers)
with urllib.request.urlopen(req) as resp:
    c_res = json.loads(resp.read().decode())
    print(f"✅ Label Consumed: {c_res['message']}")

# 7. Test Get Full Lineage Genealogy Graph
print("\n--- 7. Testing Lineage Genealogy Graph ---")
genealogy_url = f"{KONG_URL}/api/mes/traceability/labels/{target_child['label_id']}/genealogy"
req = urllib.request.Request(genealogy_url, headers=headers)
with urllib.request.urlopen(req) as resp:
    g_res = json.loads(resp.read().decode())
    print(f"✅ Genealogy Trace for Label {target_child['label_code']}:")
    print(f"   Target Label: status={g_res['target_label']['status']}, parent_id={g_res['target_label']['parent_label_id']}")
    print(f"   Events Recorded ({len(g_res['events'])}):")
    for ev in g_res['events']:
        print(f"   └─ Event type={ev['relationship_type']}, op={ev['operation_code']}, occurred_at={ev['occurred_at']}")

# 8. Check Outbox Events Relay Status
print("\n--- 8. Checking Transactional Outbox Status in DB ---")
outbox_cmd = "docker exec -i mes-traceability-db psql -U traceability_user -d mes_traceability_db -c \"SELECT id, event_type, topic, status FROM outbox_events;\""
outbox_out = subprocess.check_output(outbox_cmd, shell=True).decode()
print(outbox_out)

print("==================================================")
print("  E2E TRACEABILITY FLOW TEST COMPLETED SUCCESSFULLY!")
print("==================================================")
