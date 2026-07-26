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
COPY services/plc-adapter/ services/plc-adapter/
RUN dotnet restore services/plc-adapter/src/ND.PlcAdapter.Api/ND.PlcAdapter.Api.csproj
RUN dotnet publish services/plc-adapter/src/ND.PlcAdapter.Api/ND.PlcAdapter.Api.csproj -c Release -o /app/publish --no-restore /p:UseSharedCompilation=false /p:ConcurrentBuild=false

# Stage 2 — runtime: uses the TARGET platform image (amd64 or arm64)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
USER app
COPY --chown=app:app --from=build /app/publish .
VOLUME ["/data", "/logs"]
EXPOSE 5006
ENV DOTNET_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:5006
ENTRYPOINT ["dotnet", "ND.PlcAdapter.Api.dll"]
