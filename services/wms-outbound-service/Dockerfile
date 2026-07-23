FROM golang:1.22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache git ca-certificates

COPY libs/shared-kernel-go ./libs/shared-kernel-go
COPY services/wms-outbound-service ./services/wms-outbound-service

WORKDIR /app/services/wms-outbound-service
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

FROM alpine:3.19

WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata wget

COPY --from=builder /app/services/wms-outbound-service/server ./server
COPY --from=builder /app/services/wms-outbound-service/migrations ./migrations

EXPOSE 3090

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:3090/health >/dev/null || exit 1

CMD ["./server"]
