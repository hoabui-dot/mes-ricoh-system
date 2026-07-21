#!/usr/bin/env python3
import json
import urllib.request
import urllib.parse

KEYCLOAK_URL = "http://localhost:18080"
REALM = "wonsealtech"

# 1. Get Master Admin Access Token
token_url = f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
token_data = urllib.parse.urlencode({
    "grant_type": "password",
    "client_id": "admin-cli",
    "username": "admin",
    "password": "Admin@123!"
}).encode()

req = urllib.request.Request(token_url, data=token_data, headers={"Content-Type": "application/x-www-form-urlencoded"})
with urllib.request.urlopen(req) as resp:
    admin_token = json.loads(resp.read().decode())["access_token"]

print("✅ Logged into Keycloak Admin API")

headers = {
    "Authorization": f"Bearer {admin_token}",
    "Content-Type": "application/json"
}

# 2. Get list of clients in wonsealtech realm
clients_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/clients"
req_clients = urllib.request.Request(clients_url, headers=headers)
with urllib.request.urlopen(req_clients) as resp:
    clients = json.loads(resp.read().decode())

client_configs = {
    "mes-client": {
        "rootUrl": "http://100.68.50.41:13052",
        "baseUrl": "http://100.68.50.41:13052",
        "adminUrl": "http://100.68.50.41:13052",
        "redirectUris": [
            "http://100.68.50.41:13052/*",
            "http://localhost:13052/*",
            "http://100.68.50.41:4000/*",
            "http://localhost:4000/*",
            "*"
        ],
        "webOrigins": [
            "http://100.68.50.41:13052",
            "http://localhost:13052",
            "http://100.68.50.41:4000",
            "http://localhost:4000",
            "+",
            "*"
        ]
    },
    "portal-client": {
        "rootUrl": "http://100.68.50.41:13000",
        "baseUrl": "http://100.68.50.41:13000",
        "adminUrl": "http://100.68.50.41:13000",
        "redirectUris": [
            "http://100.68.50.41:13000/*",
            "http://localhost:13000/*",
            "http://localhost:3000/*",
            "https://*.trycloudflare.com/*",
            "*"
        ],
        "webOrigins": [
            "http://100.68.50.41:13000",
            "http://localhost:13000",
            "http://localhost:3000",
            "https://*.trycloudflare.com",
            "+",
            "*"
        ]
    }
}

for c in clients:
    cid = c["clientId"]
    if cid in client_configs:
        db_id = c["id"]
        cfg = client_configs[cid]
        c["rootUrl"] = cfg["rootUrl"]
        c["baseUrl"] = cfg["baseUrl"]
        c["adminUrl"] = cfg["adminUrl"]
        c["redirectUris"] = cfg["redirectUris"]
        c["webOrigins"] = cfg["webOrigins"]

        update_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/clients/{db_id}"
        req_update = urllib.request.Request(update_url, data=json.dumps(c).encode(), headers=headers, method="PUT")
        with urllib.request.urlopen(req_update) as resp:
            print(f"✅ Updated redirectUris & webOrigins for '{cid}' (db_id={db_id})")

print("All Keycloak client redirectUris updated successfully!")
