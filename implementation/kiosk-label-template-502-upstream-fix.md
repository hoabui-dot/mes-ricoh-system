# Kiosk Label Template 502 Upstream Fix

Date: 2026-07-26

## Finding

The Kiosk UI route `/api/label-templates/active` is an authenticated proxy to the independent Printer Adapter at `http://100.68.50.41:5003/api/label-templates/active`. Kiosk logs and direct probing showed `Connection refused (100.68.50.41:5003)`, so the Kiosk correctly returned HTTP 502. The label-template route and Printer Adapter endpoint were present and correctly mapped.

The immediate cause was architectural: the current Docker host is AMD64, while the stable Docker Hub Printer Adapter tag is intentionally ARM64-only. The ARM container had been stopped and cannot execute on this host.

## Resolution

Started the verified local AMD64 image `printer-adapter:local-amd64` on port `5003` using the existing `printer-adapter-data` volume. Added `docker-compose.print-adapter.local-amd64.yml` as a local runtime override. The base `docker-compose.print-adapter.yml` remains unchanged for ARM64 deployment.

Local AMD64 runtime command:

```bash
docker compose \
  -f docker-compose.print-adapter.yml \
  -f docker-compose.print-adapter.local-amd64.yml \
  up -d
```

ARM deployment command:

```bash
docker compose -f docker-compose.print-adapter.yml pull
docker compose -f docker-compose.print-adapter.yml up -d
```

## Verification

- Printer Adapter health returned HTTP 200 and `healthy`.
- Direct `/api/label-templates/active` returned HTTP 200 with the published default template.
- Authenticated Kiosk `/api/label-templates/active` returned HTTP 200 through the proxy.
- Simulator startup produced no listener retry loop.

