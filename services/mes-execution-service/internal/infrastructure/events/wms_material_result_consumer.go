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

type WMSMaterialResultConsumer struct {
	brokers []string
	pool    *pgxpool.Pool
	cancel  context.CancelFunc
}

func NewWMSMaterialResultConsumer(brokers []string, pool *pgxpool.Pool) *WMSMaterialResultConsumer {
	return &WMSMaterialResultConsumer{brokers: brokers, pool: pool}
}

func (c *WMSMaterialResultConsumer) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     c.brokers,
		GroupID:     "mes-execution-wms-material-results",
		GroupTopics: []string{"WMS.Outbound.MaterialStaged.v1", "WMS.Outbound.MaterialShortageDeclared.v1"},
		StartOffset: kafka.FirstOffset,
	})
	go func() {
		defer reader.Close()
		for {
			msg, err := reader.FetchMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("[WMSMaterialResultConsumer] read error: %v", err)
				continue
			}
			if err := c.apply(ctx, msg.Topic, msg.Value); err != nil {
				log.Printf("[WMSMaterialResultConsumer] apply failed topic=%s: %v", msg.Topic, err)
				continue
			}
			if err := reader.CommitMessages(ctx, msg); err != nil {
				log.Printf("[WMSMaterialResultConsumer] commit failed: %v", err)
			}
		}
	}()
}

func (c *WMSMaterialResultConsumer) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

func (c *WMSMaterialResultConsumer) apply(ctx context.Context, topic string, value []byte) error {
	var env struct {
		EventID   string         `json:"event_id"`
		EventType string         `json:"event_type"`
		Payload   map[string]any `json:"payload"`
	}
	if err := json.Unmarshal(value, &env); err != nil || env.Payload == nil || env.EventID == "" {
		return fmt.Errorf("invalid WMS material result envelope")
	}
	status := "Staged"
	if topic == "WMS.Outbound.MaterialShortageDeclared.v1" {
		status = "Shortage"
	}
	detail, _ := json.Marshal(env.Payload)
	hashBytes := sha256.Sum256(value)
	hash := hex.EncodeToString(hashBytes[:])
	tx, err := c.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	claim, err := tx.Exec(ctx, `INSERT INTO wms_material_result_inbox(event_id,event_type,payload_hash,processing_status) VALUES($1,$2,$3,'PROCESSING') ON CONFLICT(event_id) DO NOTHING`, env.EventID, env.EventType, hash)
	if err != nil {
		return err
	}
	if claim.RowsAffected() == 0 {
		var priorHash, priorStatus string
		if err := tx.QueryRow(ctx, `SELECT payload_hash,processing_status FROM wms_material_result_inbox WHERE event_id=$1 FOR UPDATE`, env.EventID).Scan(&priorHash, &priorStatus); err != nil {
			return err
		}
		if priorHash != hash {
			_, _ = tx.Exec(ctx, `UPDATE wms_material_result_inbox SET processing_status='CONFLICT',last_error='EVENT_ID_PAYLOAD_CONFLICT' WHERE event_id=$1`, env.EventID)
			return tx.Commit(ctx)
		}
		if priorStatus == "PROCESSED" || priorStatus == "CONFLICT" {
			return tx.Commit(ctx)
		}
	}
	_, err = tx.Exec(ctx, `
		UPDATE wo_material_requirement
		SET stock_check_status = $1,
		    stock_check_detail = $2::jsonb
		WHERE requirement_id = ANY($3::uuid[])
		   OR (
		    wo_id = NULLIF($4, '')::uuid
		    AND component_item_revision_id = NULLIF($5, '')::uuid
		    AND COALESCE(issue_operation_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(NULLIF($6, '')::uuid, issue_operation_id, '00000000-0000-0000-0000-000000000000'::uuid)
		   )
	`, status, string(detail), wmsResultStringSlice(env.Payload["requirement_ids"]), stringValue(env.Payload, "wo_id"), stringValue(env.Payload, "item_revision_id"), stringValue(env.Payload, "issue_operation_id"))
	if err != nil {
		_, _ = tx.Exec(ctx, `UPDATE wms_material_result_inbox SET processing_status='FAILED',last_error=$2 WHERE event_id=$1`, env.EventID, err.Error())
		_ = tx.Commit(ctx)
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE wms_material_result_inbox SET processing_status='PROCESSED',processed_at=NOW(),last_error=NULL WHERE event_id=$1`, env.EventID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func wmsResultStringSlice(value any) []string {
	items, ok := value.([]any)
	if !ok {
		if strings, ok := value.([]string); ok {
			return strings
		}
		return []string{}
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if text, ok := item.(string); ok && text != "" {
			out = append(out, text)
		}
	}
	return out
}
