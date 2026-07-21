FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY services/kiosk-operator-ui/package.json ./services/kiosk-operator-ui/

RUN npm install --workspace=services/kiosk-operator-ui --include-workspace-root

COPY services/kiosk-operator-ui ./services/kiosk-operator-ui

WORKDIR /app/services/kiosk-operator-ui
RUN npm run build

FROM nginx:alpine

COPY services/kiosk-operator-ui/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/services/kiosk-operator-ui/dist /usr/share/nginx/html

EXPOSE 3051

CMD ["nginx", "-g", "daemon off;"]
