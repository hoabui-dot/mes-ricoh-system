package events

import (
	"context"
	"encoding/json"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/segmentio/kafka-go"
)

var masterDataTopics = []string{
	"MES.MasterData.ItemRevisionReleased.v1",
	"MES.MasterData.MBOMReleased.v1",
	"MES.MasterData.RoutingReleased.v1",
	"MES.MasterData.ProductionVersionReleased.v1",
	"MES.MasterData.ProductionStandardReleased.v1",
	"MES.MasterData.WorkCenterActivated.v1",
	"MES.MasterData.EquipmentActivated.v1",
}

type MasterDataConsumer struct {
	brokers []string
	pool    *pgxpool.Pool
	cancel  context.CancelFunc
}

func NewMasterDataConsumer(brokers []string, pool *pgxpool.Pool) *MasterDataConsumer {
	return &MasterDataConsumer{brokers: brokers, pool: pool}
}

func (c *MasterDataConsumer) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel

	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     c.brokers,
		GroupID:     "mes-execution-readmodel-group",
		GroupTopics: masterDataTopics,
		StartOffset: kafka.FirstOffset,
	})

	go func() {
		defer r.Close()
		log.Printf("[MasterDataConsumer] Listening for MES.MasterData events...")
		for {
			m, err := r.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("[MasterDataConsumer] Read error: %v", err)
				continue
			}
			c.processMessage(ctx, m.Topic, m.Value)
		}
	}()
}

func (c *MasterDataConsumer) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

func (c *MasterDataConsumer) processMessage(ctx context.Context, topic string, value []byte) {
	var env struct {
		Payload map[string]interface{} `json:"payload"`
	}
	if err := json.Unmarshal(value, &env); err != nil || env.Payload == nil {
		return
	}
	p := env.Payload
	masterID, _ := p["master_id"].(string)
	code, _ := p["code"].(string)
	siteID, _ := p["site_id"].(string)
	status, _ := p["lifecycle_status"].(string)
	if status == "" {
		status = "Released"
	}

	switch topic {
	case "MES.MasterData.ItemRevisionReleased.v1":
		revCode, _ := p["revision_code"].(string)
		itemType, _ := p["item_type"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_item_revision (master_id, code, revision_code, item_type, site_id, lifecycle_status, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, NOW())
			ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code, lifecycle_status=EXCLUDED.lifecycle_status, updated_at=NOW()
		`, masterID, code, revCode, itemType, siteID, status)

	case "MES.MasterData.MBOMReleased.v1":
		itemRevID, _ := p["item_revision_id"].(string)
		baseQty, _ := p["base_quantity"].(float64)
		baseUOM, _ := p["base_uom_id"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_mbom_header (master_id, code, item_revision_id, site_id, base_quantity, base_uom_id, lifecycle_status, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
			ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code, lifecycle_status=EXCLUDED.lifecycle_status, updated_at=NOW()
		`, masterID, code, itemRevID, siteID, baseQty, baseUOM, status)

	case "MES.MasterData.RoutingReleased.v1":
		itemRevID, _ := p["item_revision_id"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_routing_header (master_id, code, item_revision_id, site_id, lifecycle_status, updated_at)
			VALUES ($1, $2, $3, $4, $5, NOW())
			ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code, lifecycle_status=EXCLUDED.lifecycle_status, updated_at=NOW()
		`, masterID, code, itemRevID, siteID, status)

	case "MES.MasterData.ProductionVersionReleased.v1":
		itemRevID, _ := p["item_revision_id"].(string)
		mbomID, _ := p["mbom_header_id"].(string)
		routingID, _ := p["routing_header_id"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_production_version (master_id, code, item_revision_id, mbom_header_id, routing_header_id, site_id, lifecycle_status, is_default, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
			ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code, lifecycle_status=EXCLUDED.lifecycle_status, updated_at=NOW()
		`, masterID, code, itemRevID, mbomID, routingID, siteID, status)

	case "MES.MasterData.ProductionStandardReleased.v1":
		itemRevID, _ := p["item_revision_id"].(string)
		opID, _ := p["operation_id"].(string)
		wcID, _ := p["work_center_id"].(string)
		setup, _ := p["setup_time_min"].(float64)
		cycle, _ := p["cycle_time_sec"].(float64)
		eff, _ := p["efficiency_factor"].(float64)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_production_standard (master_id, item_revision_id, operation_id, work_center_id, setup_time_min, cycle_time_sec, efficiency_factor, lifecycle_status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (master_id) DO UPDATE SET lifecycle_status=EXCLUDED.lifecycle_status
		`, masterID, itemRevID, opID, wcID, setup, cycle, eff, status)

	case "MES.MasterData.WorkCenterActivated.v1":
		areaID, _ := p["area_id"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_work_center (master_id, code, site_id, area_id, active_flag, lifecycle_status)
			VALUES ($1, $2, $3, $4, true, $5)
			ON CONFLICT (master_id) DO UPDATE SET lifecycle_status=EXCLUDED.lifecycle_status
		`, masterID, code, siteID, areaID, status)

	case "MES.MasterData.EquipmentActivated.v1":
		wcID, _ := p["work_center_id"].(string)
		eqType, _ := p["equipment_type"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_equipment (master_id, code, site_id, work_center_id, equipment_type, active_flag, lifecycle_status)
			VALUES ($1, $2, $3, $4, $5, true, $6)
			ON CONFLICT (master_id) DO UPDATE SET lifecycle_status=EXCLUDED.lifecycle_status
		`, masterID, code, siteID, wcID, eqType, status)
	}
}
