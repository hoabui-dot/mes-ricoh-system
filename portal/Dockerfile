FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_KEYCLOAK_URL
ARG VITE_MES_URL
ARG VITE_WMS_URL
ARG VITE_QMS_URL
ARG VITE_KIOSK_URL
ENV VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL}
ENV VITE_MES_URL=${VITE_MES_URL}
ENV VITE_WMS_URL=${VITE_WMS_URL}
ENV VITE_QMS_URL=${VITE_QMS_URL}
ENV VITE_KIOSK_URL=${VITE_KIOSK_URL}

COPY package.json package-lock.json ./
COPY libs/shared-kernel/package.json ./libs/shared-kernel/
COPY libs/i18n-ui-shared/package.json ./libs/i18n-ui-shared/
COPY portal/package.json ./portal/

RUN npm install --workspace=portal --include-workspace-root

COPY libs/shared-kernel ./libs/shared-kernel
COPY libs/i18n-ui-shared ./libs/i18n-ui-shared
COPY portal ./portal

RUN npm run build --workspace=@mom-platform/shared-kernel
RUN npm run build --workspace=@mom-platform/i18n-ui-shared

WORKDIR /app/portal
RUN npm run build

# ── Production: serve via nginx ───────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

COPY --from=builder /app/portal/dist /usr/share/nginx/html

# nginx config to support React SPA routing
COPY portal/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
