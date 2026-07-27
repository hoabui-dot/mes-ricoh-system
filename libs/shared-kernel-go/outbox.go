package sharedkernel

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/segmentio/kafka-go"
)

type OutboxRelayConfig struct {
	Pool           *pgxpool.Pool
	Brokers        []string
	ClientID       string
	PollIntervalMs int
	BatchSize      int
	MaxRetries     int
}

type OutboxRelayWorker struct {
	cfg    OutboxRelayConfig
	writer *kafka.Writer
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func NewOutboxRelayWorker(cfg OutboxRelayConfig) *OutboxRelayWorker {
	if cfg.PollIntervalMs <= 0 {
		cfg.PollIntervalMs = 1000
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 50
	}
	if cfg.MaxRetries <= 0 {
		cfg.MaxRetries = 3
	}
	writer := &kafka.Writer{
		Addr:         kafka.TCP(cfg.Brokers...),
		Balancer:     &kafka.LeastBytes{},
		RequiredAcks: kafka.RequireAll,
		Async:        false,
	}
	return &OutboxRelayWorker{
		cfg:    cfg,
		writer: writer,
	}
}

func (w *OutboxRelayWorker) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	w.cancel = cancel
	w.wg.Add(1)

	go func() {
		defer w.wg.Done()
		ticker := time.NewTicker(time.Duration(w.cfg.PollIntervalMs) * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := w.pollAndPublish(ctx); err != nil {
					log.Printf("[OutboxRelayWorker] Poll error: %v", err)
				}
			}
		}
	}()
	log.Printf("[OutboxRelayWorker] Started outbox relay worker for client: %s", w.cfg.ClientID)
}

func (w *OutboxRelayWorker) Stop() {
	if w.cancel != nil {
		w.cancel()
	}
	w.wg.Wait()
	if err := w.writer.Close(); err != nil {
		log.Printf("[OutboxRelayWorker] Error closing Kafka writer: %v", err)
	}
	log.Printf("[OutboxRelayWorker] Stopped outbox relay worker")
}

type OutboxRow struct {
	ID         string
	EventType  string
	Topic      string
	Payload    []byte
	RetryCount int
}

// Logical event names are kept in domain outboxes, while station-agent Kafka
// uses stable physical topics. Keep the mapping in the shared relay so every
// MES service publishes printer commands to the same remote edge topic.
func kafkaTopic(logicalTopic string) string {
	switch logicalTopic {
	case "command.printer.print", "command.printer.print.batch":
		return "station.commands.printer"
	default:
		return logicalTopic
	}
}

func (w *OutboxRelayWorker) pollAndPublish(ctx context.Context) error {
	tx, err := w.cfg.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT id, event_type, topic, payload, retry_count
		FROM outbox_events
		WHERE status = 'PENDING'
		ORDER BY created_at ASC
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	`, w.cfg.BatchSize)
	if err != nil {
		return err
	}
	defer rows.Close()

	var events []OutboxRow
	for rows.Next() {
		var row OutboxRow
		if err := rows.Scan(&row.ID, &row.EventType, &row.Topic, &row.Payload, &row.RetryCount); err != nil {
			return err
		}
		events = append(events, row)
	}
	rows.Close()

	if len(events) == 0 {
		return tx.Commit(ctx)
	}

	for _, evt := range events {
		msg := kafka.Message{
			Topic: kafkaTopic(evt.Topic),
			Key:   []byte(evt.ID),
			Value: evt.Payload,
			Headers: []kafka.Header{{
				// Station Agent consumers route logical printer commands from
				// this header while the physical Kafka topic is shared.
				Key: "event-type", Value: []byte(evt.Topic),
			}},
		}
		if err := w.writer.WriteMessages(ctx, msg); err != nil {
			newRetry := evt.RetryCount + 1
			newStatus := "PENDING"
			if newRetry >= w.cfg.MaxRetries {
				newStatus = "FAILED"
			}
			_, _ = tx.Exec(ctx, `
				UPDATE outbox_events
				SET retry_count = $1, status = $2, error_message = $3
				WHERE id = $4
			`, newRetry, newStatus, err.Error(), evt.ID)
		} else {
			_, _ = tx.Exec(ctx, `
				UPDATE outbox_events
				SET status = 'PUBLISHED', published_at = NOW()
				WHERE id = $1
			`, evt.ID)
		}
	}

	return tx.Commit(ctx)
}

type Execable interface {
	Exec(ctx context.Context, sql string, arguments ...any) (commandTag pgconn.CommandTag, err error)
}

func WriteToOutbox(ctx context.Context, tx Execable, topic string, envelope interface{}) error {
	payloadBytes, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("failed to marshal outbox envelope: %w", err)
	}
	typeGetter, ok := envelope.(interface{ GetEventType() string })
	eventType := "UNKNOWN"
	if ok {
		eventType = typeGetter.GetEventType()
	} else {
		var m map[string]interface{}
		if err := json.Unmarshal(payloadBytes, &m); err == nil {
			if et, ok := m["event_type"].(string); ok {
				eventType = et
			}
		}
	}

	idGetter, ok := envelope.(interface{ GetEventID() string })
	eventID := ""
	if ok {
		eventID = idGetter.GetEventID()
	} else {
		var m map[string]interface{}
		if err := json.Unmarshal(payloadBytes, &m); err == nil {
			if id, ok := m["event_id"].(string); ok {
				eventID = id
			}
		}
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_events (id, event_type, topic, payload, status)
		VALUES ($1, $2, $3, $4, 'PENDING')
	`, eventID, eventType, topic, payloadBytes)
	return err
}
