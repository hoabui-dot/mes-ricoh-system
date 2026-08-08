# Printer Adapter Remote Deployment Runbook

## Scope and ownership

`printer-adapter` and its UI, currently delivered by the `kiosk-ui` service (`LabelTemplatesTab`), are deployed to a **separate Printer Adapter server**. They must not be restarted or redeployed by the compose stack on the current station server.

All other services remain deployed on the current station server unless an approved deployment plan says otherwise.

## Remote messaging topology

The separate Printer Adapter host uses Apache Kafka, not RabbitMQ. Its
deployment compose file must provide `Kafka__BootstrapServers` (not only the
legacy shell-style `KAFKA_BOOTSTRAP_SERVERS` variable) because .NET binds the
Kafka options section using double underscores. The Printer Adapter consumes
`station.job-events` and `station.printer-commands`, then publishes results to
`station.job-events` and health telemetry to `station.device-heartbeats`.

No RabbitMQ broker is required or contacted by the Printer Adapter image.

The Printer Adapter API is published by the Print Station at
`http://100.108.194.102:5003`. Deployments of Projection Service must set
`PRINTER_ADAPTER_URL` to this address so its REST proxy and diagnostics do not
try the non-existent local Docker service name.

## Mandatory release and deployment procedure

Every Printer Adapter or Printer Adapter UI change must be built for
`linux/arm64`, pushed to Docker Hub, and deployed only to the separate macOS
Printer Adapter host. The runtime uses `latest` for both images; no tag bump is
required.

1. Build and push the changed images. Build both whenever their API contract
   changes. For the adapter:

   ```bash
   ./push-images.sh --arch arm64 --service printer-adapter --tag latest
   ```

2. Verify the ARM64 registry manifest, then SSH to `hoabui@100.108.194.102`.
   Do not put SSH credentials in source, compose, or this runbook.
3. On the macOS host:

   ```bash
   cd ~/Desktop/printer-running
   docker compose pull printer-adapter printer-adapter-ui
   docker compose up -d --no-deps printer-adapter printer-adapter-ui
   docker compose ps printer-adapter printer-adapter-ui
   ```

   If Docker Desktop's Keychain prevents a non-interactive pull, load the
   already-pushed ARM64 images into Docker on that host, then run the same
   scoped `up` command with `--pull never`.
4. Verify `/health`, `/api/health`, `/api/label-templates/active`, and UI
   monitoring. Keep `platform: linux/arm64` on `printer-adapter`.
5. Send the image digest and validation output to the developer and wait for
   feedback before continuing implementation.

## Rollback

Set the affected image reference back to a known-good tag and run the scoped
`docker compose up -d --no-deps` command. Do not use `docker compose down`,
delete SQLite volumes, or redeploy unrelated current-station services.

## Current release state

The macOS runtime was last deployed with the `latest` ARM64 Adapter image on
2026-08-08. Its image index digest is
`sha256:2b35ba3482be897318e0046589e731b8db32772528554b97a1d5216147ce8284`.
The matching Kiosk UI `latest` image index digest is
`sha256:53ccec2a377aaa732a0373a00bb56dd68d5973ecf0e07ae5eb1fe4ea9bb09ddb`.

The Adapter healthcheck calls `/api/health` and must match the generic
`status` field rather than a shell-quoted JSON literal.

## CUPS connectivity prerequisite

`CUPS_SERVER` and `CUPS_HEALTH_HOST` must name a CUPS server reachable from
the ARM Docker host. The current `192.168.2.31:631` failure is independent of
Kafka: it means TCP port 631 cannot be reached from that host, so the physical
printer correctly reports Offline. Before deployment, verify it from the ARM
host and set both values to the reachable CUPS endpoint:

```bash
timeout 5 bash -c 'exec 3<>/dev/tcp/'"$CUPS_HEALTH_HOST"'/631'
```

If this cannot connect, fix routing/firewall/CUPS listen-address, or use the
printer's direct TCP driver and port 9100 instead; changing the application
cannot make an unreachable CUPS server available.
