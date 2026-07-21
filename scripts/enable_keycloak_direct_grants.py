#!/usr/bin/env python3
import json
import urllib.request
import urllib.parse

KEYCLOAK_ADMIN_URL = "http://localhost:18080"

# 1. Get Admin Access Token
token_url = f"{KEYCLOAK_ADMIN_URL}/realms/master/protocol/openid-connect/token"
data = urllib.parse.urlencode({
    "grant_type": "password",
    "client_id": "admin-cli",
    "username": "admin",
    "password": "Admin@123!"
}).encode()

req = urllib.request.Request(token_url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
try:
    with urllib.request.urlopen(req) as resp:
        admin_token = json.loads(resp.read().decode())["access_token"]
        print("✅ Keycloak Admin Token Obtained")
except urllib.error.HTTPError as e:
    print(f"❌ Token error ({e.code}): {e.read().decode()}")
    raise e

# 2. Get mes-client ID
clients_url = f"{KEYCLOAK_ADMIN_URL}/admin/realms/wonsealtech/clients"
req = urllib.request.Request(clients_url, headers={"Authorization": f"Bearer {admin_token}"})
with urllib.request.urlopen(req) as resp:
    clients = json.loads(resp.read().decode())
    mes_client = next((c for c in clients if c["clientId"] == "mes-client"), None)

if not mes_client:
    print("❌ mes-client not found in Keycloak realm")
    exit(1)

client_db_id = mes_client["id"]
print(f"✅ Found mes-client (ID: {client_db_id}), current directAccessGrantsEnabled: {mes_client.get('directAccessGrantsEnabled')}")

# 3. Update mes-client to enable directAccessGrantsEnabled
mes_client["directAccessGrantsEnabled"] = True
update_url = f"{KEYCLOAK_ADMIN_URL}/admin/realms/wonsealtech/clients/{client_db_id}"
req = urllib.request.Request(update_url, data=json.dumps(mes_client).encode(), headers={
    "Authorization": f"Bearer {admin_token}",
    "Content-Type": "application/json"
}, method="PUT")

with urllib.request.urlopen(req) as resp:
    print("✅ Successfully enabled directAccessGrantsEnabled on mes-client in Keycloak!")
