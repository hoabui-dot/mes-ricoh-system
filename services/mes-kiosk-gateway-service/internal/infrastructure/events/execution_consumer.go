package events

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/websocket"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
	"github.com/segmentio/kafka-go"
)

type ExecutionConsumer struct {
	brokers []string
	pool    *pgxpool.Pool
	hub     *websocket.Hub
	readers []*kafka.Reader
	wg      sync.WaitGroup
	cancel  context.CancelFunc
}

func NewExecutionConsumer(brokers []string, pool *pgxpool.Pool, hub *websocket.Hub) *ExecutionConsumer {
	return &ExecutionConsumer{
		brokers: brokers,
		pool:    pool,
		hub:     hub,
	}
}

func (c *ExecutionConsumer) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel

	topics := []string{
		"MES.Execution.OperationStarted.v1",
		"MES.Execution.OperationDispatchQueued.v1",
		"MES.Execution.OperationFinished.v1",
		"MES.Execution.WOCompleted.v1",
	}

	for _, topic := range topics {
		reader := kafka.NewReader(kafka.ReaderConfig{
			Brokers:     c.brokers,
			Topic:       topic,
			GroupID:     "mes-kiosk-gateway-service-group",
			MinBytes:    10,
			MaxBytes:    10 * 1024 * 1024,
			MaxWait:     1 * time.Second,
			StartOffset: kafka.LastOffset,
		})
		c.readers = append(c.readers, reader)

		c.wg.Add(1)
		go c.consumeTopic(ctx, reader, topic)
	}

	log.Println("[ExecutionConsumer] Listening for MES.Execution events...")
}

func (c *ExecutionConsumer) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
	for _, reader := range c.readers {
		_ = reader.Close()
	}
	c.wg.Wait()
	log.Println("[ExecutionConsumer] Execution consumer stopped")
}

func (c *ExecutionConsumer) consumeTopic(ctx context.Context, reader *kafka.Reader, topic string) {
	defer c.wg.Done()

	for {
		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[ExecutionConsumer] Read error on %s: %v", topic, err)
			time.Sleep(2 * time.Second)
			continue
		}

		var env sharedkernel.EventEnvelope[map[string]interface{}]
		if err := json.Unmarshal(msg.Value, &env); err != nil {
			log.Printf("[ExecutionConsumer] JSON unmarshal error on %s: %v", topic, err)
			continue
		}

		c.processEvent(ctx, env)
	}
}

func (c *ExecutionConsumer) processEvent(ctx context.Context, env sharedkernel.EventEnvelope[map[string]interface{}]) {
	payload := env.Payload
	opID, _ := payload["wo_operation_id"].(string)
	woID, _ := payload["wo_id"].(string)

	var workCenterID string
	if value, ok := payload["work_center_id"].(string); ok {
		workCenterID = value
	}
	if opID != "" && workCenterID == "" {
		// Resolve work_center_id from operation
		_ = c.pool.QueryRow(ctx, `
			SELECT work_center_id FROM terminal WHERE work_center_id IS NOT NULL LIMIT 1
		`).Scan(&workCenterID)
	}

	if workCenterID == "" {
		// Fallback to broadcasting to standard work center ID
		workCenterID = "40000000-0000-0000-0000-000000000004" // MOLD default
	}

	eventData := map[string]interface{}{
		"event_id":   env.EventID,
		"event_type": env.EventType,
		"wo_id":      woID,
		"payload":    payload,
	}

	if mode, _ := payload["dispatch_mode"].(string); mode == "DEMO_SHARED_KIOSK" {
		terminalCode := os.Getenv("DEMO_KIOSK_TERMINAL_CODE")
		if terminalCode == "" {
			terminalCode = "KIOSK-DEMO-01"
		}
		if err := c.hub.BroadcastToTerminalCode(ctx, terminalCode, env.EventType, eventData); err != nil {
			log.Printf("[ExecutionConsumer] Demo kiosk broadcast error: %v", err)
		}
		return
	}
	if err := c.hub.BroadcastToWorkCenter(ctx, workCenterID, env.EventType, eventData); err != nil {
		log.Printf("[ExecutionConsumer] Broadcast error for event %s: %v", env.EventType, err)
	} else {
		log.Printf("[ExecutionConsumer] Relayed %s to work center %s", env.EventType, workCenterID)
	}
}
