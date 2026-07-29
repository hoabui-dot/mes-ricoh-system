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

func (s *AllocationService) workOrderContext(ctx context.Context, woID, opID string) (map[string]interface{}, error) {
	var site, product, woStatus string
	var shift *string
	var quantity float64
	var start time.Time
	var rowVersion int
	err := s.pool.QueryRow(ctx, `SELECT h.site_id, h.item_revision_id, h.shift_id, h.quantity, h.planned_start_at, h.status::text, h.row_version FROM wo_header h WHERE h.wo_id=$1`, woID).Scan(&site, &product, &shift, &quantity, &start, &woStatus, &rowVersion)
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
	return map[string]interface{}{"site_id": site, "product_revision_id": product, "shift_id": shiftID, "quantity": quantity, "planned_start_at": start, "status": woStatus, "row_version": rowVersion, "routing_operation_id": routingOperationID, "work_center_id": workCenter, "sequence": seq, "operation_id": operationID}, nil
}

func readinessRequest(ctx map[string]interface{}, start time.Time, shift string) map[string]interface{} {
	return map[string]interface{}{"site_id": ctx["site_id"], "product_revision_id": ctx["product_revision_id"], "routing_operation_id": ctx["routing_operation_id"], "work_center_id": ctx["work_center_id"], "quantity": ctx["quantity"], "planned_date": start.UTC().Format("2006-01-02"), "shift_id": shift}
}

func (s *AllocationService) Candidates(ctx context.Context, woID, opID, plannedStart, shiftID, userID, traceID string) (map[string]interface{}, error) {
	ctxData, err := s.workOrderContext(ctx, woID, opID)
	if err != nil {
		return nil, err
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
	result["operation"] = map[string]interface{}{"id": opID, "sequence": ctxData["sequence"], "work_center_id": ctxData["work_center_id"]}
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
	_, err = tx.Exec(ctx, `INSERT INTO wo_resource_allocation (allocation_id,wo_id,wo_operation_id,site_id,planned_work_center_id,planned_workstation_id,planned_equipment_id,planned_machine_group_id,planned_primary_machine_unit_id,planned_supporting_machine_units,planned_shift_id,planned_start_at,planned_end_at,source,status,validation_status,resource_assignment_id,resource_capability_id,production_standard_id,resource_calendar_id, candidate_rank,setup_time_min,run_time_min,queue_time_min,move_time_min,total_duration_min,warning_codes,validation_snapshot,allocated_by,change_reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'PlannerSelected','Committed',$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`, allocationID, woID, opID, ctxData["site_id"], ctxData["work_center_id"], nilIfEmpty(input.WorkstationID), nilIfEmpty(input.EquipmentID), nilIfEmpty(input.MachineGroupID), nilIfEmpty(primaryUnit), supportingUnits, shift, start, end, validationStatus, asString(nested(selected, "assignment")["id"]), asString(nested(selected, "capability")["id"]), asString(nested(selected, "production_standard")["id"]), asString(nested(selected, "calendar")["id"]), 1, asFloat(nested(selected, "calculation")["setup_time_min"]), asFloat(nested(selected, "calculation")["run_duration_min"]), asFloat(nested(selected, "calculation")["queue_time_min"]), asFloat(nested(selected, "calculation")["move_time_min"]), duration, warningCodes, snapshot, userID, input.ChangeReason)
	if err != nil {
		return nil, err
	}
	for _, resource := range []struct{ typ, id string }{{"Equipment", input.EquipmentID}, {"Workstation", input.WorkstationID}, {"WorkCenter", asString(ctxData["work_center_id"])}} {
		if resource.id == "" {
			continue
		}
		_, err = tx.Exec(ctx, `INSERT INTO wo_capacity_reservation (allocation_id,wo_id,wo_operation_id,resource_type,resource_id,shift_id,start_at,end_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, allocationID, woID, opID, resource.typ, resource.id, shift, start, end)
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
			_, err = tx.Exec(ctx, `INSERT INTO wo_capacity_reservation (allocation_id,wo_id,wo_operation_id,resource_type,resource_id,shift_id,start_at,end_at) VALUES ($1,$2,$3,'MachineUnit',$4,$5,$6,$7)`, allocationID, woID, opID, unitID, shift, start, end)
			if err != nil {
				return nil, err
			}
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wo_resource_allocation_audit (allocation_id,wo_id,wo_operation_id,action,previous_allocation_id,new_allocation_id,actor_user_id,change_reason,candidate_rank,validation_status,warning_codes,trace_id,wo_row_version) VALUES ($1,$2,$3,$4,$5,$1,$6,$7,1,$8,$9,$10,$11)`, allocationID, woID, opID, map[bool]string{true: "Reallocated", false: "Allocated"}[reallocate], nilIfEmpty(oldID), userID, input.ChangeReason, validationStatus, warningCodes, traceID, ctxData["row_version"]); err != nil {
		return nil, fmt.Errorf("RESOURCE_ALLOCATION_AUDIT_WRITE_FAILED: %w", err)
	}
	payload := map[string]interface{}{"allocation_id": allocationID, "wo_id": woID, "wo_operation_id": opID, "status": "Validated", "planned_start_at": start, "planned_end_at": end, "candidate": selected}
	envelope := sharedkernel.CreateEventEnvelope(map[bool]string{true: "MES.Execution.WOResourceReallocated.v1", false: "MES.Execution.WOResourceAllocated.v1"}[reallocate], "mes-execution-service", traceID, payload)
	eventType := map[bool]string{true: "MES.Execution.WOResourceReallocated.v1", false: "MES.Execution.WOResourceAllocated.v1"}[reallocate]
	if err := sharedkernel.WriteToOutbox(ctx, tx, eventType, envelope); err != nil {
		return nil, err
	}
	out := map[string]interface{}{"allocation_id": allocationID, "wo_id": woID, "wo_operation_id": opID, "status": "Committed", "validation_status": validationStatus, "planned_start_at": start, "planned_end_at": end, "warning_codes": json.RawMessage(warningCodes), "candidate": selected}
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
	rows, err := s.pool.Query(ctx, `SELECT wo_operation_id, planned_start_at, planned_shift_id, planned_workstation_id, planned_equipment_id FROM wo_resource_allocation WHERE wo_id=$1 AND status IN ('Draft','Validated','Committed')`, woID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := []interface{}{}
	valid := true
	for rows.Next() {
		var opID string
		var start time.Time
		var shift, ws, eq *string
		if err := rows.Scan(&opID, &start, &shift, &ws, &eq); err != nil {
			return nil, fmt.Errorf("RESOURCE_REVALIDATION_SCAN_FAILED: %w", err)
		}
		c, err := s.Candidates(ctx, woID, opID, start.UTC().Format(time.RFC3339), asString(shift), userID, traceID)
		if err != nil {
			return nil, err
		}
		ok := false
		for _, raw := range c["candidates"].([]interface{}) {
			candidate, _ := raw.(map[string]interface{})
			if containsID(nested(candidate, "workstation"), "id", asString(ws)) && containsID(nested(candidate, "equipment"), "id", asString(eq)) && asString(candidate["readiness"]) != "Blocked" {
				ok = true
			}
		}
		if !ok {
			valid = false
			if _, err := s.pool.Exec(ctx, `UPDATE wo_resource_allocation SET validation_status='Stale',row_version=row_version+1 WHERE allocation_id=(SELECT allocation_id FROM wo_resource_allocation WHERE wo_operation_id=$1 AND status IN ('Draft','Validated','Committed') LIMIT 1)`, opID); err != nil {
				return nil, fmt.Errorf("RESOURCE_REVALIDATION_UPDATE_FAILED: %w", err)
			}
		}
		results = append(results, map[string]interface{}{"wo_operation_id": opID, "valid": ok})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("RESOURCE_REVALIDATION_QUERY_FAILED: %w", err)
	}
	return map[string]interface{}{"wo_id": woID, "valid": valid, "operations": results}, nil
}
