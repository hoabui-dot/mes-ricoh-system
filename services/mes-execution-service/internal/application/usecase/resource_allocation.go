package usecase

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/infrastructure/client"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

const defaultSystemUser = "00000000-0000-0000-0000-000000000001"

type AllocationService struct {
	pool    *pgxpool.Pool
	planner *client.ResourcePlanningClient
}

func NewAllocationService(pool *pgxpool.Pool, planner *client.ResourcePlanningClient) *AllocationService {
	return &AllocationService{pool: pool, planner: planner}
}

func asString(v interface{}) string {
	if v == nil {
		return ""
	}
	if value, ok := v.(*string); ok {
		if value == nil {
			return ""
		}
		return *value
	}
	return fmt.Sprint(v)
}
func asFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case json.Number:
		f, _ := n.Float64()
		return f
	default:
		return 0
	}
}
func nested(m map[string]interface{}, key string) map[string]interface{} {
	v, _ := m[key].(map[string]interface{})
	return v
}
func containsID(candidate map[string]interface{}, key, value string) bool {
	return value == "" || asString(candidate[key]) == value
}

func hasListEntries(value interface{}) bool {
	switch list := value.(type) {
	case []interface{}:
		return len(list) > 0
	case []map[string]interface{}:
		return len(list) > 0
	default:
		return false
	}
}

func proposalCandidateReady(candidate map[string]interface{}) bool {
	readiness := strings.ToLower(asString(candidate["readiness"]))
	return readiness != "blocked" && !hasListEntries(candidate["blocking_errors"]) && !hasListEntries(candidate["capacity_conflicts"])
}

func (s *AllocationService) workOrderContext(ctx context.Context, woID, opID string) (map[string]interface{}, error) {
	var site, product, woStatus, lineStatus, selectedLine string
	var shift *string
	var quantity float64
	var start time.Time
	var rowVersion int
	err := s.pool.QueryRow(ctx, `SELECT h.site_id, h.item_revision_id, h.shift_id, h.quantity, h.planned_start_at, h.status::text, h.row_version, h.line_selection_status, COALESCE(h.selected_production_line_id::text, '') FROM wo_header h WHERE h.wo_id=$1`, woID).Scan(&site, &product, &shift, &quantity, &start, &woStatus, &rowVersion, &lineStatus, &selectedLine)
	if err != nil {
		return nil, fmt.Errorf("work order not found: %w", err)
	}
	var operationID, routingOperationID, workCenter string
	var seq int
	err = s.pool.QueryRow(ctx, `SELECT operation_id, COALESCE(routing_operation_id, operation_id), work_center_id, sequence_no FROM wo_operation WHERE wo_operation_id=$1 AND wo_id=$2`, opID, woID).Scan(&operationID, &routingOperationID, &workCenter, &seq)
	if err != nil {
		return nil, fmt.Errorf("work order operation not found: %w", err)
	}
	shiftID := ""
	if shift != nil {
		shiftID = *shift
	}
	return map[string]interface{}{"site_id": site, "product_revision_id": product, "shift_id": shiftID, "quantity": quantity, "planned_start_at": start, "status": woStatus, "row_version": rowVersion, "routing_operation_id": routingOperationID, "work_center_id": workCenter, "sequence": seq, "operation_id": operationID, "line_selection_status": lineStatus, "selected_production_line_id": selectedLine}, nil
}

func readinessRequest(ctx map[string]interface{}, start time.Time, shift string) map[string]interface{} {
	return map[string]interface{}{"site_id": ctx["site_id"], "product_revision_id": ctx["product_revision_id"], "routing_operation_id": ctx["routing_operation_id"], "work_center_id": ctx["work_center_id"], "production_line_id": ctx["selected_production_line_id"], "quantity": ctx["quantity"], "planned_date": start.UTC().Format("2006-01-02"), "shift_id": shift}
}

func (s *AllocationService) Candidates(ctx context.Context, woID, opID, plannedStart, shiftID, userID, traceID string) (map[string]interface{}, error) {
	ctxData, err := s.workOrderContext(ctx, woID, opID)
	if err != nil {
		return nil, err
	}
	if asString(ctxData["line_selection_status"]) == "RESOURCE_HOLD" {
		return map[string]interface{}{"status": "Blocked", "blocking_errors": []map[string]interface{}{{"code": "WO_LINE_RESOURCE_HOLD"}}, "warnings": []map[string]interface{}{}, "candidates": []interface{}{}, "operation": map[string]interface{}{"id": opID, "sequence": ctxData["sequence"], "work_center_id": ctxData["work_center_id"], "production_line_id": ctxData["selected_production_line_id"]}}, nil
	}
	if asString(ctxData["selected_production_line_id"]) == "" {
		return map[string]interface{}{"status": "Blocked", "blocking_errors": []map[string]interface{}{{"code": "WO_LINE_SELECTION_REQUIRED"}}, "warnings": []map[string]interface{}{}, "candidates": []interface{}{}, "operation": map[string]interface{}{"id": opID, "sequence": ctxData["sequence"], "work_center_id": ctxData["work_center_id"]}}, nil
	}
	start := ctxData["planned_start_at"].(time.Time)
	if plannedStart != "" {
		if parsed, e := time.Parse(time.RFC3339, plannedStart); e == nil {
			start = parsed
		}
	} else {
		// When the client does not provide a window, keep the default preview
		// sequential with already committed predecessor operations. Otherwise
		// every operation would be evaluated at the WO start and falsely report
		// a capacity conflict against the first allocation.
		var previousEnd *time.Time
		if err := s.pool.QueryRow(ctx, `
			SELECT MAX(a.planned_end_at)
			FROM wo_resource_allocation a
			JOIN wo_operation previous ON previous.wo_operation_id = a.wo_operation_id
			JOIN wo_operation current ON current.wo_operation_id = $2
			WHERE a.wo_id = $1
			  AND a.status IN ('Draft','Validated','Committed')
			  AND previous.sequence_no < current.sequence_no`, woID, opID).Scan(&previousEnd); err == nil && previousEnd != nil && previousEnd.After(start) {
			start = *previousEnd
		}
	}
	shift := asString(ctxData["shift_id"])
	if shiftID != "" {
		shift = shiftID
	}
	if shift == "" {
		return map[string]interface{}{
			"status":          "Blocked",
			"blocking_errors": []map[string]interface{}{{"code": "SHIFT_REQUIRED", "message": "A Work Order Shift is required before resource candidates can be evaluated."}},
			"warnings":        []map[string]interface{}{},
			"candidates":      []interface{}{},
			"operation":       map[string]interface{}{"id": opID, "sequence": ctxData["sequence"], "work_center_id": ctxData["work_center_id"]},
		}, nil
	}
	result, err := s.planner.Readiness(ctx, readinessRequest(ctxData, start, shift), map[string]string{"X-User-ID": userID, "X-Trace-ID": traceID})
	if err != nil {
		return nil, err
	}
	current, _ := s.activeAllocation(ctx, opID)
	excludeAllocationID := ""
	if current != nil {
		excludeAllocationID = asString(current["allocation_id"])
	}
	result["operation"] = map[string]interface{}{"id": opID, "sequence": ctxData["sequence"], "work_center_id": ctxData["work_center_id"], "production_line_id": ctxData["selected_production_line_id"]}
	result["requested_window"] = map[string]interface{}{"start_at": start.UTC().Format(time.RFC3339), "shift_id": shift}
	result["current_allocation"] = current
	if list, ok := result["candidates"].([]interface{}); ok {
		for _, raw := range list {
			if c, ok := raw.(map[string]interface{}); ok {
				duration := asFloat(c["estimated_duration_min"])
				if duration == 0 {
					duration = asFloat(nested(c, "calculation")["estimated_duration_min"])
				}
				s.addCapacityView(ctx, c, start, start.Add(time.Duration(duration*float64(time.Minute))), excludeAllocationID)
			}
		}
	}
	return result, nil
}

// Proposals builds one backend-owned recommendation per Work Order operation.
// It intentionally delegates readiness and ordering to Candidates and creates
// no allocation or reservation records.
func (s *AllocationService) Proposals(ctx context.Context, woID, userID, traceID string) (map[string]interface{}, error) {
	var lineID, lineCode, lineStatus, shiftID string
	var lineName []byte
	var plannedStart time.Time
	var rowVersion int
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(selected_production_line_id::text,''), COALESCE(selected_production_line_code,''),
		       COALESCE(selected_production_line_name_i18n,'{}'::jsonb), line_selection_status,
		       COALESCE(shift_id::text,''), planned_start_at, row_version
		FROM wo_header WHERE wo_id=$1
	`, woID).Scan(&lineID, &lineCode, &lineName, &lineStatus, &shiftID, &plannedStart, &rowVersion); err != nil {
		return nil, fmt.Errorf("work order not found: %w", err)
	}

	base := map[string]interface{}{
		"work_order_id": woID,
		"selected_production_line": map[string]interface{}{
			"id": lineID, "code": lineCode, "name_i18n": json.RawMessage(lineName),
		},
		"generated_at":           time.Now().UTC().Format(time.RFC3339Nano),
		"work_order_row_version": rowVersion,
	}
	if lineStatus == "RESOURCE_HOLD" || lineID == "" {
		code := "WO_LINE_SELECTION_REQUIRED"
		if lineStatus == "RESOURCE_HOLD" {
			code = "WO_LINE_RESOURCE_HOLD"
		}
		base["complete"] = false
		base["blocking_errors"] = []map[string]interface{}{{"code": code}}
		base["operations"] = []interface{}{}
		hash := sha256.Sum256([]byte(fmt.Sprintf("%s|%d|%s", woID, rowVersion, code)))
		base["proposal_version"] = hex.EncodeToString(hash[:])
		return base, nil
	}
	if shiftID == "" {
		base["complete"] = false
		base["blocking_errors"] = []map[string]interface{}{{"code": "SHIFT_REQUIRED"}}
		base["operations"] = []interface{}{}
		return base, nil
	}

	rows, err := s.pool.Query(ctx, `
		SELECT wo_operation_id::text, operation_code, sequence_no,
		       COALESCE(production_line_id::text,''), COALESCE(production_line_code,'')
		FROM wo_operation WHERE wo_id=$1 ORDER BY sequence_no, wo_operation_id
	`, woID)
	if err != nil {
		return nil, fmt.Errorf("RESOURCE_PROPOSAL_OPERATION_QUERY_FAILED: %w", err)
	}
	defer rows.Close()
	type operationRow struct {
		ID, Code, LineID, LineCode string
		Sequence                   int
	}
	operations := []operationRow{}
	for rows.Next() {
		var operation operationRow
		if err := rows.Scan(&operation.ID, &operation.Code, &operation.Sequence, &operation.LineID, &operation.LineCode); err != nil {
			return nil, fmt.Errorf("RESOURCE_PROPOSAL_OPERATION_SCAN_FAILED: %w", err)
		}
		operations = append(operations, operation)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("RESOURCE_PROPOSAL_OPERATION_ROWS_FAILED: %w", err)
	}

	complete := len(operations) > 0
	proposalOperations := make([]map[string]interface{}, 0, len(operations))
	versionParts := []string{woID, fmt.Sprint(rowVersion), lineID, shiftID}
	cursor := plannedStart
	for _, operation := range operations {
		item := map[string]interface{}{
			"operation_id": operation.ID, "operation_code": operation.Code, "sequence": operation.Sequence,
			"production_line": map[string]interface{}{"id": operation.LineID, "code": operation.LineCode},
			"blocking_errors": []interface{}{}, "alternatives": []interface{}{},
		}
		if operation.LineID != lineID {
			item["blocking_errors"] = []map[string]interface{}{{"code": "WO_LINE_MIXED_ALLOCATION_REJECTED"}}
			complete = false
			proposalOperations = append(proposalOperations, item)
			continue
		}
		candidateResult, err := s.Candidates(ctx, woID, operation.ID, cursor.UTC().Format(time.RFC3339), shiftID, userID, traceID)
		if err != nil {
			return nil, err
		}
		item["requested_window"] = candidateResult["requested_window"]
		item["current_allocation"] = candidateResult["current_allocation"]
		item["warnings"] = candidateResult["warnings"]
		operationBlocked := hasListEntries(candidateResult["blocking_errors"])
		if operationBlocked {
			item["blocking_errors"] = candidateResult["blocking_errors"]
		}
		alternatives := []interface{}{}
		var recommended map[string]interface{}
		if candidates, ok := candidateResult["candidates"].([]interface{}); ok {
			for _, raw := range candidates {
				candidate, _ := raw.(map[string]interface{})
				if candidate == nil {
					continue
				}
				candidate["production_line"] = map[string]interface{}{"id": lineID, "code": lineCode}
				candidate["freshness_token"] = fmt.Sprintf("%d:%s:%s:%s", rowVersion, asString(nested(candidate, "workstation")["id"]), asString(nested(candidate, "equipment")["id"]), cursor.UTC().Format(time.RFC3339))
				alternatives = append(alternatives, candidate)
				if !operationBlocked && recommended == nil && proposalCandidateReady(candidate) {
					recommended = candidate
				}
			}
		}
		item["alternatives"] = alternatives
		if recommended == nil {
			complete = false
			if !hasListEntries(item["blocking_errors"]) {
				item["blocking_errors"] = []map[string]interface{}{{"code": "RESOURCE_READY_CANDIDATE_MISSING"}}
			}
		} else {
			recommended["selection_reasons"] = []string{"AUTHORITATIVE_CANDIDATE_ORDER", "READY", "SELECTED_LINE_ONLY", "NO_CAPACITY_OR_RESERVATION_CONFLICT"}
			item["recommended_candidate"] = recommended
			item["selected_candidate"] = recommended
			duration := asFloat(recommended["estimated_duration_min"])
			if duration == 0 {
				duration = asFloat(nested(recommended, "calculation")["estimated_duration_min"])
			}
			if duration < 1 {
				duration = 1
			}
			cursor = cursor.Add(time.Duration(duration * float64(time.Minute)))
			versionParts = append(versionParts, operation.ID, asString(recommended["freshness_token"]))
		}
		proposalOperations = append(proposalOperations, item)
	}
	base["complete"] = complete
	base["operations"] = proposalOperations
	hash := sha256.Sum256([]byte(strings.Join(versionParts, "|")))
	base["proposal_version"] = hex.EncodeToString(hash[:])
	return base, nil
}

func (s *AllocationService) addCapacityView(ctx context.Context, c map[string]interface{}, start, end time.Time, excludeAllocationID string) {
	resources := []struct{ typ, id string }{{"Equipment", asString(nested(c, "equipment")["id"])}, {"Workstation", asString(nested(c, "workstation")["id"])}}
	conflicts := []interface{}{}
	for _, resource := range resources {
		if resource.id == "" {
			continue
		}
		var count int
		if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM wo_capacity_reservation WHERE resource_type=$1 AND resource_id=$2 AND status IN ('Tentative','Committed') AND start_at < $4 AND end_at > $3 AND allocation_id <> COALESCE($5::uuid,'00000000-0000-0000-0000-000000000000')`, resource.typ, resource.id, start, end, nilIfEmpty(excludeAllocationID)).Scan(&count); err != nil {
			conflicts = append(conflicts, map[string]interface{}{"code": "RESOURCE_CAPACITY_QUERY_FAILED", "resource_type": resource.typ})
			continue
		}
		if count > 0 {
			conflicts = append(conflicts, map[string]interface{}{"code": "RESOURCE_CAPACITY_CONFLICT", "resource_type": resource.typ, "active_reservations": count})
		}
	}
	c["capacity_conflicts"] = conflicts
	if len(conflicts) > 0 {
		// Capacity is an execution-owned readiness dimension. Mark the candidate
		// blocked before it reaches the UI so selection cannot rely on stale data.
		c["readiness"] = "Blocked"
		errors, _ := c["blocking_errors"].([]interface{})
		errors = append(errors, map[string]interface{}{"code": "EQUIPMENT_CAPACITY_CONFLICT"})
		c["blocking_errors"] = errors
		if equipment := nested(c, "equipment"); equipment["id"] != nil {
			if readiness := nested(c, "equipment_readiness"); len(readiness) > 0 {
				readiness["status"] = "Blocked"
				readiness["capacity"] = map[string]interface{}{"status": "Conflict", "conflicts": conflicts}
			}
		}
	} else if readiness := nested(c, "equipment_readiness"); len(readiness) > 0 {
		readiness["capacity"] = map[string]interface{}{"status": "Available"}
	}
	duration := asFloat(c["estimated_duration_min"])
	if duration == 0 {
		duration = asFloat(nested(c, "calculation")["estimated_duration_min"])
	}
	c["remaining_minutes_after_allocation"] = asFloat(nested(c, "calendar")["available_minutes"]) - duration
}

func (s *AllocationService) activeAllocation(ctx context.Context, opID string) (map[string]interface{}, error) {
	var id, status, validation, wc, ws, eq, shift, start, end, snapshot, warnings string
	err := s.pool.QueryRow(ctx, `SELECT allocation_id,status,validation_status,planned_work_center_id,COALESCE(planned_workstation_id::text,''),COALESCE(planned_equipment_id::text,''),planned_shift_id,planned_start_at::text,planned_end_at::text,validation_snapshot::text,warning_codes::text FROM wo_resource_allocation WHERE wo_operation_id=$1 AND status IN ('Draft','Validated','Committed')`, opID).Scan(&id, &status, &validation, &wc, &ws, &eq, &shift, &start, &end, &snapshot, &warnings)
	if err != nil {
		return nil, nil
	}
	var snap, warn interface{}
	_ = json.Unmarshal([]byte(snapshot), &snap)
	_ = json.Unmarshal([]byte(warnings), &warn)
	return map[string]interface{}{"allocation_id": id, "status": status, "validation_status": validation, "planned_work_center_id": wc, "planned_workstation_id": ws, "planned_equipment_id": eq, "planned_shift_id": shift, "planned_start_at": start, "planned_end_at": end, "validation_snapshot": snap, "warning_codes": warn}, nil
}

type AllocationInput struct {
	WorkstationID      string `json:"workstation_id"`
	EquipmentID        string `json:"equipment_id"`
	MachineGroupID     string `json:"machine_group_id"`
	ShiftID            string `json:"shift_id"`
	PlannedStartAt     string `json:"planned_start_at"`
	CandidateReference string `json:"candidate_reference"`
	RowVersion         int    `json:"row_version"`
	ChangeReason       string `json:"change_reason"`
	Source             string `json:"source"`
}

func (s *AllocationService) Allocate(ctx context.Context, woID, opID string, input AllocationInput, userID, traceID, idempotency string, reallocate bool) (map[string]interface{}, error) {
	if userID == "" {
		userID = defaultSystemUser
	}
	if input.Source == "" {
		input.Source = "PlannerSelected"
	}
	if input.PlannedStartAt == "" {
		return nil, fmt.Errorf("PLANNED_START_REQUIRED")
	}
	ctxData, err := s.workOrderContext(ctx, woID, opID)
	if err != nil {
		return nil, err
	}
	if input.RowVersion > 0 && input.RowVersion != int(ctxData["row_version"].(int)) {
		return nil, fmt.Errorf("WO_ALLOCATION_VERSION_CONFLICT")
	}
	if asString(ctxData["line_selection_status"]) == "RESOURCE_HOLD" {
		return nil, fmt.Errorf("WO_LINE_RESOURCE_HOLD")
	}
	selectedLineID := asString(ctxData["selected_production_line_id"])
	if selectedLineID == "" {
		return nil, fmt.Errorf("WO_LINE_SELECTION_REQUIRED")
	}
	if input.ChangeReason == "" && reallocate {
		return nil, fmt.Errorf("CHANGE_REASON_REQUIRED")
	}
	hashBytes := sha256.Sum256([]byte(fmt.Sprintf("%s|%s|%s|%s|%s|%d", woID, opID, input.WorkstationID, input.EquipmentID, input.PlannedStartAt, input.RowVersion)))
	requestHash := hex.EncodeToString(hashBytes[:])
	if idempotency != "" {
		var payload []byte
		err := s.pool.QueryRow(ctx, `SELECT response_payload FROM wo_resource_allocation_idempotency WHERE user_id=$1 AND idempotency_key=$2 AND request_hash=$3`, userID, idempotency, requestHash).Scan(&payload)
		if err == nil {
			var out map[string]interface{}
			_ = json.Unmarshal(payload, &out)
			return out, nil
		}
		var exists string
		if s.pool.QueryRow(ctx, `SELECT request_hash FROM wo_resource_allocation_idempotency WHERE user_id=$1 AND idempotency_key=$2`, userID, idempotency).Scan(&exists) == nil {
			return nil, fmt.Errorf("IDEMPOTENCY_KEY_CONFLICT")
		}
	}
	start, _ := time.Parse(time.RFC3339, input.PlannedStartAt)
	shift := input.ShiftID
	if shift == "" {
		shift = asString(ctxData["shift_id"])
	}
	if shift == "" {
		return nil, fmt.Errorf("SHIFT_REQUIRED")
	}
	readiness, err := s.planner.Readiness(ctx, readinessRequest(ctxData, start, shift), map[string]string{"X-User-ID": userID, "X-Trace-ID": traceID})
	if err != nil {
		return nil, err
	}
	if asString(readiness["status"]) == "Blocked" {
		return nil, fmt.Errorf("RESOURCE_CANDIDATE_STALE")
	}
	var selected map[string]interface{}
	candidates, _ := readiness["candidates"].([]interface{})
	for _, raw := range candidates {
		c, _ := raw.(map[string]interface{})
		if containsID(nested(c, "workstation"), "id", input.WorkstationID) && containsID(nested(c, "equipment"), "id", input.EquipmentID) && containsID(nested(c, "machine_group"), "id", input.MachineGroupID) {
			selected = c
			break
		}
	}
	if selected == nil {
		return nil, fmt.Errorf("RESOURCE_CANDIDATE_STALE")
	}
	if errors, _ := selected["blocking_errors"].([]interface{}); len(errors) > 0 {
		return nil, fmt.Errorf("RESOURCE_CANDIDATE_STALE")
	}
	duration := asFloat(selected["estimated_duration_min"])
	if duration == 0 {
		duration = asFloat(nested(selected, "calculation")["estimated_duration_min"])
	}
	end := start.Add(time.Duration(duration * float64(time.Minute)))
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, input.EquipmentID+"|"+input.WorkstationID+"|"+asString(ctxData["work_center_id"])); err != nil {
		return nil, fmt.Errorf("RESOURCE_ALLOCATION_LOCK_FAILED: %w", err)
	}
	status := asString(ctxData["status"])
	if status != "Draft" && status != "PendingApproval" {
		return nil, fmt.Errorf("ALLOCATION_LIFECYCLE_LOCKED")
	}
	if err := requireSelectedLineConsistency(ctx, tx, woID); err != nil {
		return nil, err
	}
	var oldID string
	if err := tx.QueryRow(ctx, `SELECT allocation_id FROM wo_resource_allocation WHERE wo_operation_id=$1 AND status IN ('Draft','Validated','Committed') FOR UPDATE`, opID).Scan(&oldID); err != nil && err != pgx.ErrNoRows {
		return nil, fmt.Errorf("RESOURCE_ALLOCATION_QUERY_FAILED: %w", err)
	}
	for _, resource := range []struct{ typ, id string }{{"Equipment", input.EquipmentID}, {"Workstation", input.WorkstationID}, {"WorkCenter", asString(ctxData["work_center_id"])}} {
		if resource.id == "" {
			continue
		}
		var count int
		if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM wo_capacity_reservation WHERE resource_type=$1 AND resource_id=$2 AND status IN ('Tentative','Committed') AND start_at < $4 AND end_at > $3 AND allocation_id <> COALESCE($5::uuid,'00000000-0000-0000-0000-000000000000')`, resource.typ, resource.id, start, end, nilIfEmpty(oldID)).Scan(&count); err != nil {
			return nil, fmt.Errorf("RESOURCE_CAPACITY_QUERY_FAILED: %w", err)
		}
		if count > 0 {
			return nil, fmt.Errorf("RESOURCE_CAPACITY_CONFLICT")
		}
	}
	if oldID != "" {
		if _, err := tx.Exec(ctx, `UPDATE wo_resource_allocation SET status='Superseded', superseded_by_allocation_id=NULL, row_version=row_version+1 WHERE allocation_id=$1`, oldID); err != nil {
			return nil, fmt.Errorf("RESOURCE_ALLOCATION_SUPERSEDE_FAILED: %w", err)
		}
		if _, err := tx.Exec(ctx, `UPDATE wo_capacity_reservation SET status='Cancelled',updated_at=now() WHERE allocation_id=$1 AND status IN ('Tentative','Committed')`, oldID); err != nil {
			return nil, fmt.Errorf("RESOURCE_RESERVATION_CANCEL_FAILED: %w", err)
		}
	}
	allocationID := uuid.New().String()
	validationStatus := "Valid"
	warningCodes, _ := json.Marshal(selected["warnings"])
	snapshot, _ := json.Marshal(map[string]interface{}{"assignment": nested(selected, "assignment"), "capability": nested(selected, "capability"), "calendar": nested(selected, "calendar"), "production_standard": nested(selected, "production_standard"), "calculation": nested(selected, "calculation"), "candidate": selected})
	if len(warningCodes) > 2 {
		validationStatus = "ValidWithWarnings"
	}
	supportingUnits, _ := json.Marshal(selected["supporting_machines"])
	primaryUnit := asString(nested(selected, "primary_machine")["unit_id"])
	_, err = tx.Exec(ctx, `INSERT INTO wo_resource_allocation (allocation_id,wo_id,wo_operation_id,site_id,planned_production_line_id,planned_work_center_id,planned_workstation_id,planned_equipment_id,planned_machine_group_id,planned_primary_machine_unit_id,planned_supporting_machine_units,planned_shift_id,planned_start_at,planned_end_at,source,status,validation_status,resource_assignment_id,resource_capability_id,production_standard_id,resource_calendar_id, candidate_rank,setup_time_min,run_time_min,queue_time_min,move_time_min,total_duration_min,warning_codes,validation_snapshot,allocated_by,change_reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'PlannerSelected','Committed',$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`, allocationID, woID, opID, ctxData["site_id"], selectedLineID, ctxData["work_center_id"], nilIfEmpty(input.WorkstationID), nilIfEmpty(input.EquipmentID), nilIfEmpty(input.MachineGroupID), nilIfEmpty(primaryUnit), supportingUnits, shift, start, end, validationStatus, asString(nested(selected, "assignment")["id"]), asString(nested(selected, "capability")["id"]), asString(nested(selected, "production_standard")["id"]), asString(nested(selected, "calendar")["id"]), 1, asFloat(nested(selected, "calculation")["setup_time_min"]), asFloat(nested(selected, "calculation")["run_duration_min"]), asFloat(nested(selected, "calculation")["queue_time_min"]), asFloat(nested(selected, "calculation")["move_time_min"]), duration, warningCodes, snapshot, userID, input.ChangeReason)
	if err != nil {
		return nil, err
	}
	for _, resource := range []struct{ typ, id string }{{"Equipment", input.EquipmentID}, {"Workstation", input.WorkstationID}, {"WorkCenter", asString(ctxData["work_center_id"])}} {
		if resource.id == "" {
			continue
		}
		_, err = tx.Exec(ctx, `INSERT INTO wo_capacity_reservation (allocation_id,wo_id,wo_operation_id,resource_type,resource_id,shift_id,start_at,end_at,production_line_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, allocationID, woID, opID, resource.typ, resource.id, shift, start, end, selectedLineID)
		if err != nil {
			return nil, err
		}
	}
	if supporting, ok := selected["supporting_machines"].([]interface{}); ok {
		for _, raw := range supporting {
			member, _ := raw.(map[string]interface{})
			if asString(member["required"]) == "false" {
				continue
			}
			unitID := asString(member["unit_id"])
			if unitID == "" {
				continue
			}
			var count int
			if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM wo_capacity_reservation WHERE resource_type='MachineUnit' AND resource_id=$1 AND status IN ('Tentative','Committed') AND start_at < $3 AND end_at > $2`, unitID, start, end).Scan(&count); err != nil {
				return nil, fmt.Errorf("RESOURCE_MACHINE_UNIT_QUERY_FAILED: %w", err)
			}
			if count > 0 {
				return nil, fmt.Errorf("RESOURCE_CAPACITY_CONFLICT")
			}
			_, err = tx.Exec(ctx, `INSERT INTO wo_capacity_reservation (allocation_id,wo_id,wo_operation_id,resource_type,resource_id,shift_id,start_at,end_at,production_line_id) VALUES ($1,$2,$3,'MachineUnit',$4,$5,$6,$7,$8)`, allocationID, woID, opID, unitID, shift, start, end, selectedLineID)
			if err != nil {
				return nil, err
			}
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wo_resource_allocation_audit (allocation_id,wo_id,wo_operation_id,action,previous_allocation_id,new_allocation_id,actor_user_id,change_reason,candidate_rank,validation_status,warning_codes,trace_id,wo_row_version) VALUES ($1,$2,$3,$4,$5,$1,$6,$7,1,$8,$9,$10,$11)`, allocationID, woID, opID, map[bool]string{true: "Reallocated", false: "Allocated"}[reallocate], nilIfEmpty(oldID), userID, input.ChangeReason, validationStatus, warningCodes, traceID, ctxData["row_version"]); err != nil {
		return nil, fmt.Errorf("RESOURCE_ALLOCATION_AUDIT_WRITE_FAILED: %w", err)
	}
	payload := map[string]interface{}{"allocation_id": allocationID, "wo_id": woID, "wo_operation_id": opID, "status": "Validated", "planned_production_line_id": selectedLineID, "planned_start_at": start, "planned_end_at": end, "candidate": selected}
	envelope := sharedkernel.CreateEventEnvelope(map[bool]string{true: "MES.Execution.WOResourceReallocated.v1", false: "MES.Execution.WOResourceAllocated.v1"}[reallocate], "mes-execution-service", traceID, payload)
	eventType := map[bool]string{true: "MES.Execution.WOResourceReallocated.v1", false: "MES.Execution.WOResourceAllocated.v1"}[reallocate]
	if err := sharedkernel.WriteToOutbox(ctx, tx, eventType, envelope); err != nil {
		return nil, err
	}
	out := map[string]interface{}{"allocation_id": allocationID, "wo_id": woID, "wo_operation_id": opID, "status": "Committed", "validation_status": validationStatus, "planned_production_line_id": selectedLineID, "planned_start_at": start, "planned_end_at": end, "warning_codes": json.RawMessage(warningCodes), "candidate": selected}
	encoded, _ := json.Marshal(out)
	if idempotency != "" {
		if _, err := tx.Exec(ctx, `INSERT INTO wo_resource_allocation_idempotency (idempotency_key,user_id,request_hash,allocation_id,response_payload) VALUES ($1,$2,$3,$4,$5)`, idempotency, userID, requestHash, allocationID, encoded); err != nil {
			return nil, fmt.Errorf("RESOURCE_ALLOCATION_IDEMPOTENCY_WRITE_FAILED: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return out, nil
}

func nilIfEmpty(value string) interface{} {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func (s *AllocationService) Revalidate(ctx context.Context, woID, userID, traceID string) (map[string]interface{}, error) {
	if err := requireSelectedLineConsistency(ctx, s.pool, woID); err != nil {
		return map[string]interface{}{"wo_id": woID, "valid": false, "error_code": err.Error()}, nil
	}
	var operationCount, committedCount int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM wo_operation WHERE wo_id=$1`, woID).Scan(&operationCount); err != nil {
		return nil, err
	}
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM wo_resource_allocation WHERE wo_id=$1 AND status='Committed' AND validation_status IN ('Valid','ValidWithWarnings')`, woID).Scan(&committedCount); err != nil {
		return nil, err
	}
	if operationCount != committedCount {
		return map[string]interface{}{"wo_id": woID, "valid": false, "error_code": "WO_OPERATION_ALLOCATION_MISSING", "operation_count": operationCount, "committed_allocation_count": committedCount}, nil
	}
	rows, err := s.pool.Query(ctx, `SELECT wo_operation_id, planned_start_at, planned_shift_id, planned_workstation_id, planned_equipment_id, planned_machine_group_id, planned_primary_machine_unit_id FROM wo_resource_allocation WHERE wo_id=$1 AND status IN ('Draft','Validated','Committed')`, woID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := []interface{}{}
	valid := true
	for rows.Next() {
		var opID string
		var start time.Time
		var shift, ws, eq, machineGroup, primaryUnit *string
		if err := rows.Scan(&opID, &start, &shift, &ws, &eq, &machineGroup, &primaryUnit); err != nil {
			return nil, fmt.Errorf("RESOURCE_REVALIDATION_SCAN_FAILED: %w", err)
		}
		c, err := s.Candidates(ctx, woID, opID, start.UTC().Format(time.RFC3339), asString(shift), userID, traceID)
		if err != nil {
			return nil, err
		}
		ok := false
		candidates, _ := c["candidates"].([]interface{})
		for _, raw := range candidates {
			candidate, _ := raw.(map[string]interface{})
			matchesWorkstation := containsID(nested(candidate, "workstation"), "id", asString(ws))
			matchesEquipment := asString(eq) == "" || containsID(nested(candidate, "equipment"), "id", asString(eq)) || containsID(nested(candidate, "primary_machine"), "id", asString(eq))
			matchesMachineGroup := asString(machineGroup) == "" || containsID(nested(candidate, "machine_group"), "id", asString(machineGroup))
			matchesPrimaryUnit := asString(primaryUnit) == "" || asString(nested(candidate, "primary_machine")["unit_id"]) == asString(primaryUnit)
			if matchesWorkstation && matchesEquipment && matchesMachineGroup && matchesPrimaryUnit && proposalCandidateReady(candidate) {
				ok = true
			}
		}
		if !ok {
			valid = false
			errorCode := "RESOURCE_CANDIDATE_STALE"
			if blockers, ok := c["blocking_errors"].([]interface{}); ok && len(blockers) > 0 {
				if blocker, ok := blockers[0].(map[string]interface{}); ok && asString(blocker["code"]) != "" {
					errorCode = asString(blocker["code"])
				}
			}
			if _, err := s.pool.Exec(ctx, `UPDATE wo_resource_allocation SET validation_status='Stale',row_version=row_version+1 WHERE allocation_id=(SELECT allocation_id FROM wo_resource_allocation WHERE wo_operation_id=$1 AND status IN ('Draft','Validated','Committed') LIMIT 1)`, opID); err != nil {
				return nil, fmt.Errorf("RESOURCE_REVALIDATION_UPDATE_FAILED: %w", err)
			}
			results = append(results, map[string]interface{}{"wo_operation_id": opID, "valid": false, "error_code": errorCode})
			continue
		}
		results = append(results, map[string]interface{}{"wo_operation_id": opID, "valid": ok})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("RESOURCE_REVALIDATION_QUERY_FAILED: %w", err)
	}
	return map[string]interface{}{"wo_id": woID, "valid": valid, "operations": results}, nil
}
