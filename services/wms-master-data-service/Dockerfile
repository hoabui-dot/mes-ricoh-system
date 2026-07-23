FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY libs/shared-kernel/package.json ./libs/shared-kernel/
COPY services/wms-master-data-service/package.json ./services/wms-master-data-service/

RUN npm install --workspaces --if-present

COPY libs/shared-kernel/ ./libs/shared-kernel/
COPY services/wms-master-data-service/ ./services/wms-master-data-service/

RUN npm run build --workspace=@mom-platform/shared-kernel

WORKDIR /app/services/wms-master-data-service
RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/libs/shared-kernel/dist ./libs/shared-kernel/dist
COPY --from=builder /app/libs/shared-kernel/package.json ./libs/shared-kernel/package.json
COPY --from=builder /app/services/wms-master-data-service/dist ./dist
COPY --from=builder /app/services/wms-master-data-service/package.json ./package.json

EXPOSE 3060

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -q --spider http://localhost:3060/health || exit 1

USER node

CMD ["node", "dist/main.js"]
