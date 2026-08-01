package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type CreateWOInput struct {
	ProductionVersionID string
	ItemRevisionID      string
	ItemCode            string
	ItemName            string
	Quantity            float64
	UOMID               string
	SiteID              string
	ShiftID             string
	PlannedStartAt      string
	PlannedEndAt        string
	UserID              string
	TraceID             string
}

func localizedOperationName(code string) string {
	names := map[string]map[string]string{
		"OP-MIX":  {"vi": "Luyện cán cao su", "en": "Rubber Mixing", "ja": "ゴム混練", "ko": "고무 혼련"},
		"OP-PREP": {"vi": "Chuẩn bị lõi kim loại", "en": "Metal Core Preparation", "ja": "金属コア準備", "ko": "금속 코어 준비"},
		"OP-CUT":  {"vi": "Cắt phôi cao su", "en": "Rubber Blank Cutting", "ja": "ゴムブランク切断", "ko": "고무 블랭크 절단"},
		"OP-MOLD": {"vi": "Đúc lưu hóa", "en": "Compression Molding", "ja": "圧縮成形", "ko": "압축 성형"},
		"OP-TRIM": {"vi": "Cắt via và hoàn thiện", "en": "Deflashing and Finishing", "ja": "バリ取り・仕上げ", "ko": "버 제거 및 마감"},
		"OP-QC":   {"vi": "Kiểm tra chất lượng", "en": "Quality Inspection", "ja": "品質検査", "ko": "품질 검사"},
	}
	name := names[code]
	if name == nil {
		name = map[string]string{"vi": code, "en": code, "ja": code, "ko": code}
	}
	encoded, _ := json.Marshal(name)
	return string(encoded)
}

func localizedNameValue(raw []byte) string {
	var values map[string]string
	if len(raw) > 0 && json.Unmarshal(raw, &values) == nil {
		for _, locale := range []string{"vi", "en", "ja", "ko"} {
			if value := strings.TrimSpace(values[locale]); value != "" {
				return value
			}
		}
	}
	return strings.TrimSpace(string(raw))
}

const WorkOrderCodePrefix = "WO"

func CreateWorkOrder(ctx context.Context, pool *pgxpool.Pool, input CreateWOInput) (map[string]interface{}, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.UserID); err != nil {
		return nil, fmt.Errorf("failed to set_config: %w", err)
	}

	if input.ProductionVersionID == "" {
		return nil, fmt.Errorf("PRODUCTION_VERSION_REQUIRED")
	}
	var pvID, mbomHeaderID, routingHeaderID, derivedItemRevisionID, derivedSiteID, derivedUOMID, pvCode, itemRevisionCode, itemCode, mbomCode, routingCode, mbomBusinessVersion string
	var mbomBaseQuantity float64
	var pvName, itemName []byte
	err = tx.QueryRow(ctx, `
		SELECT pv.master_id, pv.item_revision_id, pv.mbom_header_id, pv.routing_header_id, pv.site_id,
		       COALESCE(pv.code, ''), COALESCE(pv.name_i18n, '{}'::jsonb), COALESCE(ir.code, ''),
		       COALESCE(ir.name, '{}'::jsonb), COALESCE(ir.base_uom_id::text, ''), COALESCE(ir.code, ''),
		       COALESCE(mb.code, ''), COALESCE(rh.code, ''), COALESCE(mb.business_version, '1'), mb.base_quantity
		FROM rm_production_version pv
		JOIN rm_item_revision ir ON ir.master_id = pv.item_revision_id
		JOIN rm_mbom_header mb ON mb.master_id = pv.mbom_header_id
		JOIN rm_routing_header rh ON rh.master_id = pv.routing_header_id
		WHERE pv.master_id = $1 AND pv.lifecycle_status = 'Released'
	`, input.ProductionVersionID).Scan(&pvID, &derivedItemRevisionID, &mbomHeaderID, &routingHeaderID, &derivedSiteID, &pvCode, &pvName, &itemRevisionCode, &itemName, &derivedUOMID, &itemCode, &mbomCode, &routingCode, &mbomBusinessVersion, &mbomBaseQuantity)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("PRODUCTION_VERSION_NOT_FOUND")
		}
		return nil, fmt.Errorf("WORK_ORDER_MASTER_DATA_QUERY_FAILED: %w", err)
	}
	if derivedUOMID == "" {
		return nil, fmt.Errorf("WORK_ORDER_MASTER_DATA_INCOMPLETE: Production Version %s has no projected Item Revision base UOM", pvID)
	}

	// The Production Version owns the configuration, but the executable Site is
	// derived from every Routing Work Center. Never trust the PV/site projection
	// when it disagrees with the released Routing structure.
	var routingSite string
	var routingSiteCount int
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(MIN(wc.site_id::text), ''), COUNT(DISTINCT wc.site_id)
		FROM rm_routing_operation ro
		JOIN rm_work_center wc ON wc.master_id = ro.work_center_id
		WHERE ro.routing_header_id = $1
	`, routingHeaderID).Scan(&routingSite, &routingSiteCount); err != nil {
		return nil, fmt.Errorf("WORK_ORDER_MASTER_DATA_QUERY_FAILED: routing Site resolution: %w", err)
	}
	if routingSite == "" {
		return nil, fmt.Errorf("ROUTING_SITE_CONTEXT_INVALID")
	}
	if routingSiteCount > 1 {
		return nil, fmt.Errorf("ROUTING_SITE_CONTEXT_AMBIGUOUS")
	}
	if derivedSiteID == "" || derivedSiteID != routingSite {
		return nil, fmt.Errorf("PRODUCTION_VERSION_SITE_CONTEXT_INVALID")
	}
	if input.ItemRevisionID != "" && input.ItemRevisionID != derivedItemRevisionID {
		return nil, fmt.Errorf("WORK_ORDER_PRODUCTION_VERSION_CONTEXT_MISMATCH:item_revision_id")
	}
	if input.SiteID != "" && input.SiteID != derivedSiteID {
		return nil, fmt.Errorf("WORK_ORDER_PRODUCTION_VERSION_CONTEXT_MISMATCH:site_id")
	}
	if input.UOMID != "" && derivedUOMID != "" && input.UOMID != derivedUOMID {
		return nil, fmt.Errorf("WORK_ORDER_PRODUCTION_VERSION_CONTEXT_MISMATCH:uom_id")
	}
	input.ItemRevisionID, input.SiteID, input.UOMID = derivedItemRevisionID, derivedSiteID, derivedUOMID
	if input.ItemCode == "" {
		input.ItemCode = itemCode
	}
	if input.ItemName == "" {
		input.ItemName = localizedNameValue(itemName)
	}

	var seq int64
	numberDate := time.Now().UTC().Format("2006-01-02")
	if err := tx.QueryRow(ctx, `
		INSERT INTO wo_numbering_daily (number_date, current_value)
		VALUES ($1::DATE, 1)
		ON CONFLICT (number_date) DO UPDATE SET current_value = wo_numbering_daily.current_value + 1, updated_at = NOW()
		RETURNING current_value
	`, numberDate).Scan(&seq); err != nil {
		return nil, fmt.Errorf("ERR-WO-CODE-GENERATION: %w", err)
	}
	woCode := fmt.Sprintf("%s-%s-%04d", WorkOrderCodePrefix, strings.ReplaceAll(numberDate, "-", ""), seq)

	var woID, createdBy string
	err = tx.QueryRow(ctx, `
		INSERT INTO wo_header (
			wo_code, production_version_id, production_version_code, production_version_name_i18n, item_revision_id, item_revision_code, item_revision_name_i18n, item_code, item_name, mbom_code, routing_code, planning_snapshot, quantity, uom_id, site_id, shift_id,
			planned_start_at, planned_end_at, status, created_by
		) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18, 'Draft', $19)
		RETURNING wo_id, created_by
	`, woCode, pvID, pvCode, string(pvName), input.ItemRevisionID, itemRevisionCode, string(itemName), input.ItemCode, input.ItemName, mbomCode, routingCode, fmt.Sprintf(`{"production_version_id":"%s","production_version_code":"%s","mbom_id":"%s","routing_id":"%s","shift_id":"%s"}`, pvID, pvCode, mbomHeaderID, routingHeaderID, input.ShiftID), input.Quantity, input.UOMID, input.SiteID, input.ShiftID, input.PlannedStartAt, input.PlannedEndAt, input.UserID).Scan(&woID, &createdBy)
	if err != nil {
		return nil, fmt.Errorf("failed to insert wo_header: %w", err)
	}

	if mbomBaseQuantity <= 0 {
		return nil, fmt.Errorf("MBOM_BASE_QUANTITY_INVALID")
	}

	// Explode the selected released MBOM. Quantities are scaled by the MBOM
	// base quantity; optional lines are not demand unless explicitly selected.
	mbomRows, err := tx.Query(ctx, `
		SELECT master_id, parent_line_id, component_revision_id, component_item_code, quantity_per::text, uom_id, scrap_rate::text, issue_operation_id, backflush_flag, phantom_flag, optional_flag
		FROM rm_mbom_line WHERE mbom_header_id = $1
	`, mbomHeaderID)
	if err != nil {
		log.Printf("[CreateWO] Query mbom lines error: %v", err)
	} else {
		type lineStruct struct {
			masterID, parentID, compRevID, compCode, uomID, issueOpID *string
			qtyPerStr, scrapRateStr                                   string
			backflush, phantom, optional                              bool
		}
		var lines []lineStruct
		for mbomRows.Next() {
			var l lineStruct
			if err := mbomRows.Scan(&l.masterID, &l.parentID, &l.compRevID, &l.compCode, &l.qtyPerStr, &l.uomID, &l.scrapRateStr, &l.issueOpID, &l.backflush, &l.phantom, &l.optional); err != nil {
				log.Printf("[CreateWO] Scan mbom line error: %v", err)
				continue
			}
			lines = append(lines, l)
		}
		mbomRows.Close()

		children := make(map[string]bool)
		for _, l := range lines {
			if l.parentID != nil {
				children[*l.parentID] = true
			}
		}
		scale := input.Quantity / mbomBaseQuantity
		for _, l := range lines {
			if l.optional || (l.phantom && l.masterID != nil && children[*l.masterID]) {
				continue
			}
			compCode := "COMPONENT"
			if l.compCode != nil {
				compCode = *l.compCode
			}
			qtyPer, _ := strconv.ParseFloat(l.qtyPerStr, 64)
			scrapRate, _ := strconv.ParseFloat(l.scrapRateStr, 64)

			scaledQty := qtyPer * scale
			reqQty := math.Round(scaledQty*(1.0+scrapRate)*1_000_000) / 1_000_000
			if _, err := tx.Exec(ctx, `
				INSERT INTO wo_material_requirement (
					wo_id, component_item_revision_id, component_item_code, required_qty, uom_id, issue_operation_id, backflush_flag, phantom_flag, stock_check_status,
					mbom_header_id, mbom_version, mbom_line_id, source_parent_line_id, quantity_per, scaled_quantity, scrap_rate, optional_flag
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'NotChecked', $9, $10, $11, $12, $13, $14, $15, $16)
			`, woID, *l.compRevID, compCode, reqQty, *l.uomID, l.issueOpID, l.backflush, l.phantom, mbomHeaderID, mbomBusinessVersion, *l.masterID, l.parentID, qtyPer, scaledQty, scrapRate, l.optional); err != nil {
				return nil, fmt.Errorf("failed to insert wo_material_requirement: %w", err)
			}
		}
	}

	// Snapshot Routing Operations
	opRows, err := tx.Query(ctx, `
		SELECT ro.master_id, ro.operation_id, ro.operation_code, ro.work_center_id, ro.seq, ro.predecessor_seq,
		       ro.resolved_setup_time_min, ro.resolved_cycle_time_sec, ro.resolved_efficiency_factor, ro.resolved_base_quantity, ro.resolved_standard_yield, ro.resolved_required_workers, ro.resolved_source, ro.requires_output_label, ro.workstation_id, ro.queue_time_min, ro.move_time_min, ro.units_per_label, ro.label_quantity_method, ro.copies_per_label
		FROM rm_routing_operation ro
		WHERE ro.routing_header_id = $1 ORDER BY ro.seq
	`, routingHeaderID)
	if err != nil {
		return nil, fmt.Errorf("WO_ROUTING_SNAPSHOT_UNAVAILABLE: failed to load routing operations: %w", err)
	} else {
		type opStruct struct {
			masterID, opID, opCode, wcID                  *string
			seq                                           int
			predSeq                                       *int
			setup, cycle, efficiency, base, standardYield *float64
			workers                                       *int
			planningSource                                *string
			requiresOutputLabel                           bool
			workstationID                                 *string
			queueTime, moveTime                           float64
			unitsPerLabel                                 *float64
			labelQuantityMethod                           string
			copiesPerLabel                                int
		}
		var ops []opStruct
		for opRows.Next() {
			var o opStruct
			if err := opRows.Scan(&o.masterID, &o.opID, &o.opCode, &o.wcID, &o.seq, &o.predSeq, &o.setup, &o.cycle, &o.efficiency, &o.base, &o.standardYield, &o.workers, &o.planningSource, &o.requiresOutputLabel, &o.workstationID, &o.queueTime, &o.moveTime, &o.unitsPerLabel, &o.labelQuantityMethod, &o.copiesPerLabel); err != nil {
				return nil, fmt.Errorf("SQL_SCAN_FAILED: routing operation snapshot: %w", err)
			}
			ops = append(ops, o)
		}
		if err := opRows.Err(); err != nil {
			return nil, fmt.Errorf("SQL_SCAN_FAILED: routing operation rows: %w", err)
		}
		opRows.Close()
		if len(ops) == 0 {
			return nil, fmt.Errorf("WO_ROUTING_SNAPSHOT_MISSING: Production Version routing has no executable operations")
		}

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

			if o.setup == nil || o.cycle == nil || o.efficiency == nil || o.base == nil || o.standardYield == nil || o.workers == nil || *o.workers < 1 {
				return nil, fmt.Errorf("WO_PLANNING_SNAPSHOT_INCOMPLETE: routing operation %s has incomplete planning values", opCodeStr)
			}
			setupTime, cycleTime, eff := *o.setup, *o.cycle, *o.efficiency
			baseQuantity, standardYield := *o.base, *o.standardYield
			if setupTime < 0 || cycleTime <= 0 || eff <= 0 || baseQuantity <= 0 || standardYield <= 0 || standardYield > 1 {
				return nil, fmt.Errorf("WO_PLANNING_SNAPSHOT_INVALID: routing operation %s has invalid planning values", opCodeStr)
			}

			targetType := "KIOSK_DEMO"
			if o.requiresOutputLabel {
				targetType = "PRINT_STATION"
			}
			if o.copiesPerLabel < 1 {
				o.copiesPerLabel = 1
			}
			labelCount := 0
			printStatus := "NotRequired"
			labelPolicyWarning := ""
			if o.requiresOutputLabel {
				printStatus = "Pending"
				unitsPerLabel := baseQuantity
				if o.unitsPerLabel != nil && *o.unitsPerLabel > 0 {
					unitsPerLabel = *o.unitsPerLabel
				} else {
					labelPolicyWarning = "LABEL_QUANTITY_STANDARD_BASE_FALLBACK"
				}
				labelCount = int(math.Ceil(input.Quantity / unitsPerLabel))
			}
			planningSnapshot := map[string]interface{}{"planning_source": o.planningSource, "execution_target_type": targetType, "base_quantity": baseQuantity, "setup_time_min": setupTime, "cycle_time_sec": cycleTime, "queue_time_min": o.queueTime, "move_time_min": o.moveTime, "required_workers": *o.workers, "efficiency_factor": eff, "standard_yield": standardYield, "predecessor_seq": predStr, "operation_cycle_count": input.Quantity / baseQuantity, "expected_good_quantity": input.Quantity * standardYield, "units_per_label": o.unitsPerLabel, "label_quantity_method": o.labelQuantityMethod, "copies_per_label": o.copiesPerLabel, "label_count": labelCount, "print_copies": labelCount * o.copiesPerLabel, "label_policy_warning": labelPolicyWarning}
			if _, err := tx.Exec(ctx, `
				INSERT INTO wo_operation (
				wo_id, sequence_no, operation_id, routing_operation_id, operation_code, operation_name, work_center_id, predecessor_seq,
					standard_setup_time_min, standard_cycle_time_sec, standard_efficiency_factor, base_quantity, standard_yield, required_workers, queue_time_min, move_time_min, calculation_version, planning_snapshot, execution_target_type, workstation_id, operation_cycle_count, expected_good_quantity, requires_output_label, units_per_label, label_quantity_method, copies_per_label, label_count, print_copies, print_status, status
				) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, 'Pending')
			`, woID, o.seq, *o.opID, *o.masterID, opCodeStr, localizedOperationName(opCodeStr), *o.wcID, predStr, setupTime, cycleTime, eff, baseQuantity, standardYield, *o.workers, o.queueTime, o.moveTime, "routing-plan-v1", planningSnapshot, targetType, o.workstationID, input.Quantity/baseQuantity, input.Quantity*standardYield, o.requiresOutputLabel, o.unitsPerLabel, o.labelQuantityMethod, o.copiesPerLabel, labelCount, labelCount*o.copiesPerLabel, printStatus); err != nil {
				return nil, fmt.Errorf("failed to insert wo_operation: %w", err)
			}
		}
	}

	// Write outbox event
	payload := map[string]interface{}{
		"wo_id":                        woID,
		"wo_code":                      woCode,
		"production_version_id":        pvID,
		"production_version_code":      pvCode,
		"production_version_name_i18n": json.RawMessage(pvName),
		"item_revision_id":             input.ItemRevisionID,
		"item_revision_code":           itemRevisionCode,
		"quantity":                     input.Quantity,
		"site_id":                      input.SiteID,
		"status":                       "Draft",
	}
	envelope := sharedkernel.CreateEventEnvelope("MES.Execution.WOCreated.v1", "mes-execution-service", input.TraceID, payload)
	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.WOCreated.v1", envelope); err != nil {
		return nil, fmt.Errorf("failed to write WOCreated event to outbox: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"wo_id":                        woID,
		"wo_code":                      woCode,
		"production_version_id":        pvID,
		"production_version_code":      pvCode,
		"production_version_name_i18n": json.RawMessage(pvName),
		"item_revision_id":             input.ItemRevisionID,
		"item_revision_code":           itemRevisionCode,
		"item_code":                    input.ItemCode,
		"item_name":                    input.ItemName,
		"quantity":                     input.Quantity,
		"uom_id":                       input.UOMID,
		"site_id":                      input.SiteID,
		"planned_start_at":             input.PlannedStartAt,
		"planned_end_at":               input.PlannedEndAt,
		"status":                       "Draft",
		"created_by":                   createdBy,
	}, nil
}
