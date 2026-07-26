# Public console tunnels

The staging host uses Cloudflare Quick Tunnels for the demo environment. The
systemd template is installed as `cloudflared-console@<local-port>.service`.
The unit logs the assigned `trycloudflare.com` hostname to
`/home/neurosus/cloudflared-<local-port>.log`.

Ports:

- `13000`: platform portal
- `13052`: MES Console
- `13091`: WMS Console
- `13130`: QMS Console
- `18000`: Kong API Gateway
- `18080`: Keycloak SSO (existing `cloudflared-mes-18080.service`)

Quick Tunnel hostnames are ephemeral. After a restart, rebuild the frontend
images with the new API and Keycloak hostnames and update the portal links.

`npm run cloudflare:urls` validates the hostnames before printing them. If the
console systemd template is not installed on the host, the command starts the
missing user-owned Quick Tunnel processes and waits for fresh hostnames. For
reboot persistence, install `cloudflared-console@.service` as root and enable
the required instances.
