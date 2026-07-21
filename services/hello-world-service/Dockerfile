FROM node:20-alpine AS builder

WORKDIR /app

# ── Layer 1: Copy manifests for caching ──────────────────────────────────────
# Build context = workspace root (/mes-system)
COPY package.json package-lock.json* ./
COPY libs/shared-kernel/package.json ./libs/shared-kernel/
COPY services/hello-world-service/package.json ./services/hello-world-service/

# ── Layer 2: Install all workspace dependencies ───────────────────────────────
RUN npm install --workspaces --if-present

# ── Layer 3: Copy source ──────────────────────────────────────────────────────
COPY libs/shared-kernel/ ./libs/shared-kernel/
COPY services/hello-world-service/ ./services/hello-world-service/

# ── Layer 4: Build shared-kernel first (service depends on its dist/) ─────────
RUN npm run build --workspace=@mom-platform/shared-kernel

# ── Layer 5: Build the service ────────────────────────────────────────────────
WORKDIR /app/services/hello-world-service
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/libs/shared-kernel/dist ./libs/shared-kernel/dist
COPY --from=builder /app/libs/shared-kernel/package.json ./libs/shared-kernel/package.json
COPY --from=builder /app/services/hello-world-service/dist ./dist
COPY --from=builder /app/services/hello-world-service/package.json ./package.json

EXPOSE 3010

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -q --spider http://localhost:3010/health || exit 1

USER node

CMD ["node", "dist/main.js"]
