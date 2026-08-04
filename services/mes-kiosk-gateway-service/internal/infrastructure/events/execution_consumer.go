package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
	"github.com/segmentio/kafka-go"
)

var executionTopics = []string{
	"MES.Execution.OperationDispatchQueued.v1",
	"MES.Execution.OperationStarted.v1",
	"MES.Execution.OperationFinished.v1",
	"MES.Execution.OperationFailed.v1",
	"MES.Execution.OperationAborted.v1",
	"MES.Execution.OperationRetryRequested.v1",
	"MES.Execution.WOStatusChanged.v1",
	"MES.Execution.WOCompleted.v1",
}

type RelayHub interface {
	BroadcastToTerminalCode(context.Context, string, string, string, interface{}) error
	BroadcastToWorkCenters(context.Context, []string, string, string, interface{}) error
}

type ExecutionConsumer struct {
	brokers []string
	pool    *pgxpool.Pool
	hub     RelayHub
	readers []*kafka.Reader
	wg      sync.WaitGroup
	cancel  context.CancelFunc
}

func NewExecutionConsumer(brokers []string, pool *pgxpool.Pool, hub RelayHub) *ExecutionConsumer {
	return &ExecutionConsumer{brokers: brokers, pool: pool, hub: hub}
}

func (c *ExecutionConsumer) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	for _, topic := range executionTopics {
		reader := kafka.NewReader(kafka.ReaderConfig{
			Brokers: c.brokers, Topic: topic, GroupID: "mes-kiosk-gateway-service-group",
			MinBytes: 10, MaxBytes: 10 * 1024 * 1024, MaxWait: time.Second,
			StartOffset: kafka.LastOffset,
		})
		c.readers = append(c.readers, reader)
		c.wg.Add(1)
		go c.consumeTopic(ctx, reader, topic)
	}
	log.Printf("[ExecutionConsumer] listening on %d MES execution topics", len(executionTopics))
}

func (c *ExecutionConsumer) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
	for _, reader := range c.readers {
		_ = reader.Close()
	}
	c.wg.Wait()
}

func (c *ExecutionConsumer) consumeTopic(ctx context.Context, reader *kafka.Reader, topic string) {
	defer c.wg.Done()
	for {
		message, err := reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[ExecutionConsumer] fetch error on %s: %v", topic, err)
			time.Sleep(2 * time.Second)
			continue
		}
		var envelope sharedkernel.EventEnvelope[map[string]interface{}]
		if err := json.Unmarshal(message.Value, &envelope); err != nil {
			log.Printf("[ExecutionConsumer] discarding malformed event on %s: %v", topic, err)
			_ = reader.CommitMessages(ctx, message)
			continue
		}
		if err := c.processEvent(ctx, envelope); err != nil {
			log.Printf("[ExecutionConsumer] relay failed event=%s type=%s: %v", envelope.EventID, envelope.EventType, err)
			time.Sleep(time.Second)
			continue
		}
		if err := reader.CommitMessages(ctx, message); err != nil && ctx.Err() == nil {
			log.Printf("[ExecutionConsumer] commit failed event=%s: %v", envelope.EventID, err)
		}
	}
}

func (c *ExecutionConsumer) processEvent(ctx context.Context, envelope sharedkernel.EventEnvelope[map[string]interface{}]) error {
	if envelope.EventID == "" || envelope.EventType == "" {
		return fmt.Errorf("event_id and event_type are required")
	}
	claimed, err := c.claimEvent(ctx, envelope.EventID, envelope.EventType)
	if err != nil || !claimed {
		return err
	}

	payload := envelope.Payload
	if envelope.EventType == "MES.Execution.OperationDispatchQueued.v1" && stringField(payload, "execution_target_type") == "PRINT_STATION" {
		return c.markProcessed(ctx, envelope.EventID)
	}
	eventData := map[string]interface{}{
		"event_id": envelope.EventID, "event_type": envelope.EventType,
		"wo_id": stringField(payload, "wo_id"), "payload": payload,
	}

	dispatchMode := stringField(payload, "dispatch_mode")
	if dispatchMode == "DEMO_SHARED_KIOSK" {
		terminalCode := os.Getenv("DEMO_KIOSK_TERMINAL_CODE")
		if terminalCode == "" {
			terminalCode = "KIOSK-DEMO-01"
		}
		err = c.hub.BroadcastToTerminalCode(ctx, terminalCode, envelope.EventID, envelope.EventType, eventData)
	} else {
		workCenterIDs := stringSliceField(payload, "work_center_ids")
		if workCenterID := stringField(payload, "work_center_id"); workCenterID != "" {
			workCenterIDs = append(workCenterIDs, workCenterID)
		}
		if len(workCenterIDs) == 0 {
			err = fmt.Errorf("production event has no work_center_id")
		} else {
			err = c.hub.BroadcastToWorkCenters(ctx, workCenterIDs, envelope.EventID, envelope.EventType, eventData)
		}
	}
	if err != nil {
		_, _ = c.pool.Exec(ctx, `UPDATE consumed_execution_event SET status='FAILED',error_message=$2 WHERE event_id=$1`, envelope.EventID, err.Error())
		return err
	}
	return c.markProcessed(ctx, envelope.EventID)
}

func (c *ExecutionConsumer) claimEvent(ctx context.Context, eventID, eventType string) (bool, error) {
	tag, err := c.pool.Exec(ctx, `
		INSERT INTO consumed_execution_event(event_id,event_type,status)
		VALUES($1,$2,'PROCESSING') ON CONFLICT(event_id) DO NOTHING
	`, eventID, eventType)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 1 {
		return true, nil
	}
	var status string
	if err := c.pool.QueryRow(ctx, `SELECT status FROM consumed_execution_event WHERE event_id=$1`, eventID).Scan(&status); err != nil {
		return false, err
	}
	if status == "PROCESSED" || status == "PROCESSING" {
		return false, nil
	}
	tag, err = c.pool.Exec(ctx, `UPDATE consumed_execution_event SET status='PROCESSING',error_message=NULL WHERE event_id=$1 AND status='FAILED'`, eventID)
	return tag.RowsAffected() == 1, err
}

func (c *ExecutionConsumer) markProcessed(ctx context.Context, eventID string) error {
	_, err := c.pool.Exec(ctx, `UPDATE consumed_execution_event SET status='PROCESSED',processed_at=NOW(),error_message=NULL WHERE event_id=$1`, eventID)
	return err
}

func stringField(payload map[string]interface{}, name string) string {
	value, _ := payload[name].(string)
	return value
}

func stringSliceField(payload map[string]interface{}, name string) []string {
	value, ok := payload[name]
	if !ok {
		return nil
	}
	if strings, ok := value.([]string); ok {
		return strings
	}
	items, ok := value.([]interface{})
	if !ok {
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if value, ok := item.(string); ok && value != "" {
			result = append(result, value)
		}
	}
	return result
}
