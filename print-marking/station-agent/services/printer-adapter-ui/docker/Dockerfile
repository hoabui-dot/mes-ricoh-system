# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY services/printer-adapter-ui/frontend/package.json ./
RUN npm install
COPY services/printer-adapter-ui/frontend/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS api-build
ARG TARGETARCH
WORKDIR /src
COPY Directory.Build.props ./
COPY Directory.Packages.props ./
COPY station-agent.sln ./
COPY shared/ shared/
COPY services/printer-adapter-ui/ services/printer-adapter-ui/
COPY --from=frontend-build /frontend/dist/ services/printer-adapter-ui/src/ND.PrinterAdapterUi.Api/wwwroot/
RUN dotnet restore services/printer-adapter-ui/src/ND.PrinterAdapterUi.Api/ND.PrinterAdapterUi.Api.csproj -a $TARGETARCH
RUN dotnet publish services/printer-adapter-ui/src/ND.PrinterAdapterUi.Api/ND.PrinterAdapterUi.Api.csproj -c Release -o /app/publish --no-restore -a $TARGETARCH /p:UseSharedCompilation=false /p:ConcurrentBuild=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
USER app
COPY --chown=app:app --from=api-build /app/publish .
EXPOSE 5010
ENV ASPNETCORE_URLS=http://+:5010 DOTNET_ENVIRONMENT=Production
ENTRYPOINT ["dotnet", "ND.PrinterAdapterUi.Api.dll"]
