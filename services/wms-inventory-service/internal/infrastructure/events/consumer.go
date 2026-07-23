package events

import (
	"context"
	"encoding/json"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/wms-inventory-service/internal/application/usecase"
	"github.com/segmentio/kafka-go"
)

var topics = []string{
	"MES.MasterData.ItemRevisionReleased.v2",
	"WMS.MasterData.LocationCreated.v1",
	"MES.Execution.MaterialConsumed.v1",
}

type Consumer struct {
	brokers []string
	pool    *pgxpool.Pool
	cancel  context.CancelFunc
}

func NewConsumer(brokers []string, pool *pgxpool.Pool) *Consumer {
	return &Consumer{brokers: brokers, pool: pool}
}

func (c *Consumer) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	reader := kafka.NewReader(kafka.ReaderConfig{Brokers: c.brokers, GroupID: "wms-inventory-readmodel-group", GroupTopics: topics, StartOffset: kafka.FirstOffset})
	go func() {
		defer reader.Close()
		for {
			msg, err := reader.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("[Consumer] read error: %v", err)
				continue
			}
			c.process(ctx, msg.Topic, msg.Value)
		}
	}()
}

func (c *Consumer) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

func (c *Consumer) process(ctx context.Context, topic string, value []byte) {
	var env struct {
		Payload map[string]any `json:"payload"`
	}
	if err := json.Unmarshal(value, &env); err != nil || env.Payload == nil {
		return
	}
	p := env.Payload
	switch topic {
	case "MES.MasterData.ItemRevisionReleased.v2":
		id, _ := firstString(p, "master_id", "item_revision_id")
		code, _ := p["code"].(string)
		name, _ := json.Marshal(p["name"])
		if string(name) == "null" {
			name = []byte(`{"vi":""}`)
		}
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_item_revision (item_revision_id, item_code, item_name, updated_at)
			VALUES ($1, $2, $3::jsonb, NOW())
			ON CONFLICT (item_revision_id) DO UPDATE SET item_code = EXCLUDED.item_code, item_name = EXCLUDED.item_name, updated_at = NOW()
		`, id, code, string(name))
	case "WMS.MasterData.LocationCreated.v1":
		id, _ := p["location_id"].(string)
		code, _ := p["location_code"].(string)
		name, _ := json.Marshal(p["location_name"])
		purpose, _ := p["location_purpose"].(string)
		if purpose == "" {
			purpose = "Storage"
		}
		stagingRef, _ := p["staging_for_work_center_ref"].(string)
		status, _ := p["status"].(string)
		if status == "" {
			status = "Active"
		}
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_storage_location (location_id, location_code, location_name, location_purpose, staging_for_work_center_ref, status, updated_at)
			VALUES ($1, $2, $3::jsonb, $4, NULLIF($5, '')::uuid, $6, NOW())
			ON CONFLICT (location_id) DO UPDATE
			SET location_code = EXCLUDED.location_code,
			    location_name = EXCLUDED.location_name,
			    location_purpose = EXCLUDED.location_purpose,
			    staging_for_work_center_ref = EXCLUDED.staging_for_work_center_ref,
			    status = EXCLUDED.status,
			    updated_at = NOW()
		`, id, code, string(name), purpose, stagingRef, status)
	case "MES.Execution.MaterialConsumed.v1":
		itemID, _ := firstString(p, "component_revision_id", "component_item_revision_id", "item_revision_id")
		wcID, _ := firstString(p, "work_center_id", "work_center_ref")
		woID, _ := p["wo_id"].(string)
		qty, _ := p["qty_consumed"].(float64)
		var locationID string
		if err := c.pool.QueryRow(ctx, `SELECT location_id FROM rm_storage_location WHERE location_purpose = 'WorkCenterStaging' AND staging_for_work_center_ref = $1`, wcID).Scan(&locationID); err != nil {
			log.Printf("[Consumer] no staging location for consumed material work_center=%s: %v", wcID, err)
			return
		}
		if err := usecase.ConsumeFromStaging(ctx, c.pool, itemID, locationID, woID, wcID, qty); err != nil {
			log.Printf("[Consumer] material consumption failed: %v", err)
		}
	}
}

func firstString(p map[string]any, keys ...string) (string, bool) {
	for _, key := range keys {
		if value, ok := p[key].(string); ok && value != "" {
			return value, true
		}
	}
	return "", false
}
