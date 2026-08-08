# Printer Adapter Remote Deployment

`printer-adapter` and `printer-adapter-ui` run on the separate ARM64 macOS
host, not in the Print Station compose stack.

For every change to either service:

1. Build the `linux/arm64` image.
2. Push it to Docker Hub. The macOS runtime uses `latest` unless an immutable
   rollback tag is specifically requested.
3. SSH to `hoabui@100.108.194.102` and change to
   `~/Desktop/printer-running`.
4. Keep `platform: linux/arm64` for `printer-adapter`; ensure the UI has
   `PRINTER_ADAPTER_URL=http://100.108.194.102:5003`.
5. Pull and recreate only `printer-adapter` and `printer-adapter-ui`.
   If Docker Desktop Keychain blocks non-interactive pulls, load the
   already-pushed ARM64 images into Docker, then use `--pull never`.
6. Verify `/health`, `/api/health`, `/api/printers`,
   `/api/label-templates/active`, and UI monitoring.

Never store SSH credentials in this repository, compose files, or documents.
Do not restart unrelated Print Station services on the macOS Adapter host.
