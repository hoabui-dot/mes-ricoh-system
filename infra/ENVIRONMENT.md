# Compose Environment Files

Compose configuration in this directory uses three layers:

- `.env`: local/deployment-specific interpolation values, public URLs,
  advertised Kafka address, and administrator credentials. This file is
  ignored by Git.
- `.common.env`: shared non-secret runtime values used by platform and MES
  containers.
- `.mes.env`: MES demo/runtime policy values shared by MES containers.

The Compose files intentionally do not use `${VAR:-fallback}`. Required
interpolation variables use `${VAR:?message}` so a deployment fails at startup
instead of silently connecting to an obsolete Cloudflare URL or using an
unexpected credential.

## First setup

```sh
cd infra
cp .env.example .env
# Edit .env with the current tunnel URLs, Kafka address, and credentials.
docker compose --env-file .env -f docker-compose.yml config --quiet
```

## Start the platform and applications

```sh
docker compose --env-file .env -f docker-compose.yml up -d
```

The independent Print Station control plane is started with:

```sh
docker compose --env-file .env \
  -f docker-compose.platform.yml \
  -f docker-compose.print-station.yml up -d
```

The remote Printer Adapter is not part of this Compose project. It connects
to Kafka using the protected external address configured by
`KAFKA_EXTERNAL_HOST` and `KAFKA_EXTERNAL_PORT`.

Never commit `.env` or place production secrets in `.common.env` or
`.mes.env`. Rotate the example development credentials before a shared or
production deployment.
