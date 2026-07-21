#!/usr/bin/env python3
import json
import urllib.request
import urllib.parse

KEYCLOAK_ADMIN_URL = "http://localhost:18080"

# 1. Get Master Admin Access Token
token_url = f"{KEYCLOAK_ADMIN_URL}/realms/master/protocol/openid-connect/token"
data = urllib.parse.urlencode({
    "grant_type": "password",
    "client_id": "admin-cli",
    "username": "admin",
    "password": "Admin@123!"
}).encode()

req = urllib.request.Request(token_url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
with urllib.request.urlopen(req) as resp:
    admin_token = json.loads(resp.read().decode())["access_token"]
    print("✅ Master Admin Token Obtained")

# 2. Get user 'admin' in wonsealtech realm
users_url = f"{KEYCLOAK_ADMIN_URL}/admin/realms/wonsealtech/users?username=admin"
req = urllib.request.Request(users_url, headers={"Authorization": f"Bearer {admin_token}"})
with urllib.request.urlopen(req) as resp:
    users = json.loads(resp.read().decode())
    user_admin = next((u for u in users if u["username"] == "admin"), None)

if not user_admin:
    print("❌ User admin not found in wonsealtech realm")
    exit(1)

user_id = user_admin["id"]
print(f"✅ Found user admin in wonsealtech: {user_id}")

# 3. Get client 'realm-management' ID in wonsealtech
clients_url = f"{KEYCLOAK_ADMIN_URL}/admin/realms/wonsealtech/clients?clientId=realm-management"
req = urllib.request.Request(clients_url, headers={"Authorization": f"Bearer {admin_token}"})
with urllib.request.urlopen(req) as resp:
    clients = json.loads(resp.read().decode())
    realm_mgmt_client = clients[0]

realm_mgmt_id = realm_mgmt_client["id"]

# 4. Get 'realm-admin' role from realm-management client
roles_url = f"{KEYCLOAK_ADMIN_URL}/admin/realms/wonsealtech/clients/{realm_mgmt_id}/roles"
req = urllib.request.Request(roles_url, headers={"Authorization": f"Bearer {admin_token}"})
with urllib.request.urlopen(req) as resp:
    roles = json.loads(resp.read().decode())
    realm_admin_role = next((r for r in roles if r["name"] == "realm-admin"), None)

print(f"✅ Found realm-admin role: {realm_admin_role['id']}")

# 5. Assign realm-admin client role to user admin
assign_url = f"{KEYCLOAK_ADMIN_URL}/admin/realms/wonsealtech/users/{user_id}/role-mappings/clients/{realm_mgmt_id}"
req = urllib.request.Request(assign_url, data=json.dumps([realm_admin_role]).encode(), headers={
    "Authorization": f"Bearer {admin_token}",
    "Content-Type": "application/json"
}, method="POST")

with urllib.request.urlopen(req) as resp:
    print("✅ Successfully assigned 'realm-admin' client role to user 'admin' in wonsealtech realm!")
