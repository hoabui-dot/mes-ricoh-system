package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type lineSelectionRoutingOperation struct {
	MasterID      string
	OperationID   string
	OperationCode string
	WorkCenterID  string
	Seq           int
}

type lineWorkCenterSelection struct {
	LineID             string
	LineCode           string
	LineNameJSON       []byte
	WorkCenterID       string
	SourceWorkCenterID string
}

type lineSelectionResult struct {
	Status         string
	Mode           string
	Reason         string
	FallbackReason string
	HoldReasonJSON []byte
	EvaluatedJSON  []byte
	LineID         string
	LineCode       string
	LineNameJSON   []byte
	OperationWCs   map[string]lineWorkCenterSelection
}

type lineEligibility struct {
	LineID   string
	Code     string
	NameJSON []byte
	Role     string
	Priority int
}

const lineSelectionPolicyVersion = "MES_LINE_SELECTION_V2"

type lineEvaluationDimension struct {
	DimensionCode       string                   `json:"dimension_code"`
	Key                 string                   `json:"key"`
	Status              string                   `json:"status"`
	Blocking            bool                     `json:"blocking"`
	EvaluationStage     string                   `json:"evaluation_stage"`
	ReasonCode          string                   `json:"reason_code"`
	LocalizedMessageKey string                   `json:"localized_message_key"`
	Details             []map[string]interface{} `json:"details"`
	EvaluatedAt         *time.Time               `json:"evaluated_at"`
	Source              string                   `json:"source"`
}

var mandatoryLineSelectionDimensions = map[string]bool{
	"eligibility": true, "work_centers": true, "capability": true,
	"production_standard": true, "calendar_shift": true, "capacity": true,
}

var lineBlockerDimension = map[string]string{
	"LINE_MISSING_WORK_CENTER":          "work_centers",
	"LINE_OPERATION_CAPABILITY_MISSING": "capability",
	"LINE_PRODUCTION_STANDARD_MISSING":  "production_standard",
	"LINE_RESOURCE_CALENDAR_MISSING":    "calendar_shift",
	"LINE_RESOURCE_CAPACITY_CONFLICT":   "capacity",
}

var lineSelectionDimensionOrder = []string{"eligibility", "work_centers", "capability", "production_standard", "calendar_shift", "capacity"}

func dimensionResult(code, status, stage, reason string, details []map[string]interface{}, evaluatedAt *time.Time) lineEvaluationDimension {
	return lineEvaluationDimension{
		DimensionCode: code, Key: code, Status: status,
		Blocking:        status == "BLOCKED" || status == "UNKNOWN" || (status == "NOT_EVALUATED" && mandatoryLineSelectionDimensions[code]),
		EvaluationStage: stage, ReasonCode: reason,
		LocalizedMessageKey: "woDetail.dimensionReason." + reason,
		Details:             details, EvaluatedAt: evaluatedAt, Source: "MES_EXECUTION_LINE_SELECTOR",
	}
}

func aggregateLineEvaluation(dimensions []lineEvaluationDimension) string {
	evaluatedMandatory := make(map[string]bool, len(mandatoryLineSelectionDimensions))
	for _, dimension := range dimensions {
		if !mandatoryLineSelectionDimensions[dimension.DimensionCode] {
			continue
		}
		evaluatedMandatory[dimension.DimensionCode] = true
		if dimension.Status != "READY" && dimension.Status != "NOT_APPLICABLE" {
			return "Blocked"
		}
	}
	if len(evaluatedMandatory) != len(mandatoryLineSelectionDimensions) {
		return "Blocked"
	}
	return "Ready"
}

func buildLineEvaluation(line lineEligibility, blockers []map[string]interface{}, selectionReason string, evaluatedAt time.Time) map[string]interface{} {
	blockersByDimension := map[string][]map[string]interface{}{}
	firstBlockedIndex := len(lineSelectionDimensionOrder)
	for _, blocker := range blockers {
		code, _ := blocker["code"].(string)
		dimensionCode, known := lineBlockerDimension[code]
		if !known {
			dimensionCode = "work_centers"
			blocker["classification"] = "UNKNOWN_BLOCKER"
		}
		blockersByDimension[dimensionCode] = append(blockersByDimension[dimensionCode], blocker)
		for index, candidate := range lineSelectionDimensionOrder {
			if candidate == dimensionCode && index < firstBlockedIndex {
				firstBlockedIndex = index
			}
		}
	}

	dimensions := make([]lineEvaluationDimension, 0, 13)
	readyReasons := map[string]string{
		"eligibility": "LINE_ELIGIBILITY_READY", "work_centers": "LINE_WORK_CENTER_COVERAGE_READY",
		"capability": "LINE_CAPABILITY_READY", "production_standard": "LINE_PRODUCTION_STANDARD_READY",
		"calendar_shift": "LINE_CALENDAR_SHIFT_READY", "capacity": "LINE_COARSE_CAPACITY_READY",
	}
	for index, code := range lineSelectionDimensionOrder {
		if failed := blockersByDimension[code]; len(failed) > 0 {
			dimensions = append(dimensions, dimensionResult(code, "BLOCKED", "LINE_SELECTION", failed[0]["code"].(string), failed, &evaluatedAt))
		} else if index > firstBlockedIndex {
			dimensions = append(dimensions, dimensionResult(code, "NOT_EVALUATED", "LINE_SELECTION", "PREREQUISITE_DIMENSION_BLOCKED", []map[string]interface{}{}, nil))
		} else {
			dimensions = append(dimensions, dimensionResult(code, "READY", "LINE_SELECTION", readyReasons[code], []map[string]interface{}{}, &evaluatedAt))
		}
	}
	for _, deferred := range []struct{ code, stage, reason string }{
		{"workstations", "RESOURCE_ALLOCATION", "WORKSTATION_REQUIRES_EXACT_RESOURCE"},
		{"machine_requirements", "RESOURCE_ALLOCATION", "MACHINE_REQUIREMENT_REQUIRES_EXACT_RESOURCE"},
		{"equipment_units", "RESOURCE_ALLOCATION", "EQUIPMENT_UNIT_REQUIRES_EXACT_RESOURCE"},
		{"assignments", "RESOURCE_ALLOCATION", "ASSIGNMENT_REQUIRES_EXACT_RESOURCE"},
		{"worker_skill_labor", "RESOURCE_ALLOCATION", "LABOR_REQUIRES_EXACT_RESOURCE"},
	} {
		dimensions = append(dimensions, dimensionResult(deferred.code, "DEFERRED", deferred.stage, deferred.reason, []map[string]interface{}{}, nil))
	}
	status := aggregateLineEvaluation(dimensions)
	finalReason := "MANDATORY_LINE_SELECTION_DIMENSIONS_READY"
	if status == "Blocked" {
		finalReason = "MANDATORY_LINE_SELECTION_DIMENSION_BLOCKED"
	}
	dimensions = append(dimensions, dimensionResult("final_result", map[string]string{"Ready": "READY", "Blocked": "BLOCKED"}[status], "LINE_SELECTION", finalReason, blockers, &evaluatedAt))
	selectionStatus := "NOT_APPLICABLE"
	selectionEvaluatedAt := (*time.Time)(nil)
	if status == "Ready" && selectionReason != "" {
		selectionStatus = "READY"
		selectionEvaluatedAt = &evaluatedAt
	} else if status == "Blocked" {
		selectionReason = "LINE_NOT_SELECTED_BLOCKED"
	}
	dimensions = append(dimensions, dimensionResult("selection_reason", selectionStatus, "LINE_SELECTION", selectionReason, []map[string]interface{}{}, selectionEvaluatedAt))

	return map[string]interface{}{
		"production_line_id": line.LineID, "production_line_code": line.Code,
		"selection_role": line.Role, "priority": line.Priority, "status": status,
		"blockers": blockers, "dimensions": dimensions, "selection_reason": selectionReason,
		"evaluated_at": evaluatedAt, "policy_version": lineSelectionPolicyVersion,
	}
}

func evaluateProductionLineSelection(ctx context.Context, tx interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}, productionVersionID, siteID string, plannedStart, plannedEnd time.Time, ops []lineSelectionRoutingOperation) (lineSelectionResult, error) {
	rows, err := tx.Query(ctx, `
		SELECT l.master_id::text, l.code, l.name::text, e.selection_role, e.priority
		FROM rm_production_version_line_eligibility e
		JOIN rm_production_line l ON l.master_id = e.production_line_id
		WHERE e.production_version_id = $1
		  AND e.active_flag = true
		  AND e.lifecycle_status = 'Released'
		  AND l.active_flag = true
		  AND l.lifecycle_status = 'Released'
		  AND l.site_id = $2
		  AND e.effective_from <= $3
		  AND (e.effective_to IS NULL OR e.effective_to >= $4)
		ORDER BY CASE e.selection_role WHEN 'PRIMARY' THEN 0 ELSE 1 END, e.priority ASC, l.code ASC, l.master_id ASC
	`, productionVersionID, siteID, plannedStart, plannedStart)
	if err != nil {
		return lineSelectionResult{}, fmt.Errorf("WO_LINE_ELIGIBILITY_QUERY_FAILED: %w", err)
	}
	defer rows.Close()

	eligible := []lineEligibility{}
	for rows.Next() {
		var item lineEligibility
		var nameText string
		if err := rows.Scan(&item.LineID, &item.Code, &nameText, &item.Role, &item.Priority); err != nil {
			return lineSelectionResult{}, fmt.Errorf("WO_LINE_ELIGIBILITY_SCAN_FAILED: %w", err)
		}
		item.NameJSON = []byte(nameText)
		eligible = append(eligible, item)
	}
	if err := rows.Err(); err != nil {
		return lineSelectionResult{}, fmt.Errorf("WO_LINE_ELIGIBILITY_ROWS_FAILED: %w", err)
	}

	evaluated := make([]map[string]interface{}, 0, len(eligible))
	if len(eligible) == 0 {
		return resourceHoldResult("NO_RELEASED_EFFECTIVE_LINE_ELIGIBILITY", evaluated), nil
	}
	for _, line := range eligible {
		blockers := []map[string]interface{}{}
		selected := make(map[string]lineWorkCenterSelection)
		for _, op := range ops {
			wcID, code, name, blocker, err := selectLineWorkCenter(ctx, tx, line.LineID, op, siteID, plannedStart, plannedEnd)
			if err != nil {
				return lineSelectionResult{}, err
			}
			if blocker != "" {
				blockers = append(blockers, map[string]interface{}{"code": blocker, "line_id": line.LineID, "operation_id": op.OperationID, "routing_operation_id": op.MasterID, "operation_code": op.OperationCode})
				continue
			}
			selected[op.MasterID] = lineWorkCenterSelection{LineID: line.LineID, LineCode: line.Code, LineNameJSON: line.NameJSON, WorkCenterID: wcID, SourceWorkCenterID: op.WorkCenterID}
			_ = code
			_ = name
		}
		status := "Blocked"
		selectionReason := ""
		if len(blockers) == 0 {
			status = "Ready"
			selectionReason = "PRIMARY_LINE_READY"
			if line.Role == "BACKUP" {
				selectionReason = "BACKUP_LINE_READY"
			}
		}
		evaluation := buildLineEvaluation(line, blockers, selectionReason, time.Now().UTC())
		status, _ = evaluation["status"].(string)
		evaluated = append(evaluated, evaluation)
		if status == "Ready" {
			reason := "PRIMARY_LINE_READY"
			fallback := ""
			if line.Role == "BACKUP" {
				reason = "BACKUP_LINE_READY"
				fallback = "PRIMARY_LINE_BLOCKED"
			}
			evaluatedJSON, _ := json.Marshal(evaluated)
			return lineSelectionResult{Status: "READY", Mode: line.Role, Reason: reason, FallbackReason: fallback, EvaluatedJSON: evaluatedJSON, LineID: line.LineID, LineCode: line.Code, LineNameJSON: line.NameJSON, OperationWCs: selected}, nil
		}
	}
	return resourceHoldResult("NO_COMPLETE_FEASIBLE_LINE", evaluated), nil
}

func selectLineWorkCenter(ctx context.Context, tx interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, lineID string, op lineSelectionRoutingOperation, siteID string, plannedStart, plannedEnd time.Time) (string, string, []byte, string, error) {
	var wcID, wcCode string
	var wcName []byte
	err := tx.QueryRow(ctx, `
		SELECT wc.master_id::text, wc.code, wc.name::text
		FROM rm_production_line_work_center lwc
		JOIN rm_work_center wc ON wc.master_id = lwc.work_center_id
		WHERE lwc.production_line_id = $1
		  AND lwc.site_id = $2
		  AND lwc.active_flag = true
		  AND lwc.lifecycle_status = 'Released'
		  AND lwc.effective_from <= $3
		  AND (lwc.effective_to IS NULL OR lwc.effective_to >= $4)
		  AND wc.active_flag = true
		  AND wc.lifecycle_status = 'Released'
		  AND EXISTS (
		    SELECT 1 FROM rm_resource_capability c
		    WHERE c.work_center_id = lwc.work_center_id
		      AND c.operation_id = $5
		      AND c.active_flag = true
		      AND c.lifecycle_status = 'Released'
		  )
		  AND EXISTS (
		    SELECT 1 FROM rm_production_standard ps
		    WHERE ps.work_center_id = lwc.work_center_id
		      AND (ps.routing_operation_id = $6 OR ps.operation_id = $5)
		      AND ps.lifecycle_status = 'Released'
		  )
		  AND EXISTS (
		    SELECT 1 FROM rm_resource_calendar cal
		    WHERE cal.work_center_id = lwc.work_center_id
		      AND cal.available_from <= $3
		      AND cal.available_to >= $4
		      AND cal.lifecycle_status = 'Released'
		      AND cal.capacity_percent > 0
		  )
		  AND NOT EXISTS (
		    SELECT 1 FROM wo_capacity_reservation r
		    WHERE r.resource_type = 'WorkCenter'
		      AND r.resource_id = lwc.work_center_id
		      AND r.status IN ('Tentative','Committed')
		      AND r.start_at < $4
		      AND r.end_at > $3
		  )
		ORDER BY (lwc.work_center_id = $7::uuid) DESC, wc.code ASC, wc.master_id ASC
		LIMIT 1
	`, lineID, siteID, plannedStart, plannedEnd, op.OperationID, op.MasterID, op.WorkCenterID).Scan(&wcID, &wcCode, &wcName)
	if err == nil {
		return wcID, wcCode, wcName, "", nil
	}
	if err != pgx.ErrNoRows {
		return "", "", nil, "", fmt.Errorf("WO_LINE_WORK_CENTER_QUERY_FAILED: %w", err)
	}
	return "", "", nil, classifyLineWorkCenterBlocker(ctx, tx, lineID, op, siteID, plannedStart, plannedEnd), nil
}

func classifyLineWorkCenterBlocker(ctx context.Context, tx interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, lineID string, op lineSelectionRoutingOperation, siteID string, plannedStart, plannedEnd time.Time) string {
	var memberCount int
	_ = tx.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM rm_production_line_work_center lwc
		JOIN rm_work_center wc ON wc.master_id = lwc.work_center_id
		WHERE lwc.production_line_id=$1 AND lwc.site_id=$2 AND lwc.active_flag=true AND lwc.lifecycle_status='Released'
		  AND lwc.effective_from <= $3 AND (lwc.effective_to IS NULL OR lwc.effective_to >= $4)
		  AND wc.active_flag=true AND wc.lifecycle_status='Released'
	`, lineID, siteID, plannedStart, plannedEnd).Scan(&memberCount)
	if memberCount == 0 {
		return "LINE_MISSING_WORK_CENTER"
	}
	var capabilityCount int
	_ = tx.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM rm_production_line_work_center lwc
		JOIN rm_resource_capability c ON c.work_center_id = lwc.work_center_id
		WHERE lwc.production_line_id=$1 AND lwc.site_id=$2 AND lwc.active_flag=true AND lwc.lifecycle_status='Released'
		  AND lwc.effective_from <= $3 AND (lwc.effective_to IS NULL OR lwc.effective_to >= $4)
		  AND c.operation_id=$5 AND c.active_flag=true AND c.lifecycle_status='Released'
	`, lineID, siteID, plannedStart, plannedEnd, op.OperationID).Scan(&capabilityCount)
	if capabilityCount == 0 {
		return "LINE_OPERATION_CAPABILITY_MISSING"
	}
	var standardCount int
	_ = tx.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM rm_production_line_work_center lwc
		JOIN rm_production_standard ps ON ps.work_center_id = lwc.work_center_id
		WHERE lwc.production_line_id=$1 AND lwc.site_id=$2 AND lwc.active_flag=true AND lwc.lifecycle_status='Released'
		  AND lwc.effective_from <= $3 AND (lwc.effective_to IS NULL OR lwc.effective_to >= $4)
		  AND (ps.routing_operation_id=$5 OR ps.operation_id=$6) AND ps.lifecycle_status='Released'
	`, lineID, siteID, plannedStart, plannedEnd, op.MasterID, op.OperationID).Scan(&standardCount)
	if standardCount == 0 {
		return "LINE_PRODUCTION_STANDARD_MISSING"
	}
	var calendarCount int
	_ = tx.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM rm_production_line_work_center lwc
		JOIN rm_resource_calendar cal ON cal.work_center_id = lwc.work_center_id
		WHERE lwc.production_line_id=$1 AND lwc.site_id=$2 AND lwc.active_flag=true AND lwc.lifecycle_status='Released'
		  AND lwc.effective_from <= $3 AND (lwc.effective_to IS NULL OR lwc.effective_to >= $4)
		  AND cal.available_from <= $3 AND cal.available_to >= $4 AND cal.lifecycle_status='Released' AND cal.capacity_percent > 0
	`, lineID, siteID, plannedStart, plannedEnd).Scan(&calendarCount)
	if calendarCount == 0 {
		return "LINE_RESOURCE_CALENDAR_MISSING"
	}
	return "LINE_RESOURCE_CAPACITY_CONFLICT"
}

func resourceHoldResult(reason string, evaluated []map[string]interface{}) lineSelectionResult {
	evaluatedJSON, _ := json.Marshal(evaluated)
	hold, _ := json.Marshal(map[string]interface{}{"code": reason, "evaluated_lines": evaluated})
	return lineSelectionResult{Status: "RESOURCE_HOLD", Mode: "AUTO", Reason: reason, HoldReasonJSON: hold, EvaluatedJSON: evaluatedJSON, LineNameJSON: []byte(`{}`), OperationWCs: map[string]lineWorkCenterSelection{}}
}

func requireSelectedLineConsistency(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, woID string) error {
	var selectedLineID string
	var lineStatus string
	if err := q.QueryRow(ctx, `SELECT COALESCE(selected_production_line_id::text, ''), line_selection_status FROM wo_header WHERE wo_id=$1`, woID).Scan(&selectedLineID, &lineStatus); err != nil {
		return fmt.Errorf("WO_NOT_FOUND")
	}
	if lineStatus == "RESOURCE_HOLD" {
		return fmt.Errorf("WO_LINE_RESOURCE_HOLD")
	}
	if selectedLineID == "" {
		return fmt.Errorf("WO_LINE_SELECTION_REQUIRED")
	}
	var mismatchCount int
	if err := q.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM (
		  SELECT 1 FROM wo_operation WHERE wo_id=$1 AND production_line_id IS DISTINCT FROM $2::uuid
		  UNION ALL
		  SELECT 1 FROM wo_resource_allocation WHERE wo_id=$1 AND status='Committed' AND planned_production_line_id IS DISTINCT FROM $2::uuid
		  UNION ALL
		  SELECT 1 FROM wo_capacity_reservation WHERE wo_id=$1 AND status IN ('Tentative','Committed') AND production_line_id IS DISTINCT FROM $2::uuid
		) mismatches
	`, woID, selectedLineID).Scan(&mismatchCount); err != nil {
		return fmt.Errorf("WO_LINE_CONSISTENCY_QUERY_FAILED: %w", err)
	}
	if mismatchCount > 0 {
		return fmt.Errorf("WO_LINE_MIXED_ALLOCATION_REJECTED")
	}
	return nil
}

type ReplanLineInput struct {
	WOID       string
	UserID     string
	TraceID    string
	Reason     string
	RowVersion int
}

func CurrentLineReadiness(ctx context.Context, pool *pgxpool.Pool, woID string) (map[string]interface{}, error) {
	var lineID, lineCode, mode, status, reason, fallback string
	var lineName, hold, evaluated []byte
	if err := pool.QueryRow(ctx, `
		SELECT COALESCE(selected_production_line_id::text, ''), COALESCE(selected_production_line_code, ''),
		       COALESCE(selected_production_line_name_i18n, '{}'::jsonb), line_selection_mode, line_selection_status,
		       COALESCE(line_selection_reason, ''), COALESCE(fallback_reason, ''), resource_hold_reason, evaluated_line_results
		FROM wo_header WHERE wo_id=$1
	`, woID).Scan(&lineID, &lineCode, &lineName, &mode, &status, &reason, &fallback, &hold, &evaluated); err != nil {
		return nil, fmt.Errorf("WO_NOT_FOUND")
	}
	return map[string]interface{}{"wo_id": woID, "selected_production_line_id": lineID, "selected_production_line_code": lineCode, "selected_production_line_name_i18n": json.RawMessage(lineName), "line_selection_mode": mode, "line_selection_status": status, "line_selection_reason": reason, "fallback_reason": fallback, "resource_hold_reason": json.RawMessage(hold), "evaluated_line_results": json.RawMessage(evaluated)}, nil
}

func ReplanWorkOrderLine(ctx context.Context, pool *pgxpool.Pool, input ReplanLineInput) (map[string]interface{}, error) {
	if input.Reason == "" {
		return nil, fmt.Errorf("CHANGE_REASON_REQUIRED")
	}
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.UserID)

	var status, pvID, siteID string
	var plannedStart, plannedEnd time.Time
	var previousLineID string
	var currentRowVersion int
	if err := tx.QueryRow(ctx, `
		SELECT status::text, production_version_id::text, site_id::text, planned_start_at, planned_end_at,
		       COALESCE(selected_production_line_id::text, ''), row_version
		FROM wo_header WHERE wo_id=$1 FOR UPDATE
	`, input.WOID).Scan(&status, &pvID, &siteID, &plannedStart, &plannedEnd, &previousLineID, &currentRowVersion); err != nil {
		if input.RowVersion > 0 {
			return nil, fmt.Errorf("WO_LINE_REPLAN_VERSION_CONFLICT")
		}
		return nil, fmt.Errorf("WO_NOT_FOUND")
	}
	if input.RowVersion > 0 && input.RowVersion != currentRowVersion {
		return nil, fmt.Errorf("WO_LINE_REPLAN_VERSION_CONFLICT")
	}
	if status == "InProgress" || status == "Completed" || status == "Closed" {
		return nil, fmt.Errorf("WO_LINE_REPLAN_AFTER_START_REQUIRES_EXECUTION_SEGMENT")
	}
	if status != "Draft" && status != "PendingApproval" && status != "Released" && status != "ResourceHold" {
		return nil, fmt.Errorf("WO_LINE_REPLAN_STATUS_INVALID")
	}

	rows, err := tx.Query(ctx, `
		SELECT wo_operation_id::text, routing_operation_id::text, operation_id::text, operation_code, COALESCE(source_routing_work_center_id, work_center_id)::text, sequence_no
		FROM wo_operation WHERE wo_id=$1 ORDER BY sequence_no
	`, input.WOID)
	if err != nil {
		return nil, fmt.Errorf("WO_LINE_REPLAN_OPERATION_QUERY_FAILED: %w", err)
	}
	type opRow struct {
		WOOperationID string
		lineSelectionRoutingOperation
	}
	ops := []opRow{}
	for rows.Next() {
		var item opRow
		if err := rows.Scan(&item.WOOperationID, &item.MasterID, &item.OperationID, &item.OperationCode, &item.WorkCenterID, &item.Seq); err != nil {
			rows.Close()
			return nil, fmt.Errorf("WO_LINE_REPLAN_OPERATION_SCAN_FAILED: %w", err)
		}
		ops = append(ops, item)
	}
	rows.Close()
	if len(ops) == 0 {
		return nil, fmt.Errorf("WO_ROUTING_SNAPSHOT_MISSING")
	}
	lineOps := make([]lineSelectionRoutingOperation, 0, len(ops))
	for _, op := range ops {
		lineOps = append(lineOps, op.lineSelectionRoutingOperation)
	}
	selection, err := evaluateProductionLineSelection(ctx, tx, pvID, siteID, plannedStart, plannedEnd, lineOps)
	if err != nil {
		return nil, err
	}
	if selection.Status == "RESOURCE_HOLD" && status == "Released" {
		return nil, fmt.Errorf("WO_LINE_NOT_READY")
	}
	if _, err := tx.Exec(ctx, `UPDATE wo_resource_allocation SET status='Superseded', validation_status='Stale', row_version=row_version+1 WHERE wo_id=$1 AND status IN ('Draft','Validated','Committed')`, input.WOID); err != nil {
		return nil, fmt.Errorf("WO_LINE_REPLAN_ALLOCATION_SUPERSEDE_FAILED: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE wo_capacity_reservation SET status='Cancelled', updated_at=NOW() WHERE wo_id=$1 AND status IN ('Tentative','Committed')`, input.WOID); err != nil {
		return nil, fmt.Errorf("WO_LINE_REPLAN_RESERVATION_CANCEL_FAILED: %w", err)
	}

	newStatus := status
	if status == "ResourceHold" && selection.Status == "READY" {
		newStatus = "Draft"
	}
	if selection.Status == "RESOURCE_HOLD" {
		newStatus = "ResourceHold"
		if _, err := tx.Exec(ctx, `
			UPDATE wo_header
			   SET selected_production_line_id=NULL, selected_production_line_code=NULL, selected_production_line_name_i18n='{}'::jsonb,
			       line_selection_mode=$2, line_selection_status='RESOURCE_HOLD', line_selection_reason=$3,
			       fallback_reason=NULL, resource_hold_reason=$4::jsonb, evaluated_line_results=$5::jsonb,
			       status=$6::wo_status, updated_by=$7, updated_at=NOW(), row_version=row_version+1
			 WHERE wo_id=$1
		`, input.WOID, selection.Mode, selection.Reason, string(selection.HoldReasonJSON), string(selection.EvaluatedJSON), newStatus, input.UserID); err != nil {
			return nil, fmt.Errorf("WO_LINE_REPLAN_HEADER_UPDATE_FAILED: %w", err)
		}
	} else {
		if _, err := tx.Exec(ctx, `
			UPDATE wo_header
			   SET selected_production_line_id=$2, selected_production_line_code=$3, selected_production_line_name_i18n=$4::jsonb,
			       line_selection_mode=$5, line_selection_status='READY', line_selection_reason=$6,
			       fallback_reason=NULLIF($7, ''), resource_hold_reason='{}'::jsonb, evaluated_line_results=$8::jsonb,
			       status=$9::wo_status, line_locked_at=NOW(), updated_by=$10, updated_at=NOW(), row_version=row_version+1
			 WHERE wo_id=$1
		`, input.WOID, selection.LineID, selection.LineCode, string(selection.LineNameJSON), selection.Mode, selection.Reason, selection.FallbackReason, string(selection.EvaluatedJSON), newStatus, input.UserID); err != nil {
			return nil, fmt.Errorf("WO_LINE_REPLAN_HEADER_UPDATE_FAILED: %w", err)
		}
	}
	for _, op := range ops {
		lineWC := selection.OperationWCs[op.MasterID]
		wcID := op.WorkCenterID
		if lineWC.WorkCenterID != "" {
			wcID = lineWC.WorkCenterID
		}
		if _, err := tx.Exec(ctx, `
			UPDATE wo_operation
			   SET work_center_id=$2, production_line_id=NULLIF($3,'')::uuid, production_line_code=NULLIF($4,''), production_line_name_i18n=$5::jsonb,
			       source_routing_work_center_id=$6, row_version=row_version+1
			 WHERE wo_operation_id=$1
		`, op.WOOperationID, wcID, selection.LineID, selection.LineCode, string(selection.LineNameJSON), op.WorkCenterID); err != nil {
			return nil, fmt.Errorf("WO_LINE_REPLAN_OPERATION_UPDATE_FAILED: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wo_line_selection_audit (wo_id, previous_production_line_id, new_production_line_id, action, actor_user_id, reason, evaluated_line_results, wo_row_version, trace_id) VALUES ($1, NULLIF($2,'')::uuid, NULLIF($3,'')::uuid, 'Replanned', $4, $5, $6::jsonb, $7, $8)`, input.WOID, previousLineID, selection.LineID, input.UserID, input.Reason, string(selection.EvaluatedJSON), currentRowVersion, input.TraceID); err != nil {
		return nil, fmt.Errorf("WO_LINE_REPLAN_AUDIT_FAILED: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return CurrentLineReadiness(ctx, pool, input.WOID)
}
