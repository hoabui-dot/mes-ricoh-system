FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy modules
COPY libs/shared-kernel-go ./libs/shared-kernel-go
COPY services/mes-execution-service ./services/mes-execution-service

WORKDIR /app/services/mes-execution-service
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server/main.go

FROM alpine:3.19 AS production

RUN apk --no-cache add ca-certificates tzdata wget

WORKDIR /app
COPY --from=builder /app/server .
COPY --from=builder /app/services/mes-execution-service/migrations ./migrations

EXPOSE 3030

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3030/health >/dev/null || exit 1

CMD ["./server"]
