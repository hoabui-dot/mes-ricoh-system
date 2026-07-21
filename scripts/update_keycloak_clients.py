#!/usr/bin/env python3
import json
import os
import subprocess
import sys

HOST = os.getenv("PUBLIC_HOST", "100.68.50.41")

clients = [
    ("portal-client", f"http://{HOST}:13000"),
    ("mes-client", f"http://{HOST}:13052"),
    ("wms-client", f"http://{HOST}:4001"),
    ("qms-client", f"http://{HOST}:4002"),
]

print(f"Updating Keycloak client URLs for IP/Host: {HOST}...")

# Authenticate kcadm.sh CLI
login_cmd = [
    "docker", "exec", "platform-keycloak",
    "/opt/keycloak/bin/kcadm.sh", "config", "credentials",
    "--server", "http://localhost:8080",
    "--realm", "master",
    "--user", "admin",
    "--password", "Admin@123!"
]
subprocess.check_call(login_cmd)

for client_id, base_url in clients:
    try:
        # Get client ID
        get_cmd = [
            "docker", "exec", "platform-keycloak",
            "/opt/keycloak/bin/kcadm.sh", "get", "clients",
            "-r", "wonsealtech",
            "--query", f"clientId={client_id}",
            "--fields", "id"
        ]
        output = subprocess.check_output(get_cmd).decode("utf-8")
        parsed = json.loads(output)
        if not parsed or len(parsed) == 0:
            print(f"Client {client_id} not found")
            continue
        cid = parsed[0]["id"]

        # Update rootUrl, baseUrl, adminUrl
        update_cmd = [
            "docker", "exec", "platform-keycloak",
            "/opt/keycloak/bin/kcadm.sh", "update", f"clients/{cid}",
            "-r", "wonsealtech",
            "-s", f"rootUrl={base_url}",
            "-s", f"baseUrl={base_url}",
            "-s", f"adminUrl={base_url}"
        ]
        subprocess.check_call(update_cmd)
        print(f"✅ Updated {client_id} -> {base_url}")
    except Exception as err:
        print(f"❌ Failed to update {client_id}: {err}")

print("Done updating Keycloak client URLs.")
