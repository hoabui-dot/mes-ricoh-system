.PHONY: build run dev test test-unit test-integration lint swagger migrate-up migrate-down migrate-create docker-up docker-down docker-build clean

# ─── Build ────────────────────────────────────────────────────────────────────
build:
	@echo "Building MES Platform..."
	@go build -o bin/mes ./cmd/mes

build-linux:
	@echo "Building for Linux..."
	@GOOS=linux GOARCH=amd64 go build -o bin/mes-linux ./cmd/mes

# ─── Run ──────────────────────────────────────────────────────────────────────
run: build
	@./bin/mes

dev:
	@echo "Starting development server with Air..."
	@air -c .air.toml

# ─── Test ─────────────────────────────────────────────────────────────────────
test:
	@echo "Running all tests..."
	@go test ./... -v -timeout 120s

test-unit:
	@echo "Running unit tests..."
	@go test ./... -v -run TestUnit -timeout 60s

test-integration:
	@echo "Running integration tests (requires Docker)..."
	@go test ./... -v -run TestIntegration -timeout 120s

test-coverage:
	@echo "Running tests with coverage..."
	@go test ./... -coverprofile=coverage.out -covermode=atomic
	@go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

# ─── Code Quality ─────────────────────────────────────────────────────────────
lint:
	@echo "Running linter..."
	@golangci-lint run ./...

fmt:
	@echo "Formatting code..."
	@gofmt -w .
	@goimports -w .

vet:
	@echo "Running go vet..."
	@go vet ./...

# ─── Swagger ──────────────────────────────────────────────────────────────────
swagger:
	@echo "Generating Swagger documentation..."
	@swag init -g cmd/mes/main.go -o docs/swagger --parseDependency --parseInternal

# ─── Database Migrations ──────────────────────────────────────────────────────
migrate-up:
	@echo "Running database migrations..."
	@migrate -path migrations -database "postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable" up

migrate-down:
	@echo "Rolling back last migration..."
	@migrate -path migrations -database "postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable" down 1

migrate-create:
	@echo "Creating migration: $(name)"
	@migrate create -ext sql -dir migrations -seq $(name)

migrate-version:
	@migrate -path migrations -database "postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable" version

# ─── Docker ───────────────────────────────────────────────────────────────────
docker-up:
	@echo "Starting Docker services..."
	@docker compose up -d

docker-down:
	@echo "Stopping Docker services..."
	@docker compose down

docker-build:
	@echo "Building Docker image..."
	@docker compose build

docker-logs:
	@docker compose logs -f mes

docker-clean:
	@docker compose down -v --remove-orphans

# ─── Module ───────────────────────────────────────────────────────────────────
tidy:
	@echo "Tidying Go modules..."
	@go mod tidy

download:
	@echo "Downloading dependencies..."
	@go mod download

# ─── Clean ────────────────────────────────────────────────────────────────────
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf bin/ tmp/ coverage.out coverage.html

# ─── Help ─────────────────────────────────────────────────────────────────────
help:
	@echo "MES Platform — Available Commands:"
	@echo ""
	@echo "  make build             Build the binary"
	@echo "  make run               Build and run"
	@echo "  make dev               Start with hot reload (Air)"
	@echo "  make test              Run all tests"
	@echo "  make test-unit         Run unit tests only"
	@echo "  make test-integration  Run integration tests (needs Docker)"
	@echo "  make test-coverage     Run tests with HTML coverage report"
	@echo "  make swagger           Generate Swagger docs"
	@echo "  make migrate-up        Run all pending migrations"
	@echo "  make migrate-down      Rollback last migration"
	@echo "  make migrate-create name=<name> Create new migration"
	@echo "  make docker-up         Start all Docker services"
	@echo "  make docker-down       Stop all Docker services"
	@echo "  make lint              Run linter"
	@echo "  make fmt               Format code"
	@echo "  make tidy              Tidy Go modules"
	@echo "  make clean             Clean build artifacts"
