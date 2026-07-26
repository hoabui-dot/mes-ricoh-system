# syntax=docker/dockerfile:1
# ──────────────────────────────────────────────────────────────────────────────
# Multi-platform cross-compilation for linux/amd64 + linux/arm64
#
# BUILDPLATFORM = host machine running the build (always amd64 on dev / CI)
# TARGETPLATFORM = destination platform (amd64 or arm64)
# TARGETARCH     = short arch: amd64 | arm64  (passed to dotnet publish -a)
# ──────────────────────────────────────────────────────────────────────────────

# Stage 1 — build: runs on HOST platform for speed (no QEMU emulation needed)
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_GCConserveMemory=9
COPY Directory.Build.props ./
COPY Directory.Packages.props ./
COPY station-agent.sln ./
COPY shared/ shared/
COPY services/printer-adapter/ services/printer-adapter/
RUN dotnet restore services/printer-adapter/src/ND.PrinterAdapter.Api/ND.PrinterAdapter.Api.csproj -a $TARGETARCH
RUN dotnet publish services/printer-adapter/src/ND.PrinterAdapter.Api/ND.PrinterAdapter.Api.csproj -c Release -o /app/publish --no-restore -a $TARGETARCH /p:UseSharedCompilation=false /p:ConcurrentBuild=false

# Stage 2 — runtime: uses the TARGET platform image (amd64 or arm64)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
USER root
RUN apt-get update && apt-get install -y cups-client cups-bsd socat && rm -rf /var/lib/apt/lists/*
USER app
COPY --chown=app:app --from=build /app/publish .
VOLUME ["/data", "/logs"]
EXPOSE 5003
ENV ASPNETCORE_URLS=http://+:5003 \
    CUPS_SERVER=127.0.0.1:8631 \
    CUPS_USER=root
ENTRYPOINT ["/bin/bash", "-c", "socat TCP-LISTEN:8631,fork,bind=127.0.0.1 TCP:host.docker.internal:631 & exec dotnet ND.PrinterAdapter.Api.dll"]



