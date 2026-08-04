package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/application"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/infrastructure/events"
	servicehttp "github.com/mom-platform/mes-kiosk-gateway-service/internal/infrastructure/http"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/websocket"
)

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dbURL := getEnv("DATABASE_URL", "postgresql://mes_kiosk_user:mes_kiosk_pass@localhost:15437/mes_kiosk_gateway_db")
	port := getEnv("PORT", "3050")
	brokers := strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ",")
	keycloakURL := getEnv("KEYCLOAK_URL", "http://platform-keycloak:8080")

	pool, err := waitForDB(ctx, dbURL)
	if err != nil {
		log.Fatalf("[Bootstrap] Fatal DB error: %v", err)
	}
	defer pool.Close()

	if err := runMigrations(ctx, pool); err != nil {
		log.Fatalf("[Bootstrap] Migration error: %v", err)
	}

	authService := application.NewAuthService(pool, keycloakURL, "wonsealtech", "mes-client")
	hub := websocket.NewHub(pool, authService)

	consumer := events.NewExecutionConsumer(brokers, pool, hub)
	consumer.Start()
	defer consumer.Stop()

	router := servicehttp.NewRouter(pool, authService, hub)

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		log.Printf("[Bootstrap] mes-kiosk-gateway-service listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Bootstrap] HTTP server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("[Bootstrap] Shutting down gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[Bootstrap] Forced shutdown: %v", err)
	}
	log.Println("[Bootstrap] Shutdown complete")
}

func waitForDB(ctx context.Context, dbURL string) (*pgxpool.Pool, error) {
	for i := 0; i < 15; i++ {
		pool, err := pgxpool.New(ctx, dbURL)
		if err == nil {
			if err := pool.Ping(ctx); err == nil {
				log.Println("[Bootstrap] Database connection established")
				return pool, nil
			}
			pool.Close()
		}
		log.Printf("[Bootstrap] Waiting for DB... retrying (%d/15)", i+1)
		time.Sleep(2 * time.Second)
	}
	return nil, fmt.Errorf("database never became ready")
}

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
		"migrations/000001_initial_kiosk_gateway_schema.up.sql",
		"migrations/000002_demo_terminal.up.sql",
		"migrations/000003_reliable_event_relay.up.sql",
		"migrations/000004_restore_canonical_terminals.up.sql",
		"migrations/000005_single_active_terminal_session.up.sql",
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
		log.Printf("[Migration] Applied: %s", name)
	}

	return nil
}
