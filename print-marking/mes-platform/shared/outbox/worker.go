// Package outbox provides the background worker that polls the outbox table
// and publishes pending events to RabbitMQ.
package outbox

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/pkg/rabbitmq"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Repository abstracts the database operations the worker needs.
// Each module provides its own implementation backed by its own table.
type Repository interface {
	// FetchPending returns up to limit publishable outbox events.
	FetchPending(ctx context.Context, limit int) ([]*Event, error)
	// MarkPublished marks a batch of events as published.
	MarkPublished(ctx context.Context, ids []string) error
	// MarkFailed marks a single event as failed with an error message.
	MarkFailed(ctx context.Context, id, errMsg string) error
}

// Worker polls a module's outbox table and relays events to RabbitMQ.
// Instantiate one Worker per module.
type Worker struct {
	repo         Repository
	publisher    *rabbitmq.Publisher
	log          *logger.Logger
	pollInterval time.Duration
	batchSize    int
	tableName    string
}

// WorkerConfig holds tuning parameters for the outbox worker.
type WorkerConfig struct {
	PollInterval time.Duration
	BatchSize    int
	TableName    string
}

// NewWorker creates a new outbox Worker. Inject all dependencies.
func NewWorker(
	repo Repository,
	publisher *rabbitmq.Publisher,
	log *logger.Logger,
	cfg WorkerConfig,
) *Worker {
	interval := cfg.PollInterval
	if interval == 0 {
		interval = 5 * time.Second
	}
	batch := cfg.BatchSize
	if batch == 0 {
		batch = 100
	}
	return &Worker{
		repo:         repo,
		publisher:    publisher,
		log:          log.With(logger.Module("outbox"), zap.String("table", cfg.TableName)),
		pollInterval: interval,
		batchSize:    batch,
		tableName:    cfg.TableName,
	}
}

// Run starts the polling loop. It blocks until ctx is cancelled.
// Register it as a goroutine in the application lifecycle manager.
func (w *Worker) Run(ctx context.Context) {
	w.log.Info("outbox worker started", zap.Duration("poll_interval", w.pollInterval))
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.log.Info("outbox worker stopped")
			return
		case <-ticker.C:
			w.process(ctx)
		}
	}
}

// process fetches a batch of pending events and publishes them.
func (w *Worker) process(ctx context.Context) {
	events, err := w.repo.FetchPending(ctx, w.batchSize)
	if err != nil {
		w.log.Error("outbox: fetch pending failed", logger.Err(err))
		return
	}
	if len(events) == 0 {
		return
	}

	var published []string
	for _, ev := range events {
		if err := w.publisher.Publish(ctx, ev.RoutingKey, ev.Payload); err != nil {
			w.log.Error("outbox: publish failed",
				zap.String("event_id", ev.ID.String()),
				zap.String("routing_key", ev.RoutingKey),
				logger.Err(err),
			)
			if markErr := w.repo.MarkFailed(ctx, ev.ID.String(), err.Error()); markErr != nil {
				w.log.Error("outbox: mark failed error", logger.Err(markErr))
			}
			continue
		}
		published = append(published, ev.ID.String())
	}

	if len(published) > 0 {
		if err := w.repo.MarkPublished(ctx, published); err != nil {
			w.log.Error("outbox: mark published failed", logger.Err(err))
		}
		w.log.Info("outbox: published events", zap.Int("count", len(published)))
	}
}

// ─── Generic GORM Repository ──────────────────────────────────────────────────

// GormRepository is a generic outbox repository backed by GORM.
// Instantiate it with the concrete table name for each module.
type GormRepository struct {
	db        *gorm.DB
	tableName string
}

// NewGormRepository creates a GormRepository for the given table.
func NewGormRepository(db *gorm.DB, tableName string) *GormRepository {
	return &GormRepository{db: db, tableName: tableName}
}

// FetchPending returns up to limit publishable events ordered by created_at ASC.
func (r *GormRepository) FetchPending(ctx context.Context, limit int) ([]*Event, error) {
	var events []*Event
	err := r.db.WithContext(ctx).
		Table(r.tableName).
		Where("status IN (?, ?) AND retry_count < 5", StatusPending, StatusFailed).
		Order("created_at ASC").
		Limit(limit).
		Find(&events).Error
	return events, err
}

// MarkPublished bulk-updates a list of event IDs to status=published.
func (r *GormRepository) MarkPublished(ctx context.Context, ids []string) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).
		Table(r.tableName).
		Where("id IN ?", ids).
		Updates(map[string]any{
			"status":       StatusPublished,
			"published_at": now,
			"updated_at":   now,
		}).Error
}

// MarkFailed records a failure for a single event.
func (r *GormRepository) MarkFailed(ctx context.Context, id, errMsg string) error {
	return r.db.WithContext(ctx).
		Table(r.tableName).
		Where("id = ?", id).
		Updates(map[string]any{
			"status":      StatusFailed,
			"error":       errMsg,
			"retry_count": gorm.Expr("retry_count + 1"),
			"updated_at":  time.Now().UTC(),
		}).Error
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// MarshalEvent serialises a domain event to JSON for storage in the outbox.
func MarshalEvent(v any) ([]byte, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("outbox: marshal event: %w", err)
	}
	return b, nil
}
