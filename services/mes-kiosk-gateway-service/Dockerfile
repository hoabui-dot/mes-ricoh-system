FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY libs/shared-kernel-go ./libs/shared-kernel-go
COPY services/mes-kiosk-gateway-service ./services/mes-kiosk-gateway-service

WORKDIR /app/services/mes-kiosk-gateway-service
RUN go mod download

RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server/main.go

FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/server .
COPY --from=builder /app/services/mes-kiosk-gateway-service/migrations ./migrations

EXPOSE 3050

CMD ["./server"]
