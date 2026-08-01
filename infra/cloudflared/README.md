# Public console tunnels

The staging host uses two Cloudflare Quick Tunnels for the demo environment.
Run `npm run cloudflare:urls` from `/home/neurosus/recoh-system`. The command
owns tunnel discovery and prints only the MES and WMS URLs.

Ports:

- `13052`: MES Console
- `13091`: WMS Console

Quick Tunnel hostnames are ephemeral. After a restart, run the root command and
copy the two values into `cloudflare/current-urls.env` if the generated names
change. MES/WMS API and SSO dependencies use the local platform address; there
are no separate API, Portal, QMS, or SSO tunnels.
