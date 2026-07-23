FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY libs ./libs
COPY services/qms-nonconformance-service ./services/qms-nonconformance-service
RUN npm install --workspace=qms-nonconformance-service --include-workspace-root
RUN npm run build --workspace=@mom-platform/shared-kernel
RUN npm run build --workspace=qms-nonconformance-service

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/libs ./libs
COPY --from=build /app/services/qms-nonconformance-service/package.json ./services/qms-nonconformance-service/package.json
COPY --from=build /app/services/qms-nonconformance-service/dist ./services/qms-nonconformance-service/dist
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/services/qms-nonconformance-service
EXPOSE 3120
CMD ["node", "dist/main.js"]
