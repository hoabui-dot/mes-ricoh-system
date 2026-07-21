FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY services/mes-console/package.json ./services/mes-console/

RUN npm install --workspace=services/mes-console --include-workspace-root

COPY services/mes-console ./services/mes-console

WORKDIR /app/services/mes-console
RUN npm run build

FROM nginx:alpine

COPY services/mes-console/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/services/mes-console/dist /usr/share/nginx/html

EXPOSE 3052

CMD ["nginx", "-g", "daemon off;"]
