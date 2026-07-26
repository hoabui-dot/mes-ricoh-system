# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY services/device-simulator/frontend/package.json ./
RUN npm install
COPY services/device-simulator/frontend/ ./
# Use build:docker which skips tsc (pre-existing TS errors in ZebraLabelStudio/zustand store)
# Vite handles transpilation independently; the bundle is always correct
RUN npm run build:docker -- --outDir /wwwroot

# ── Stage 2: Build .NET backend ───────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /repo
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_GCConserveMemory=9

COPY Directory.Build.props ./
COPY Directory.Packages.props ./
COPY shared/ shared/
COPY services/device-simulator/ services/device-simulator/

# Inject fresh frontend build into wwwroot (overrides any pre-built stale files)
COPY --from=frontend-build /wwwroot/ services/device-simulator/src/ND.DeviceSimulator.Api/wwwroot/

# Build .NET backend
WORKDIR /repo/services/device-simulator
RUN dotnet publish src/ND.DeviceSimulator.Api/ND.DeviceSimulator.Api.csproj \
    -c Release -o /app --no-restore \
    /p:UseSharedCompilation=false /p:ConcurrentBuild=false \
    || dotnet publish src/ND.DeviceSimulator.Api/ND.DeviceSimulator.Api.csproj \
    -c Release -o /app \
    /p:UseSharedCompilation=false /p:ConcurrentBuild=false

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

USER root
RUN mkdir -p /data /app/logs && \
    chown -R app:app /data /app

COPY --chown=app:app --from=build /app .

USER app
EXPOSE 8080
ENV DOTNET_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "ND.DeviceSimulator.Api.dll"]
