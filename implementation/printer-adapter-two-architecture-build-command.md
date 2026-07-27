# Printer Adapter Two-Architecture Build Command

Date: 2026-07-26

Added the root command:

```bash
npm run build:printer-adapter:images
```

The command runs `scripts/build-printer-adapter-images.sh` and intentionally creates two separate outputs:

1. `printer-adapter:local-amd64` with `linux/amd64` and `--load` for local verification on the development host.
2. `vanhoadotbui2628/printer-adapter:independent-http-20260726` with `linux/arm64` and `--push` for deployment.

The script prints the image name, platform, and environment type after each build, then inspects the published registry manifest. The Docker Hub tag is never used for the AMD64 image and remains ARM64-only. Image references can be overridden with `PRINTER_ADAPTER_LOCAL_IMAGE` and `PRINTER_ADAPTER_IMAGE`.

Validation passed with `bash -n`, `package.json` parsing, `git diff --check`, and a local AMD64 health run before the ARM64 publish.

## Multi-platform correction (2026-07-27)

The previous `...-arm64` registry tag was incorrectly published with
`architecture=amd64`; the tag name alone did not guarantee its platform. The
build script now:

- uses the named `station-agent-multiplatform` Buildx builder;
- verifies the published architecture after every platform build;
- creates the unsuffixed Printer Adapter tag as an amd64+arm64 manifest;
- creates `printer-adapter-ui:latest` as an amd64+arm64 manifest;
- fails instead of silently accepting a wrong architecture.

The corrected registry state is:

- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-20260726-arm64` -> `linux/arm64`;
- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-20260726` -> `linux/amd64` + `linux/arm64`;
- `vanhoadotbui2628/printer-adapter-ui:latest` -> `linux/amd64` + `linux/arm64`.

Compose now consumes the unsuffixed multi-platform Printer Adapter tag so
Docker Desktop on Apple Silicon selects ARM64 automatically.

## Current authoritative command (2026-07-27)

`npm run build:printer-adapter:both` is the authoritative release command. It
invokes `scripts/build-printer-adapter-images.sh`, defaults to `--no-cache`,
pushes both architectures, and verifies every architecture and manifest after
the push. This prevents an old Docker layer or old image from being published
under the current release tag.

Default output tags:

- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-20260727-amd64`
- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-20260727-arm64`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-20260727-amd64`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-20260727-arm64`
- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-20260727` (amd64 + arm64)
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-20260727` (amd64 + arm64)

Use a new release suffix without editing the script:

```bash
PRINTER_ADAPTER_RELEASE_TAG=20260728 npm run build:printer-adapter:both
```

The completed 2026-07-27 run pushed the manifests with digests
`sha256:b6a3d404e8ed2acd325678439253e148402f324b4a045c7d8263853658a4d747`
for the Printer Adapter and
`sha256:cdc1f67d0f30392ef1d098f808352a694b326a3532035b8daf9a4d4dbc25b3a7`
for the Monitoring UI.
