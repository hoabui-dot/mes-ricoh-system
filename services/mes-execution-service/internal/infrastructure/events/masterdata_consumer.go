package events

import (
	"context"
	"encoding/json"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/segmentio/kafka-go"
)

var masterDataTopics = []string{
	"MES.MasterData.ItemRevisionReleased.v2",
	"MES.MasterData.MBOMReleased.v2",
	"MES.MasterData.RoutingReleased.v1",
	"MES.MasterData.ProductionVersionReleased.v1",
	"MES.MasterData.ProductionStandardReleased.v1",
	"MES.MasterData.WorkCenterActivated.v2",
	"MES.MasterData.EquipmentActivated.v2",
	"MES.MasterData.EmployeeCreated.v1",
	"MES.MasterData.ShiftCreated.v1",
	"MES.MasterData.EmployeeScheduleAssigned.v1",
	"MES.MasterData.EmployeeSkillAssigned.v1",
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
		Brokers: c.brokers,
		// Rebuild retained master-data projections after schema enrichment.
		// Replay retained master-data events after adding localized Production Version
		// identity and Item Revision UOM projection fields.
		GroupID:     "mes-execution-readmodel-group-v6",
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

func projectEmployeeSkills(ctx context.Context, pool *pgxpool.Pool, employeeID string, skills []interface{}) {
	if employeeID == "" {
		return
	}
	if _, err := pool.Exec(ctx, `DELETE FROM rm_employee_skill WHERE employee_id = $1`, employeeID); err != nil {
		return
	}
	for _, raw := range skills {
		row, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		skillID, _ := row["skill_id"].(string)
		level, _ := row["level"].(string)
		skillCode, _ := row["code"].(string)
		nameJSON, _ := json.Marshal(row["name"])
		if string(nameJSON) == "null" {
			nameJSON = []byte(`{"vi":""}`)
		}
		if skillID == "" {
			continue
		}
		if _, err := pool.Exec(ctx, `INSERT INTO rm_skill (master_id, code, name, lifecycle_status) VALUES ($1, $2, $3::jsonb, 'Released') ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code, name=EXCLUDED.name, lifecycle_status=EXCLUDED.lifecycle_status`, skillID, skillCode, string(nameJSON)); err != nil {
			continue
		}
		_, _ = pool.Exec(ctx, `INSERT INTO rm_employee_skill (employee_id, skill_id, level) VALUES ($1, $2, $3) ON CONFLICT (employee_id, skill_id) DO UPDATE SET level=EXCLUDED.level`, employeeID, skillID, level)
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
	nameJSON, _ := json.Marshal(p["name"])
	if string(nameJSON) == "null" {
		nameJSON = []byte(`{"vi":""}`)
	}
	siteID, _ := p["site_id"].(string)
	status, _ := p["lifecycle_status"].(string)
	if status == "" {
		status = "Released"
	}

	switch topic {
	case "MES.MasterData.EmployeeCreated.v1":
		defaultWC, _ := p["default_work_center_id"].(string)
		employeeStatus, _ := p["employee_status"].(string)
		if employeeStatus == "" {
			employeeStatus = "Active"
		}
		_, _ = c.pool.Exec(ctx, `INSERT INTO rm_employee (master_id, code, name, site_id, default_work_center_id, employee_status, lifecycle_status) VALUES ($1, $2, $3::jsonb, $4, NULLIF($5, '')::uuid, $6, $7) ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code, name=EXCLUDED.name, site_id=EXCLUDED.site_id, default_work_center_id=EXCLUDED.default_work_center_id, employee_status=EXCLUDED.employee_status, lifecycle_status=EXCLUDED.lifecycle_status`, masterID, code, string(nameJSON), siteID, defaultWC, employeeStatus, status)
		if skills, ok := p["skills"].([]interface{}); ok {
			projectEmployeeSkills(ctx, c.pool, masterID, skills)
		}

	case "MES.MasterData.ShiftCreated.v1":
		// Schedule rows reference the master-data shift UUID directly.

	case "MES.MasterData.EmployeeSkillAssigned.v1":
		log.Printf("[MasterDataConsumer] Processing employee skill assignment event")
		employeeID, _ := p["employee_id"].(string)
		if employeeID == "" {
			return
		}
		if skills, ok := p["skills"].([]interface{}); ok {
			projectEmployeeSkills(ctx, c.pool, employeeID, skills)
		}

	case "MES.MasterData.EmployeeScheduleAssigned.v1":
		employeeIDs, _ := p["employee_ids"].([]interface{})
		shiftID, _ := p["shift_id"].(string)
		workCenterID, _ := p["work_center_id"].(string)
		dateRange, _ := p["date_range"].(map[string]interface{})
		from, _ := dateRange["from"].(string)
		to, _ := dateRange["to"].(string)
		if shiftID == "" || from == "" || to == "" {
			return
		}
		for _, rawEmployeeID := range employeeIDs {
			employeeID, _ := rawEmployeeID.(string)
			if employeeID == "" {
				continue
			}
			_, _ = c.pool.Exec(ctx, `INSERT INTO rm_employee_shift_schedule (schedule_id, employee_id, shift_id, work_center_id, schedule_date, schedule_status) SELECT gen_random_uuid(), $1, $2, NULLIF($3, '')::uuid, d::date, 'Scheduled' FROM generate_series($4::date, $5::date, interval '1 day') d WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5 ON CONFLICT DO NOTHING`, employeeID, shiftID, workCenterID, from, to)
		}

	case "MES.MasterData.ItemRevisionReleased.v2":
		revCode, _ := p["revision_code"].(string)
		itemType, _ := p["item_type"].(string)
		baseUOM, _ := p["base_uom_id"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_item_revision (master_id, code, name, revision_code, item_type, site_id, base_uom_id, lifecycle_status, updated_at)
			VALUES ($1, $2, $3::jsonb, $4, $5, $6, NULLIF($7, '')::uuid, $8, NOW())
			ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code, name=EXCLUDED.name, base_uom_id=EXCLUDED.base_uom_id, lifecycle_status=EXCLUDED.lifecycle_status, updated_at=NOW()
		`, masterID, code, string(nameJSON), revCode, itemType, siteID, baseUOM, status)

	case "MES.MasterData.MBOMReleased.v2":
		baseQty, _ := p["base_quantity"].(float64)
		baseUOM, _ := p["base_uom_id"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_mbom_header (master_id, code, name, site_id, base_quantity, base_uom_id, lifecycle_status, updated_at)
			VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, NOW())
			ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code, name=EXCLUDED.name, lifecycle_status=EXCLUDED.lifecycle_status, updated_at=NOW()
		`, masterID, code, string(nameJSON), siteID, baseQty, baseUOM, status)

	case "MES.MasterData.RoutingReleased.v1":
		log.Printf("[MasterDataConsumer] Projecting routing master_id=%s code=%s", masterID, code)
		itemRevID, _ := p["item_revision_id"].(string)
		if _, err := c.pool.Exec(ctx, `
			INSERT INTO rm_routing_header (master_id, code, item_revision_id, site_id, lifecycle_status, updated_at)
			VALUES ($1, $2, NULLIF($3, '')::uuid, NULLIF($4, '')::uuid, $5, NOW())
			ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code, lifecycle_status=EXCLUDED.lifecycle_status, updated_at=NOW()
		`, masterID, code, itemRevID, siteID, status); err != nil {
			log.Printf("[MasterDataConsumer] Routing projection failed master_id=%s: %v", masterID, err)
		}
		if operations, ok := p["operations"].([]interface{}); ok {
			_, _ = c.pool.Exec(ctx, `DELETE FROM rm_routing_operation WHERE routing_header_id = $1`, masterID)
			for _, raw := range operations {
				op, ok := raw.(map[string]interface{})
				if !ok {
					continue
				}
				operationID, _ := op["operation_id"].(string)
				workCenterID, _ := op["work_center_id"].(string)
				operationCode, _ := op["operation_code"].(string)
				operationMasterID, _ := op["master_id"].(string)
				planningMode, _ := op["planning_mode"].(string)
				resolvedSource, _ := op["resolved_source"].(string)
				workstationID, _ := op["workstation_id"].(string)
				requiresOutputLabel, _ := op["requires_output_label"].(bool)
				unitsPerLabel, _ := op["units_per_label"].(float64)
				labelQuantityMethod, _ := op["label_quantity_method"].(string)
				copiesPerLabel, _ := op["copies_per_label"].(float64)
				if labelQuantityMethod == "" {
					labelQuantityMethod = "CEIL_BY_UNITS_PER_LABEL"
				}
				if copiesPerLabel < 1 {
					copiesPerLabel = 1
				}
				seq, _ := op["seq"].(float64)
				pred, predOK := op["predecessor_seq"].(float64)
				base, _ := op["resolved_base_quantity"].(float64)
				setup, _ := op["resolved_setup_time_min"].(float64)
				cycle, _ := op["resolved_cycle_time_sec"].(float64)
				workers, _ := op["resolved_required_workers"].(float64)
				efficiency, _ := op["resolved_efficiency_factor"].(float64)
				yieldValue, _ := op["resolved_standard_yield"].(float64)
				if operationID == "" || workCenterID == "" || operationMasterID == "" {
					continue
				}
				var predecessor interface{} = nil
				if predOK {
					predecessor = int(pred)
				}
				_, _ = c.pool.Exec(ctx, `INSERT INTO rm_routing_operation (master_id, routing_header_id, operation_id, operation_code, work_center_id, seq, predecessor_seq, planning_mode, resolved_source, resolved_base_quantity, resolved_setup_time_min, resolved_cycle_time_sec, resolved_required_workers, resolved_efficiency_factor, resolved_standard_yield, requires_output_label, workstation_id, units_per_label, label_quantity_method, copies_per_label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NULLIF($17, '')::uuid,NULLIF($18,0),$19,$20) ON CONFLICT (master_id) DO UPDATE SET routing_header_id=EXCLUDED.routing_header_id, operation_id=EXCLUDED.operation_id, operation_code=EXCLUDED.operation_code, work_center_id=EXCLUDED.work_center_id, seq=EXCLUDED.seq, predecessor_seq=EXCLUDED.predecessor_seq, planning_mode=EXCLUDED.planning_mode, resolved_source=EXCLUDED.resolved_source, resolved_base_quantity=EXCLUDED.resolved_base_quantity, resolved_setup_time_min=EXCLUDED.resolved_setup_time_min, resolved_cycle_time_sec=EXCLUDED.resolved_cycle_time_sec, resolved_required_workers=EXCLUDED.resolved_required_workers, resolved_efficiency_factor=EXCLUDED.resolved_efficiency_factor, resolved_standard_yield=EXCLUDED.resolved_standard_yield, requires_output_label=EXCLUDED.requires_output_label, workstation_id=EXCLUDED.workstation_id, units_per_label=EXCLUDED.units_per_label, label_quantity_method=EXCLUDED.label_quantity_method, copies_per_label=EXCLUDED.copies_per_label`, operationMasterID, masterID, operationID, operationCode, workCenterID, int(seq), predecessor, planningMode, resolvedSource, base, setup, cycle, int(workers), efficiency, yieldValue, requiresOutputLabel, workstationID, unitsPerLabel, labelQuantityMethod, int(copiesPerLabel))
			}
		}

	case "MES.MasterData.ProductionVersionReleased.v1":
		itemRevID, _ := p["item_revision_id"].(string)
		mbomID, _ := p["mbom_header_id"].(string)
		routingID, _ := p["routing_header_id"].(string)
		nameI18n, _ := json.Marshal(p["name_i18n"])
		if string(nameI18n) == "null" {
			nameI18n = []byte(`{"vi":"","en":"","ja":"","ko":""}`)
		}
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_production_version (master_id, code, name_i18n, item_revision_id, mbom_header_id, routing_header_id, site_id, lifecycle_status, is_default, updated_at)
			VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, true, NOW())
			ON CONFLICT (master_id) DO UPDATE SET code=EXCLUDED.code, name_i18n=EXCLUDED.name_i18n, lifecycle_status=EXCLUDED.lifecycle_status, updated_at=NOW()
		`, masterID, code, string(nameI18n), itemRevID, mbomID, routingID, siteID, status)

	case "MES.MasterData.ProductionStandardReleased.v1":
		itemRevID, _ := p["item_revision_id"].(string)
		opID, _ := p["operation_id"].(string)
		wcID, _ := p["work_center_id"].(string)
		setup, _ := p["setup_time_min"].(float64)
		cycle, _ := p["cycle_time_sec"].(float64)
		eff, _ := p["efficiency_factor"].(float64)
		base, _ := p["base_quantity"].(float64)
		yld, _ := p["standard_yield"].(float64)
		labor, _ := p["labor_count"].(float64)
		routingOperationID, _ := p["routing_operation_id"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_production_standard (master_id, item_revision_id, operation_id, work_center_id, setup_time_min, cycle_time_sec, efficiency_factor, routing_operation_id, base_quantity, standard_yield, labor_count, lifecycle_status)
			VALUES ($1, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7, NULLIF($8, '')::uuid, COALESCE(NULLIF($9, 0), 1), COALESCE(NULLIF($10, 0), 1), COALESCE(NULLIF($11, 0), 1), $12)
			ON CONFLICT (master_id) DO UPDATE SET item_revision_id=EXCLUDED.item_revision_id, routing_operation_id=EXCLUDED.routing_operation_id, base_quantity=EXCLUDED.base_quantity, standard_yield=EXCLUDED.standard_yield, labor_count=EXCLUDED.labor_count, setup_time_min=EXCLUDED.setup_time_min, cycle_time_sec=EXCLUDED.cycle_time_sec, efficiency_factor=EXCLUDED.efficiency_factor, lifecycle_status=EXCLUDED.lifecycle_status
		`, masterID, itemRevID, opID, wcID, setup, cycle, eff, routingOperationID, base, yld, labor, status)

	case "MES.MasterData.WorkCenterActivated.v2":
		areaID, _ := p["area_id"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_work_center (master_id, code, name, site_id, area_id, active_flag, lifecycle_status)
			VALUES ($1, $2, $3::jsonb, $4, $5, true, $6)
			ON CONFLICT (master_id) DO UPDATE SET name=EXCLUDED.name, lifecycle_status=EXCLUDED.lifecycle_status
		`, masterID, code, string(nameJSON), siteID, areaID, status)

	case "MES.MasterData.EquipmentActivated.v2":
		wcID, _ := p["work_center_id"].(string)
		eqType, _ := p["equipment_type"].(string)
		_, _ = c.pool.Exec(ctx, `
			INSERT INTO rm_equipment (master_id, code, name, site_id, work_center_id, equipment_type, active_flag, lifecycle_status)
			VALUES ($1, $2, $3::jsonb, $4, $5, $6, true, $7)
			ON CONFLICT (master_id) DO UPDATE SET name=EXCLUDED.name, lifecycle_status=EXCLUDED.lifecycle_status
		`, masterID, code, string(nameJSON), siteID, wcID, eqType, status)
	}
}
