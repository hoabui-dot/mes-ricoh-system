package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/mom-platform/mes-traceability-service/internal/infrastructure/events"
	serviceHttp "github.com/mom-platform/mes-traceability-service/internal/infrastructure/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/shared-kernel-go"
)

func runMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		);
	`)
	if err != nil {
		return err
	}

	migrationFiles := []string{
		"migrations/000001_initial_traceability_schema.up.sql",
	}

	for _, relPath := range migrationFiles {
		name := filepath.Base(relPath)
		var applied string
		err := pool.QueryRow(ctx, `SELECT name FROM schema_migrations WHERE name = $1`, name).Scan(&applied)
		if err == nil {
			log.Printf("[Migration] Skipping already-applied: %s", name)
			continue
		}

		content, err := os.ReadFile(relPath)
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", relPath, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, string(content)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("error applying %s: %w", name, err)
		}

		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			return err
		}

		if err := tx.Commit(ctx); err != nil {
			return err
		}
		log.Printf("[Migration] Applied successfully: %s", name)
	}
	return nil
}

func main() {
	log.Println("[TraceabilityService] Starting mes-traceability-service...")

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://traceability_user:traceability_pass@mes-traceability-db:5432/mes_traceability_db"
	}

	kafkaBrokers := os.Getenv("KAFKA_BROKERS")
	if kafkaBrokers == "" {
		kafkaBrokers = "kafka:29092"
	}

	schemaRegistryURL := os.Getenv("SCHEMA_REGISTRY_URL")
	if schemaRegistryURL == "" {
		schemaRegistryURL = "http://schema-registry:8081"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3040"
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 1. Database connection pool
	var pool *pgxpool.Pool
	var err error
	for i := 0; i < 15; i++ {
		pool, err = pgxpool.New(ctx, dbURL)
		if err == nil && pool.Ping(ctx) == nil {
			log.Println("[TraceabilityService] Successfully connected to PostgreSQL")
			break
		}
		log.Printf("[TraceabilityService] Waiting for PostgreSQL (attempt %d/15)...", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil || pool.Ping(ctx) != nil {
		log.Fatalf("[TraceabilityService] Fatal: could not connect to PostgreSQL: %v", err)
	}
	defer pool.Close()

	// 2. Run Database Migrations
	if err := runMigrations(ctx, pool); err != nil {
		log.Fatalf("[TraceabilityService] Migration error: %v", err)
	}

	// 3. Schema Registry Registration
	srClient := events.NewSchemaRegistryClient(schemaRegistryURL)
	if err := srClient.RegisterTraceabilitySchemas(); err != nil {
		log.Printf("[TraceabilityService] Warning registering schemas: %v", err)
	}

	// 4. Kafka Consumer for Master Data Events
	mdConsumer := events.NewMasterDataConsumer([]string{kafkaBrokers}, pool)
	mdConsumer.Start(ctx)

	// 5. Outbox Relay Worker
	outboxWorker := sharedkernel.NewOutboxRelayWorker(sharedkernel.OutboxRelayConfig{
		Pool:           pool,
		Brokers:        []string{kafkaBrokers},
		ClientID:       "mes-traceability-service",
		PollIntervalMs: 1000,
	})
	outboxWorker.Start()
	defer outboxWorker.Stop()

	// 6. HTTP Router & Server
	router := serviceHttp.NewRouter(pool)

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	go func() {
		log.Printf("[TraceabilityService] HTTP server listening on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[TraceabilityService] HTTP server failed: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[TraceabilityService] Shutting down server gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("[TraceabilityService] Server forced to shutdown: %v", err)
	}
	log.Println("[TraceabilityService] Server exited cleanly.")
}
