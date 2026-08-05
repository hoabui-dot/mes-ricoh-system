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
	"github.com/mom-platform/mes-execution-service/internal/infrastructure/client"
	"github.com/mom-platform/mes-execution-service/internal/infrastructure/events"
	servicehttp "github.com/mom-platform/mes-execution-service/internal/infrastructure/http"
	"github.com/mom-platform/mes-execution-service/internal/instrumentation"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
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

	shutdownOTel, err := instrumentation.InitTracer(ctx)
	if err != nil {
		log.Printf("[Bootstrap] OTel init warning: %v", err)
	}
	defer shutdownOTel()

	dbURL := getEnv("DATABASE_URL", "postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db")
	port := getEnv("PORT", "3030")
	brokers := strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ",")
	schemaRegistryURL := getEnv("SCHEMA_REGISTRY_URL", "http://localhost:18081")

	pool, err := waitForDB(ctx, dbURL)
	if err != nil {
		log.Fatalf("[Bootstrap] Fatal DB error: %v", err)
	}
	defer pool.Close()

	if err := runMigrations(ctx, pool); err != nil {
		log.Fatalf("[Bootstrap] Migration error: %v", err)
	}

	if err := events.RegisterEventSchemas(schemaRegistryURL); err != nil {
		log.Printf("[SchemaRegistry] Registration warning: %v", err)
	}

	consumer := events.NewMasterDataConsumer(brokers, pool)
	consumer.Start()
	defer consumer.Stop()
	printerResults := events.NewPrinterResultConsumer(brokers, pool)
	printerResults.Start()
	defer printerResults.Stop()
	wmsMaterialResults := events.NewWMSMaterialResultConsumer(brokers, pool)
	wmsMaterialResults.Start()
	defer wmsMaterialResults.Stop()
	wmsInventoryResults := events.NewWMSInventoryResultConsumer(brokers, pool)
	wmsInventoryResults.Start()
	defer wmsInventoryResults.Stop()

	relay := sharedkernel.NewOutboxRelayWorker(sharedkernel.OutboxRelayConfig{
		Pool:           pool,
		Brokers:        brokers,
		ClientID:       "mes-execution-service",
		PollIntervalMs: 1000,
		BatchSize:      50,
		MaxRetries:     3,
	})
	relay.Start()
	defer relay.Stop()

	traceabilityURL := getEnv("TRACEABILITY_SERVICE_URL", "http://mes-traceability-service:3040/api/mes/traceability")
	traceabilityClient := client.NewTraceabilityClient(traceabilityURL)

	masterDataURL := getEnv("MASTER_DATA_SERVICE_URL", "http://mes-master-data-service:3020")
	resourcePlanningClient := client.NewResourcePlanningClient(masterDataURL)
	failureReasonClient := client.NewFailureReasonClient(masterDataURL)
	router := servicehttp.NewRouter(pool, traceabilityClient, resourcePlanningClient, failureReasonClient)

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		log.Printf("[Bootstrap] mes-execution-service listening on :%s", port)
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
		"migrations/000001_initial_execution_schema.up.sql",
		"migrations/000002_audit_and_lifecycle_triggers.up.sql",
		"migrations/000003_execution_realtime_tables.up.sql",
		"migrations/000004_i18n_read_models.up.sql",
		"migrations/000005_wms_stock_check_status.up.sql",
		"migrations/000006_work_order_creation_workflows.up.sql",
		"migrations/000007_work_order_numbering_daily.up.sql",
		"migrations/000008_operation_names.up.sql",
		"migrations/000009_labor_assignments_and_read_models.up.sql",
		"migrations/000010_resource_allocations.up.sql",
		"migrations/000011_machine_group_allocations.up.sql",
		"migrations/000012_decouple_mbom_read_model.up.sql",
		"migrations/000013_harmonize_work_order_planning_snapshot.up.sql",
		"migrations/000014_routing_planning_resolution.up.sql",
		"migrations/000015_demo_execution_dispatch_print_jobs.up.sql",
		"migrations/000016_decouple_routing_read_model_context.up.sql",
		"migrations/000017_production_version_authoritative_snapshot.up.sql",
		"migrations/000018_normalize_production_version_read_model_context.up.sql",
		"migrations/000019_resource_allocation_advisory_approval.up.sql",
		"migrations/000020_routing_operation_timing_snapshot.up.sql",
		"migrations/000021_operation_quantities_and_batch_print_policy.up.sql",
		"migrations/000022_mbom_snapshot_line_traceability.up.sql",
		"migrations/000023_production_line_selection.up.sql",
		"migrations/000024_manual_operation_failure_state_machine.up.sql",
		"migrations/000025_work_order_dispatch_policy.up.sql",
		"migrations/000026_item_revision_uom_code_projection.up.sql",
		"migrations/000027_outbox_event_metadata.up.sql",
		"migrations/000028_outbox_dead_letter_replay.up.sql",
		"migrations/000029_versioned_material_demand.up.sql",
		"migrations/000030_wms_material_result_inbox.up.sql",
		"migrations/000031_wms_inventory_result_inbox.up.sql",
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
