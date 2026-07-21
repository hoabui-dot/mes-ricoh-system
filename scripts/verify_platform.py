#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

HOST = os.getenv("PUBLIC_HOST", "100.68.50.41")
KEYCLOAK_URL = f"http://{HOST}:18080"
KONG_URL = f"http://{HOST}:18000"

print("==================================================")
print(f"  MOM PLATFORM SYSTEM VERIFICATION (Target IP: {HOST})")
print("==================================================\n")

print("--- 1. Testing Keycloak Realm & Client Settings ---")
try:
    with urllib.request.urlopen(f"{KEYCLOAK_URL}/realms/wonsealtech/.well-known/openid-configuration", timeout=5) as resp:
        disc = json.loads(resp.read().decode())
        print(f"✅ Keycloak OIDC Discovery Endpoint: AVAILABLE (Issuer: {disc.get('issuer')})")
except Exception as e:
    print(f"❌ Keycloak OIDC Discovery Failed: {e}")

print("\n--- 2. Testing User Authentication (username & email) ---")
test_users = [
    ("admin", "Admin@123!"),
    ("admin@wonsealtech.com", "Admin@123!"),
    ("plant.manager", "Manager@123!"),
    ("plant.manager@wonsealtech.com", "Manager@123!"),
    ("operator01", "Operator@123!"),
    ("operator01@wonsealtech.com", "Operator@123!"),
]

for username, password in test_users:
    token_url = f"{KEYCLOAK_URL}/realms/wonsealtech/protocol/openid-connect/token"
    body = urllib.parse.urlencode({
        "client_id": "portal-client",
        "username": username,
        "password": password,
        "grant_type": "password"
    }).encode("utf-8")
    req = urllib.request.Request(token_url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            print(f"✅ User [{username}]: SUCCESS (Token Type: {data.get('token_type')})")
    except urllib.error.HTTPError as err:
        print(f"❌ User [{username}]: FAILED ({err.code} {err.read().decode()})")
    except Exception as err:
        print(f"❌ User [{username}]: FAILED ({err})")

print("\n--- 3. Testing Services via Kong API Gateway ---")
routes = [
    ("Master Data Service (Node.js)", f"{KONG_URL}/api/mes/master-data/items"),
    ("Execution Service (Go)", f"{KONG_URL}/api/mes/execution/work-orders"),
]

headers = {
    "X-User-ID": "11111111-1111-1111-1111-111111111111",
    "X-Role-Code": "EXECUTIVE",
}

for name, url in routes:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            print(f"✅ Route [{name}]: PASS (HTTP Status: {resp.status})")
    except Exception as err:
        print(f"❌ Route [{name}]: FAIL ({err})")

print("\n==================================================")
print("  SYSTEM VERIFICATION COMPLETE")
print("==================================================")
