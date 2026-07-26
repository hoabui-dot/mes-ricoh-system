# Portal MES Cloudflare URL Rebuild

## Root Cause

Portal application links are compiled into the Vite bundle through `VITE_MES_URL`. The running Portal image still contained the expired MES hostname `speaker-eyes-acrylic-administrator.trycloudflare.com`, while the current MES tunnel was `heard-stomach-artwork-futures.trycloudflare.com`.

The MES Console has a separate build-time `VITE_API_BASE_URL`. Updating only `VITE_MES_URL` makes the Portal navigation open MES, but MES requests continue going to the old API tunnel and fail.

## Fix

- Confirmed the current URL in `infra/cloudflared/current-urls.env` and the compose build argument.
- Rebuilt and restarted only `platform-portal`.
- Verified the compiled Portal assets contain the current MES, WMS, QMS, and Keycloak URLs.
- Updated the MES Console API default from the expired `progressive-differ-constitutional-immigration.trycloudflare.com` to the active `plant-memories-ago-bar.trycloudflare.com`.
- Rebuilt and restarted `mes-console` with the active API and SSO URLs.
- Verified a public `GET /api/mes/master-data/operations?limit=1` request returns HTTP 200 with data.
- Verified the public Portal URL returns HTTP 200.

## Updating Later

From the repository root after Cloudflare tunnels change:

```bash
npm run cloudflare:urls
```

Copy the current `MES` URL into `infra/cloudflared/current-urls.env` as `CLOUDFLARE_MES_URL`, and copy the current `API` URL as `CLOUDFLARE_API_URL`. Update `VITE_MES_URL` in `infra/docker-compose.yml` and `VITE_API_BASE_URL` in `infra/docker-compose.mes.yml` if the compose defaults are committed. Then rebuild both frontend images:

```bash
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml build portal
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml up -d portal
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml build mes-console
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml up -d mes-console
```

The URL is a Vite build-time value; restarting an old image without rebuilding does not change the Portal link. Verify the built value with:

```bash
docker exec platform-portal sh -c "grep -Rho 'https://[A-Za-z0-9.-]*trycloudflare.com' /usr/share/nginx/html/assets | sort -u"
docker exec mes-console sh -c "grep -Rho 'https://[A-Za-z0-9.-]*trycloudflare.com' /usr/share/nginx/html/assets | sort -u"
```
