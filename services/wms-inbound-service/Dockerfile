FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY services/wms-inbound-service/package.json ./services/wms-inbound-service/
RUN npm install --workspaces --if-present

COPY services/wms-inbound-service/ ./services/wms-inbound-service/
WORKDIR /app/services/wms-inbound-service
RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/wms-inbound-service/node_modules ./node_modules
COPY --from=builder /app/services/wms-inbound-service/dist ./dist
COPY --from=builder /app/services/wms-inbound-service/package.json ./package.json

EXPOSE 3080

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -q --spider http://localhost:3080/health || exit 1

USER node
CMD ["node", "dist/main.js"]
