package events

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/segmentio/kafka-go"
	"github.com/mom-platform/shared-kernel-go"
)

type MasterDataConsumer struct {
	brokers []string
	pool    *pgxpool.Pool
}

func NewMasterDataConsumer(brokers []string, pool *pgxpool.Pool) *MasterDataConsumer {
	return &MasterDataConsumer{
		brokers: brokers,
		pool:    pool,
	}
}

func (c *MasterDataConsumer) Start(ctx context.Context) {
	topics := []string{
		"MES.MasterData.ItemRevisionReleased.v1",
		"MES.MasterData.MBOMReleased.v1",
	}

	for _, topic := range topics {
		go c.consumeTopic(ctx, topic)
	}
}

func (c *MasterDataConsumer) consumeTopic(ctx context.Context, topic string) {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  c.brokers,
		Topic:    topic,
		GroupID:  "mes-traceability-service-group",
		MinBytes: 10,
		MaxBytes: 10 * 1024 * 1024,
	})
	defer reader.Close()

	log.Printf("[MasterDataConsumer] Started consuming topic: %s", topic)

	for {
		select {
		case <-ctx.Done():
			return
		default:
			msg, err := reader.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("[MasterDataConsumer] Error reading message from %s: %v", topic, err)
				time.Sleep(1 * time.Second)
				continue
			}

			var env sharedkernel.EventEnvelope[map[string]interface{}]
			if err := json.Unmarshal(msg.Value, &env); err != nil {
				log.Printf("[MasterDataConsumer] Error unmarshalling envelope from %s: %v", topic, err)
				continue
			}

			if err := c.handleEvent(ctx, env.EventType, env.Payload); err != nil {
				log.Printf("[MasterDataConsumer] Error handling event %s: %v", env.EventType, err)
			}
		}
	}
}

func (c *MasterDataConsumer) handleEvent(ctx context.Context, eventType string, payload map[string]interface{}) error {
	switch eventType {
	case "MES.MasterData.ItemRevisionReleased.v1":
		return c.syncItemRevision(ctx, payload)
	case "MES.MasterData.MBOMReleased.v1":
		return c.syncMBOMHeader(ctx, payload)
	}
	return nil
}

func (c *MasterDataConsumer) syncItemRevision(ctx context.Context, payload map[string]interface{}) error {
	masterID, _ := payload["master_id"].(string)
	code, _ := payload["code"].(string)
	revisionCode, _ := payload["revision_code"].(string)
	itemType, _ := payload["item_type"].(string)
	siteID, _ := payload["site_id"].(string)
	lifecycleStatus, _ := payload["lifecycle_status"].(string)

	query := `
		INSERT INTO rm_item_revision (master_id, code, revision_code, item_type, site_id, lifecycle_status, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (master_id) DO UPDATE SET
			code = EXCLUDED.code,
			revision_code = EXCLUDED.revision_code,
			item_type = EXCLUDED.item_type,
			site_id = EXCLUDED.site_id,
			lifecycle_status = EXCLUDED.lifecycle_status,
			updated_at = now()
	`
	_, err := c.pool.Exec(ctx, query, masterID, code, revisionCode, itemType, siteID, lifecycleStatus)
	return err
}

func (c *MasterDataConsumer) syncMBOMHeader(ctx context.Context, payload map[string]interface{}) error {
	masterID, _ := payload["master_id"].(string)
	code, _ := payload["code"].(string)
	itemRevID, _ := payload["item_revision_id"].(string)
	siteID, _ := payload["site_id"].(string)
	baseQty, _ := payload["base_quantity"].(float64)
	baseUomID, _ := payload["base_uom_id"].(string)
	status, _ := payload["lifecycle_status"].(string)

	query := `
		INSERT INTO rm_mbom_header (master_id, code, item_revision_id, site_id, base_quantity, base_uom_id, lifecycle_status, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (master_id) DO UPDATE SET
			code = EXCLUDED.code,
			item_revision_id = EXCLUDED.item_revision_id,
			site_id = EXCLUDED.site_id,
			base_quantity = EXCLUDED.base_quantity,
			base_uom_id = EXCLUDED.base_uom_id,
			lifecycle_status = EXCLUDED.lifecycle_status,
			updated_at = now()
	`
	_, err := c.pool.Exec(ctx, query, masterID, code, itemRevID, siteID, baseQty, baseUomID, status)
	return err
}
