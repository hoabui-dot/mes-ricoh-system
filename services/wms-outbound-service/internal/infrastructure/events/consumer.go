package events

import (
	"context"
	"encoding/json"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/wms-outbound-service/internal/realtime"
	"github.com/segmentio/kafka-go"
)

type Consumer struct {
	brokers []string
	pool    *pgxpool.Pool
	cancel  context.CancelFunc
	hub     *realtime.Hub
}

func NewConsumer(brokers []string, pool *pgxpool.Pool, hub *realtime.Hub) *Consumer {
	return &Consumer{brokers: brokers, pool: pool, hub: hub}
}

func (c *Consumer) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	reader := kafka.NewReader(kafka.ReaderConfig{Brokers: c.brokers, GroupID: "wms-outbound-realtime-group-v2", GroupTopics: []string{"WMS.MasterData.LocationCreated.v1", "WMS.Outbound.MaterialStaged.v1", "WMS.Outbound.MaterialShortageDeclared.v1", "MES.MasterData.ItemRevisionReleased.v2"}, StartOffset: kafka.FirstOffset})
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
			if c.hub != nil && (msg.Topic == "WMS.Outbound.MaterialStaged.v1" || msg.Topic == "WMS.Outbound.MaterialShortageDeclared.v1") {
				c.hub.Broadcast(msg.Value)
			}
			if msg.Topic == "WMS.MasterData.LocationCreated.v1" {
				c.process(ctx, msg.Value)
			}
			if msg.Topic == "MES.MasterData.ItemRevisionReleased.v2" {
				c.processItemRevision(ctx, msg.Value)
			}
		}
	}()
}

func (c *Consumer) processItemRevision(ctx context.Context, value []byte) {
	var env struct {
		Payload map[string]any `json:"payload"`
	}
	if err := json.Unmarshal(value, &env); err != nil || env.Payload == nil {
		return
	}
	p := env.Payload
	id, _ := p["master_id"].(string)
	if id == "" {
		id, _ = p["item_revision_id"].(string)
	}
	code, _ := p["code"].(string)
	name, _ := json.Marshal(p["name"])
	if id == "" || code == "" {
		return
	}
	_, _ = c.pool.Exec(ctx, `INSERT INTO rm_item_revision (item_revision_id, item_code, item_name, updated_at) VALUES ($1, $2, $3::jsonb, NOW()) ON CONFLICT (item_revision_id) DO UPDATE SET item_code=EXCLUDED.item_code, item_name=EXCLUDED.item_name, updated_at=NOW()`, id, code, string(name))
}

func (c *Consumer) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

func (c *Consumer) process(ctx context.Context, value []byte) {
	var env struct {
		Payload map[string]any `json:"payload"`
	}
	if err := json.Unmarshal(value, &env); err != nil || env.Payload == nil {
		return
	}
	p := env.Payload
	id, _ := p["location_id"].(string)
	code, _ := p["location_code"].(string)
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
		INSERT INTO rm_storage_location (location_id, location_code, location_purpose, staging_for_work_center_ref, status, updated_at)
		VALUES ($1, $2, $3, NULLIF($4, '')::uuid, $5, NOW())
		ON CONFLICT (location_id) DO UPDATE
		SET location_code = EXCLUDED.location_code,
		    location_purpose = EXCLUDED.location_purpose,
		    staging_for_work_center_ref = EXCLUDED.staging_for_work_center_ref,
		    status = EXCLUDED.status,
		    updated_at = NOW()
	`, id, code, purpose, stagingRef, status)
}
