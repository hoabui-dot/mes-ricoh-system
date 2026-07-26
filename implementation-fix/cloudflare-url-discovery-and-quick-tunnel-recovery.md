# Cloudflare URL Discovery and Quick Tunnel Recovery

## Root Cause

The console Quick Tunnel template was not installed as a systemd instance on the host. Only the dedicated Keycloak unit was active. The URL script therefore started ad-hoc console tunnels, but it read append-only historical logs before the new Quick Tunnel hostname had been assigned. It then validated the historical hostname and printed `NONE` when that hostname had expired or the public HTTP probe was temporarily unavailable.

## Fix

- Ad-hoc tunnels now write to a clean `/tmp/cloudflared-<port>-runtime.log` for each recovery run.
- Historical host logs are ignored when the process was not already running.
- Hostname discovery waits up to 30 seconds for Cloudflare assignment.
- URL discovery and application HTTP health are separated. The command prints a discovered hostname by default; set `CLOUDFLARE_VALIDATE_URLS=1` when strict HTTP validation is required.
- Existing SSO service discovery remains unchanged.

## Verification

`npm run cloudflare:urls` was run with host networking and returned fresh URLs for Portal, MES, WMS, QMS, API, and SSO. `bash -n scripts/show-cloudflare-urls.sh` and `git diff --check` passed.
