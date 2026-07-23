FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY libs ./libs
COPY services/qms-inspection-service ./services/qms-inspection-service
RUN npm install --workspace=qms-inspection-service --include-workspace-root
RUN npm run build --workspace=@mom-platform/shared-kernel
RUN npm run build --workspace=qms-inspection-service

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/libs ./libs
COPY --from=build /app/services/qms-inspection-service/package.json ./services/qms-inspection-service/package.json
COPY --from=build /app/services/qms-inspection-service/dist ./services/qms-inspection-service/dist
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/services/qms-inspection-service
EXPOSE 3110
CMD ["node", "dist/main.js"]
