FROM node:20-alpine AS builder
WORKDIR /app
ARG VITE_KEYCLOAK_URL
ARG VITE_API_BASE_URL
ENV VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY package.json package-lock.json ./
COPY libs/shared-kernel/package.json ./libs/shared-kernel/
COPY libs/i18n-ui-shared/package.json ./libs/i18n-ui-shared/
COPY services/qms-console/package.json ./services/qms-console/
RUN npm install --workspace=services/qms-console --include-workspace-root
COPY libs/shared-kernel ./libs/shared-kernel
COPY libs/i18n-ui-shared ./libs/i18n-ui-shared
COPY services/qms-console ./services/qms-console
RUN npm run build --workspace=@mom-platform/shared-kernel && npm run build --workspace=@mom-platform/i18n-ui-shared
WORKDIR /app/services/qms-console
RUN npm run build
FROM nginx:alpine
COPY services/qms-console/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/services/qms-console/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
