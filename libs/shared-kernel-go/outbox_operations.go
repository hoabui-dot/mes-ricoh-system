package sharedkernel

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type OutboxMetrics struct {
	Pending int64
	Failed int64
	OldestPendingAgeSeconds float64
}

func ReadOutboxMetrics(ctx context.Context, pool *pgxpool.Pool) (OutboxMetrics, error) {
	var metrics OutboxMetrics
	err := pool.QueryRow(ctx, `SELECT COUNT(*) FILTER (WHERE status='PENDING'), COUNT(*) FILTER (WHERE status='FAILED'), COALESCE(EXTRACT(EPOCH FROM (NOW()-MIN(created_at) FILTER (WHERE status='PENDING'))),0) FROM outbox_events`).Scan(&metrics.Pending, &metrics.Failed, &metrics.OldestPendingAgeSeconds)
	return metrics, err
}

func ReplayOutboxEvent(ctx context.Context, pool *pgxpool.Pool, eventID string) error {
	tx, err := pool.Begin(ctx)
	if err != nil { return err }
	defer tx.Rollback(ctx)
	var eventType, topic string
	var payload []byte
	if err := tx.QueryRow(ctx, `SELECT event_type,topic,payload FROM outbox_dead_letters WHERE event_id=$1 FOR UPDATE`, eventID).Scan(&eventType, &topic, &payload); err != nil { return fmt.Errorf("outbox dead letter %s not found: %w", eventID, err) }
	if _, err := tx.Exec(ctx, `INSERT INTO outbox_events (id,event_type,topic,payload,status,retry_count,error_message,published_at) VALUES ($1,$2,$3,$4,'PENDING',0,NULL,NULL) ON CONFLICT (id) DO UPDATE SET status='PENDING',retry_count=0,error_message=NULL,published_at=NULL`, eventID,eventType,topic,payload); err != nil { return err }
	if _, err := tx.Exec(ctx, `UPDATE outbox_dead_letters SET replayed_at=NOW(),replay_count=replay_count+1 WHERE event_id=$1`, eventID); err != nil { return err }
	return tx.Commit(ctx)
}
