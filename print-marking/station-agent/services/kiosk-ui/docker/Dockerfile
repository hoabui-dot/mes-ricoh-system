# syntax=docker/dockerfile:1
# ──────────────────────────────────────────────────────────────────────────────
# Multi-platform cross-compilation for linux/amd64 + linux/arm64
#
# Stage 1: Node.js — builds the React/Vite frontend
#   Runs on BUILDPLATFORM: JS is arch-agnostic, no cross-compilation needed.
#
# Stage 2: .NET SDK — cross-compiles the ASP.NET API
#   Runs on BUILDPLATFORM with -a $TARGETARCH for fast native compilation.
#
# Stage 3: .NET ASP.NET runtime — uses TARGETPLATFORM image
# ──────────────────────────────────────────────────────────────────────────────

# Stage 1 — React frontend (always runs on host, JS has no arch dependency)
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY services/kiosk-ui/frontend/package.json ./
RUN npm install
COPY services/kiosk-ui/frontend/ ./
RUN npm run build

# Stage 2 — .NET API build (cross-compiles for TARGETARCH)
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS api-build
ARG TARGETARCH
WORKDIR /src
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_GCConserveMemory=9
COPY Directory.Build.props ./
COPY Directory.Packages.props ./
COPY station-agent.sln ./
COPY shared/ shared/
COPY services/kiosk-ui/ services/kiosk-ui/

# Inject the Vite build output into wwwroot
COPY --from=frontend-build /src/ND.KioskUi.Api/wwwroot/ services/kiosk-ui/src/ND.KioskUi.Api/wwwroot/

RUN dotnet restore services/kiosk-ui/src/ND.KioskUi.Api/ND.KioskUi.Api.csproj -a $TARGETARCH
RUN dotnet publish services/kiosk-ui/src/ND.KioskUi.Api/ND.KioskUi.Api.csproj -c Release -o /app/publish --no-restore -a $TARGETARCH /p:UseSharedCompilation=false /p:ConcurrentBuild=false
# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
USER app
COPY --chown=app:app --from=api-build /app/publish .
VOLUME ["/data", "/logs"]
EXPOSE 5007
ENV DOTNET_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:5007
ENTRYPOINT ["dotnet", "ND.KioskUi.Api.dll"]
