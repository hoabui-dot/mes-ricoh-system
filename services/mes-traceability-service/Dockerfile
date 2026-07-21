# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install git and ca-certificates
RUN apk add --no-cache git ca-certificates

# Copy shared kernel and service source
COPY libs/shared-kernel-go ./libs/shared-kernel-go
COPY services/mes-traceability-service ./services/mes-traceability-service

WORKDIR /app/services/mes-traceability-service
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# Final runtime stage
FROM alpine:3.19

WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata wget

COPY --from=builder /app/services/mes-traceability-service/server ./server
COPY --from=builder /app/services/mes-traceability-service/migrations ./migrations

EXPOSE 3040

CMD ["./server"]
