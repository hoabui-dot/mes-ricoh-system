package events

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/segmentio/kafka-go"
)

var wmsInventoryTopics = []string{
	"WMS.Inventory.StockReserved.v1",
	"WMS.Inventory.StockAllocated.v1",
	"WMS.Inventory.StockReservationReleased.v1",
	"WMS.Inventory.ReservationConsumed.v1",
	"WMS.Inventory.MaterialIssueRejected.v1",
	"WMS.Inventory.MaterialReturnRejected.v1",
	"WMS.Inventory.MaterialReversalAcknowledged.v1",
	"WMS.Inventory.MaterialScrapAcknowledged.v1",
}

type WMSInventoryResultConsumer struct {
	brokers []string
	pool    *pgxpool.Pool
	cancel  context.CancelFunc
}

func NewWMSInventoryResultConsumer(brokers []string, pool *pgxpool.Pool) *WMSInventoryResultConsumer {
	return &WMSInventoryResultConsumer{brokers: brokers, pool: pool}
}

func (c *WMSInventoryResultConsumer) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	reader := kafka.NewReader(kafka.ReaderConfig{Brokers: c.brokers, GroupID: "mes-execution-wms-inventory-results", GroupTopics: wmsInventoryTopics, StartOffset: kafka.FirstOffset})
	go func() {
		defer reader.Close()
		for {
			msg, err := reader.FetchMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("[WMSInventoryResultConsumer] read error: %v", err)
				continue
			}
			if err := c.apply(ctx, msg.Topic, msg.Value); err != nil {
				log.Printf("[WMSInventoryResultConsumer] apply failed topic=%s: %v", msg.Topic, err)
				continue
			}
			if err := reader.CommitMessages(ctx, msg); err != nil {
				log.Printf("[WMSInventoryResultConsumer] commit failed: %v", err)
			}
		}
	}()
}

func (c *WMSInventoryResultConsumer) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

func (c *WMSInventoryResultConsumer) apply(ctx context.Context, topic string, value []byte) error {
	var env struct {
		EventID   string         `json:"event_id"`
		EventType string         `json:"event_type"`
		Payload   map[string]any `json:"payload"`
	}
	if err := json.Unmarshal(value, &env); err != nil || env.EventID == "" || env.Payload == nil {
		return fmt.Errorf("invalid WMS inventory result envelope")
	}
	hashBytes := sha256.Sum256(value)
	hash := hex.EncodeToString(hashBytes[:])
	tx, err := c.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	claim, err := tx.Exec(ctx, `INSERT INTO wms_inventory_result_inbox(event_id,event_type,payload_hash,processing_status) VALUES($1,$2,$3,'PROCESSING') ON CONFLICT(event_id) DO NOTHING`, env.EventID, env.EventType, hash)
	if err != nil {
		return err
	}
	if claim.RowsAffected() == 0 {
		var priorHash, status string
		if err := tx.QueryRow(ctx, `SELECT payload_hash,processing_status FROM wms_inventory_result_inbox WHERE event_id=$1 FOR UPDATE`, env.EventID).Scan(&priorHash, &status); err != nil {
			return err
		}
		if priorHash != hash {
			_, _ = tx.Exec(ctx, `UPDATE wms_inventory_result_inbox SET processing_status='CONFLICT',last_error='EVENT_ID_PAYLOAD_CONFLICT' WHERE event_id=$1`, env.EventID)
			return tx.Commit(ctx)
		}
		if status == "PROCESSED" || status == "CONFLICT" {
			return tx.Commit(ctx)
		}
	}
	p := env.Payload
	workflowID := firstStringValue(p, "reservation_id", "reservation_ref", "command_id", "request_id")
	if workflowID == "" {
		workflowID = env.EventID
	}
	status := map[string]string{"WMS.Inventory.StockReserved.v1": "RESERVED", "WMS.Inventory.StockAllocated.v1": "ALLOCATED", "WMS.Inventory.StockReservationReleased.v1": "RELEASED", "WMS.Inventory.ReservationConsumed.v1": "CONSUMED"}[topic]
	if status == "" {
		status = "ACKNOWLEDGED"
	}
	reservationID := firstStringValue(p, "reservation_id")
	reservationRef := firstStringValue(p, "reservation_ref")
	itemRevisionID := firstStringValue(p, "item_revision_id")
	_, err = tx.Exec(ctx, `INSERT INTO wo_material_inventory_state(workflow_id,reservation_id,reservation_ref,item_revision_id,qty,status,last_event_id,last_event_type,detail) VALUES(NULLIF($1,'')::uuid,NULLIF($2,'')::uuid,$3,NULLIF($4,'')::uuid,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(workflow_id) DO UPDATE SET reservation_id=EXCLUDED.reservation_id,reservation_ref=EXCLUDED.reservation_ref,item_revision_id=EXCLUDED.item_revision_id,qty=EXCLUDED.qty,status=EXCLUDED.status,last_event_id=EXCLUDED.last_event_id,last_event_type=EXCLUDED.last_event_type,detail=EXCLUDED.detail,updated_at=NOW()`, workflowID, reservationID, reservationRef, itemRevisionID, numericValue(p["qty"]), status, env.EventID, env.EventType, string(value))
	if err != nil {
		_, _ = tx.Exec(ctx, `UPDATE wms_inventory_result_inbox SET processing_status='FAILED',last_error=$2 WHERE event_id=$1`, env.EventID, err.Error())
		_ = tx.Commit(ctx)
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE wms_inventory_result_inbox SET processing_status='PROCESSED',processed_at=NOW(),last_error=NULL WHERE event_id=$1`, env.EventID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func firstStringValue(payload map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := payload[key].(string); ok && value != "" {
			return value
		}
	}
	return ""
}
func numericValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	case json.Number:
		n, _ := typed.Float64()
		return n
	case string:
		var n float64
		_, _ = fmt.Sscan(typed, &n)
		return n
	}
	return 0
}
