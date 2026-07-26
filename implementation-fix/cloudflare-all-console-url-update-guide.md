# Cloudflare Tunnel URL Update Guide for All Consoles

## Scope

This repository uses ephemeral Cloudflare Quick Tunnel hostnames for six public entry points:

- Portal: `13000`
- MES Console: `13052`
- WMS Console: `13091`
- QMS Console: `13130`
- API/Kong: `18000`
- Keycloak SSO: `18080`

Quick Tunnel hostnames can change when a tunnel is recreated. Console URLs and API/SSO URLs are Vite build-time configuration, so restarting an existing container does not update a compiled frontend bundle.

## 1. Discover URLs

Run from the repository root:

```bash
npm run cloudflare:urls
```

The command prints the hostname discovered for each local port. `NONE` means that the hostname could not be discovered and the corresponding tunnel/service must be checked first.

Update `infra/cloudflared/current-urls.env` with the six values printed by the command. Keep `https://` and do not append a path:

```dotenv
CLOUDFLARE_PORTAL_URL=https://...
CLOUDFLARE_MES_URL=https://...
CLOUDFLARE_WMS_URL=https://...
CLOUDFLARE_QMS_URL=https://...
CLOUDFLARE_API_URL=https://...
CLOUDFLARE_SSO_URL=https://...
```

## 2. Update build inputs

The committed compose defaults must match the registry so a normal rebuild is repeatable:

| File | Build value | Used by |
| --- | --- | --- |
| `infra/docker-compose.yml` | `VITE_KEYCLOAK_URL` | Portal SSO |
| `infra/docker-compose.yml` | `VITE_MES_URL`, `VITE_WMS_URL`, `VITE_QMS_URL` | Portal navigation |
| `infra/docker-compose.mes.yml` | `VITE_KEYCLOAK_URL`, `VITE_API_BASE_URL` | MES Console |
| `infra/docker-compose.wms.yml` | `VITE_KEYCLOAK_URL`, `VITE_API_BASE_URL` | WMS Console |
| `infra/docker-compose.qms.yml` | `VITE_KEYCLOAK_URL`, `VITE_API_BASE_URL` | QMS Console |

`VITE_API_BASE_URL` is the API/Kong URL, not an individual service port. `VITE_KEYCLOAK_URL` is the SSO tunnel. Portal navigation URLs are separate from API URLs.

For a one-off rebuild, environment variables can override committed defaults:

```bash
export VITE_KEYCLOAK_URL=https://<SSO>
export VITE_MES_URL=https://<MES>
export VITE_WMS_URL=https://<WMS>
export VITE_QMS_URL=https://<QMS>
export VITE_API_BASE_URL=https://<API>
```

## 3. Rebuild all consoles

When any tunnel URL changes, rebuild all four frontend images. This avoids a mixed deployment where Portal points to a new console but that console still calls an expired API or SSO hostname:

```bash
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml build portal mes-console wms-console qms-console
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml up -d portal mes-console wms-console qms-console
```

If only API or SSO changed, all four consoles still need rebuilding because each console embeds those values independently.

## 4. Verify compiled configuration

```bash
for container in platform-portal mes-console wms-console qms-console; do
  echo "--- $container ---"
  docker exec "$container" sh -c "grep -Rho 'https://[A-Za-z0-9.-]*trycloudflare.com' /usr/share/nginx/html/assets | sort -u"
done
```

Expected references: Portal contains current SSO, MES, WMS, and QMS URLs; MES/WMS/QMS contain current SSO and API URLs.

Check containers and public entry points:

```bash
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml ps portal mes-console wms-console qms-console
curl -I -ksS --max-time 15 https://<PORTAL>/
curl -I -ksS --max-time 15 https://<MES>/
curl -I -ksS --max-time 15 https://<WMS>/
curl -I -ksS --max-time 15 https://<QMS>/
curl -ksS --max-time 15 'https://<API>/api/mes/master-data/operations?limit=1'
```

Each console should return HTTP 200. The API response must be JSON rather than an HTML tunnel error. Log in through SSO and verify Portal links open the current console hostnames.

## 5. Troubleshooting

- `NONE`: inspect the local tunnel process and log, then rerun `npm run cloudflare:urls`. Recovered ad-hoc tunnels use `/tmp/cloudflared-<port>-runtime.log`.
- Old hostname in a bundle: the image was not rebuilt, or a shell `VITE_*` variable overrode the expected value. Check `env | grep '^VITE_'` and rebuild.
- Console loads but requests fail: verify `VITE_API_BASE_URL`, Kong CORS, and the API tunnel independently. The browser origin must be allowed by Kong.
- Login redirects to an old host: update `VITE_KEYCLOAK_URL` for every console and rebuild all four images. Keycloak wildcard redirect origins are defined in `infra/keycloak/realm-export.json`.

Do not use a console's local port as `VITE_API_BASE_URL`; browser traffic must go through the public Kong tunnel so shared CORS and gateway policies apply consistently.

