#!/usr/bin/env python3
import json
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
            print(f"✅ Login SUCCESS for {username}: token received (length={len(token_resp['access_token'])})")
    except urllib.error.HTTPError as e:
        print(f"❌ Login FAILED for {username} ({e.code}): {e.read().decode()}")
