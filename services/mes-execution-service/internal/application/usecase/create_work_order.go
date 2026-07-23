package usecase

import (
	"context"
	"fmt"
	"log"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type CreateWOInput struct {
	ItemRevisionID string
	ItemCode       string
	ItemName       string
	Quantity       float64
	UOMID          string
	SiteID         string
	PlannedStartAt string
	PlannedEndAt   string
	UserID         string
	TraceID        string
}

func CreateWorkOrder(ctx context.Context, pool *pgxpool.Pool, input CreateWOInput) (map[string]interface{}, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.UserID); err != nil {
		return nil, fmt.Errorf("failed to set_config: %w", err)
	}

	var pvID, mbomHeaderID, routingHeaderID string
	err = tx.QueryRow(ctx, `
		SELECT master_id, mbom_header_id, routing_header_id
		FROM rm_production_version
		WHERE item_revision_id = $1 AND site_id = $2
		LIMIT 1
	`, input.ItemRevisionID, input.SiteID).Scan(&pvID, &mbomHeaderID, &routingHeaderID)
	if err != nil {
		return nil, fmt.Errorf("no Production Version found for Item %s at Site %s: %w", input.ItemCode, input.SiteID, err)
	}

	var seq int
	_, _ = tx.Exec(ctx, `CREATE SEQUENCE IF NOT EXISTS wo_code_seq START 1000`)
	if err := tx.QueryRow(ctx, `SELECT nextval('wo_code_seq')`).Scan(&seq); err != nil {
		seq = 1001
	}
	woCode := fmt.Sprintf("WO-%d", seq)

	var woID, createdBy string
	err = tx.QueryRow(ctx, `
		INSERT INTO wo_header (
			wo_code, production_version_id, item_revision_id, item_code, item_name, quantity, uom_id, site_id,
			planned_start_at, planned_end_at, status, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Draft', $11)
		RETURNING wo_id, created_by
	`, woCode, pvID, input.ItemRevisionID, input.ItemCode, input.ItemName, input.Quantity, input.UOMID, input.SiteID, input.PlannedStartAt, input.PlannedEndAt, input.UserID).Scan(&woID, &createdBy)
	if err != nil {
		return nil, fmt.Errorf("failed to insert wo_header: %w", err)
	}

	// Explode MBOM lines (including phantom nodes)
	mbomRows, err := tx.Query(ctx, `
		SELECT master_id, component_revision_id, component_item_code, quantity_per::text, uom_id, scrap_rate::text, issue_operation_id, backflush_flag, phantom_flag
		FROM rm_mbom_line WHERE mbom_header_id = $1
	`, mbomHeaderID)
	if err != nil {
		log.Printf("[CreateWO] Query mbom lines error: %v", err)
	} else {
		type lineStruct struct {
			masterID, compRevID, compCode, uomID, issueOpID *string
			qtyPerStr, scrapRateStr                         string
			backflush, phantom                              bool
		}
		var lines []lineStruct
		for mbomRows.Next() {
			var l lineStruct
			if err := mbomRows.Scan(&l.masterID, &l.compRevID, &l.compCode, &l.qtyPerStr, &l.uomID, &l.scrapRateStr, &l.issueOpID, &l.backflush, &l.phantom); err != nil {
				log.Printf("[CreateWO] Scan mbom line error: %v", err)
				continue
			}
			lines = append(lines, l)
		}
		mbomRows.Close()

		for _, l := range lines {
			compCode := "COMPONENT"
			if l.compCode != nil {
				compCode = *l.compCode
			}
			qtyPer, _ := strconv.ParseFloat(l.qtyPerStr, 64)
			scrapRate, _ := strconv.ParseFloat(l.scrapRateStr, 64)

			reqQty := qtyPer * (input.Quantity / 100.0) * (1.0 + scrapRate)
			if _, err := tx.Exec(ctx, `
				INSERT INTO wo_material_requirement (
					wo_id, component_item_revision_id, component_item_code, required_qty, uom_id, issue_operation_id, backflush_flag, phantom_flag, stock_check_status
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'NotChecked')
			`, woID, *l.compRevID, compCode, reqQty, *l.uomID, l.issueOpID, l.backflush, l.phantom); err != nil {
				return nil, fmt.Errorf("failed to insert wo_material_requirement: %w", err)
			}
		}
	}

	// Snapshot Routing Operations
	opRows, err := tx.Query(ctx, `
		SELECT master_id, operation_id, operation_code, work_center_id, seq, predecessor_seq
		FROM rm_routing_operation WHERE routing_header_id = $1 ORDER BY seq
	`, routingHeaderID)
	if err != nil {
		log.Printf("[CreateWO] Query routing ops error: %v", err)
	} else {
		type opStruct struct {
			masterID, opID, opCode, wcID *string
			seq                          int
			predSeq                      *int
		}
		var ops []opStruct
		for opRows.Next() {
			var o opStruct
			if err := opRows.Scan(&o.masterID, &o.opID, &o.opCode, &o.wcID, &o.seq, &o.predSeq); err != nil {
				log.Printf("[CreateWO] Scan routing op error: %v", err)
				continue
			}
			ops = append(ops, o)
		}
		opRows.Close()

		for _, o := range ops {
			opCodeStr := fmt.Sprintf("OP-%d", o.seq)
			if o.opCode != nil {
				opCodeStr = *o.opCode
			}
			var predStr *string
			if o.predSeq != nil {
				s := fmt.Sprintf("%d", *o.predSeq)
				predStr = &s
			}

			var setupStr, cycleStr, effStr string
			var setupTime, cycleTime, eff float64 = 15.0, 45.0, 1.0
			if err := tx.QueryRow(ctx, `
				SELECT setup_time_min::text, cycle_time_sec::text, efficiency_factor::text
				FROM rm_production_standard
				WHERE item_revision_id = $1 AND operation_id = $2 AND work_center_id = $3
				LIMIT 1
			`, input.ItemRevisionID, *o.opID, *o.wcID).Scan(&setupStr, &cycleStr, &effStr); err == nil {
				if s, e := strconv.ParseFloat(setupStr, 64); e == nil {
					setupTime = s
				}
				if c, e := strconv.ParseFloat(cycleStr, 64); e == nil {
					cycleTime = c
				}
				if ef, e := strconv.ParseFloat(effStr, 64); e == nil && ef > 0 {
					eff = ef
				}
			}

			if _, err := tx.Exec(ctx, `
				INSERT INTO wo_operation (
					wo_id, sequence_no, operation_id, operation_code, work_center_id, predecessor_seq,
					standard_setup_time_min, standard_cycle_time_sec, standard_efficiency_factor, status
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Pending')
			`, woID, o.seq, *o.opID, opCodeStr, *o.wcID, predStr, setupTime, cycleTime, eff); err != nil {
				return nil, fmt.Errorf("failed to insert wo_operation: %w", err)
			}
		}
	}

	// Write outbox event
	payload := map[string]interface{}{
		"wo_id":            woID,
		"wo_code":          woCode,
		"item_revision_id": input.ItemRevisionID,
		"quantity":         input.Quantity,
		"site_id":          input.SiteID,
		"status":           "Draft",
	}
	envelope := sharedkernel.CreateEventEnvelope("MES.Execution.WOCreated.v1", "mes-execution-service", input.TraceID, payload)
	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.WOCreated.v1", envelope); err != nil {
		return nil, fmt.Errorf("failed to write WOCreated event to outbox: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"wo_id":                 woID,
		"wo_code":               woCode,
		"production_version_id": pvID,
		"item_revision_id":      input.ItemRevisionID,
		"item_code":             input.ItemCode,
		"item_name":             input.ItemName,
		"quantity":              input.Quantity,
		"uom_id":                input.UOMID,
		"site_id":               input.SiteID,
		"planned_start_at":      input.PlannedStartAt,
		"planned_end_at":        input.PlannedEndAt,
		"status":                "Draft",
		"created_by":            createdBy,
	}, nil
}
