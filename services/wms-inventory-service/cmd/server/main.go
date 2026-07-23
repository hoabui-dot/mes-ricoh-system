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
	"github.com/mom-platform/wms-inventory-service/internal/infrastructure/events"
	servicehttp "github.com/mom-platform/wms-inventory-service/internal/infrastructure/http"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dbURL := getEnv("DATABASE_URL", "postgresql://wms_inventory_user:wms_inventory_pass@localhost:15439/wms_inventory_db")
	migrationDBURL := getEnv("MIGRATION_DATABASE_URL", dbURL)
	port := getEnv("PORT", "3070")
	brokers := strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ",")

	migrationPool, err := waitForDB(ctx, migrationDBURL)
	if err != nil {
		log.Fatalf("[Bootstrap] DB error: %v", err)
	}
	defer migrationPool.Close()

	if err := runMigrations(ctx, migrationPool); err != nil {
		log.Fatalf("[Bootstrap] migration error: %v", err)
	}

	pool := migrationPool
	if migrationDBURL != dbURL {
		pool, err = waitForDB(ctx, dbURL)
		if err != nil {
			log.Fatalf("[Bootstrap] app DB error: %v", err)
		}
		defer pool.Close()
	}

	consumer := events.NewConsumer(brokers, pool)
	consumer.Start()
	defer consumer.Stop()

	server := &http.Server{Addr: ":" + port, Handler: servicehttp.NewRouter(pool), ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second}
	go func() {
		log.Printf("[Bootstrap] wms-inventory-service listening on :%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Bootstrap] HTTP error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = server.Shutdown(shutdownCtx)
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func waitForDB(ctx context.Context, dbURL string) (*pgxpool.Pool, error) {
	for i := 0; i < 15; i++ {
		pool, err := pgxpool.New(ctx, dbURL)
		if err == nil && pool.Ping(ctx) == nil {
			return pool, nil
		}
		if pool != nil {
			pool.Close()
		}
		time.Sleep(2 * time.Second)
	}
	return nil, fmt.Errorf("database never became ready")
}

func runMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
	if err != nil {
		return err
	}
	for _, relPath := range []string{"migrations/000001_initial_inventory_schema.up.sql"} {
		name := filepath.Base(relPath)
		var applied string
		if err := pool.QueryRow(ctx, `SELECT name FROM schema_migrations WHERE name = $1`, name).Scan(&applied); err == nil {
			log.Printf("[Migration] Skipping already-applied: %s", name)
			continue
		}
		content, err := os.ReadFile(relPath)
		if err != nil {
			return err
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(content)); err != nil {
			_ = tx.Rollback(ctx)
			return err
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
