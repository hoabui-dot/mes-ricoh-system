#!/usr/bin/env python3
import json
import base64
import urllib.request
import urllib.parse

KEYCLOAK_URL = "http://localhost:18080"
token_url = f"{KEYCLOAK_URL}/realms/wonsealtech/protocol/openid-connect/token"

users = [
    ("admin", "Admin@123!"),
    ("operator01", "Operator@123!"),
    ("plant.manager", "Manager@123!")
]

for username, password in users:
    data = urllib.parse.urlencode({
        "grant_type": "password",
        "client_id": "portal-client",
        "username": username,
        "password": password
    }).encode()

    req = urllib.request.Request(token_url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req) as resp:
            token_resp = json.loads(resp.read().decode())
            token = token_resp['access_token']
            payload_b64 = token.split('.')[1] + "=="
            payload = json.loads(base64.b64decode(payload_b64).decode())
            roles = payload.get('realm_access', {}).get('roles', [])
            print(f"👤 User '{username}': realm_access.roles = {roles}")
    except Exception as e:
        print(f"❌ Error inspecting token for {username}: {e}")
