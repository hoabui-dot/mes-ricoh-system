# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

# Install build tools
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy source
COPY . .

# Build the binary with optimisations
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -extldflags '-static'" \
    -trimpath \
    -o /build/mes ./cmd/mes

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM scratch

# Copy CA certificates for HTTPS calls and timezone data
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copy the binary
COPY --from=builder /build/mes /app/mes

# Non-root user (numeric to satisfy tools that check for non-root)
USER 65534:65534

EXPOSE 8080

ENTRYPOINT ["/app/mes"]
