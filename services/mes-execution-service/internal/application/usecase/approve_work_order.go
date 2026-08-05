package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

var masterDataApprovalClient = &http.Client{Timeout: 5 * time.Second}

var masterDataApprovalBreaker = sharedkernel.NewCircuitBreaker(sharedkernel.CircuitBreakerConfig{
	Name:       "MasterDataApprovalGate",
	Dependency: "mes-master-data-service",
})

type ApproveWOInput struct {
	WOID                 string
	Action               string // "Approve" or "Reject"
	Comment              string
	UserID               string
	RoleCode             string
	TraceID              string
	MasterDataServiceURL string
	DemoPrintOnApproval  bool
}

func DemoPrintOnApprovalEnabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("MES_DEMO_PRINT_ON_APPROVAL")), "true")
}

func ApproveWorkOrder(ctx context.Context, pool *pgxpool.Pool, input ApproveWOInput) (map[string]interface{}, error) {
	if input.MasterDataServiceURL == "" {
		input.MasterDataServiceURL = "http://mes-master-data-service:3020"
	}

	var pvID, currentStatus string
	err := pool.QueryRow(ctx, `SELECT production_version_id, status FROM wo_header WHERE wo_id = $1`, input.WOID).Scan(&pvID, &currentStatus)
	if err != nil {
		return nil, fmt.Errorf("work order not found: %w", err)
	}

	if input.Action == "Reject" {
		tx, err := pool.Begin(ctx)
		if err != nil {
			return nil, err
		}
		defer tx.Rollback(ctx)

		_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.UserID)
		_, err = tx.Exec(ctx, `UPDATE wo_header SET status = 'Cancelled', updated_by = $1, updated_at = NOW() WHERE wo_id = $2`, input.UserID, input.WOID)
		if err != nil {
			return nil, err
		}

		comment := "Rejected"
		if input.Comment != "" {
			comment = input.Comment
		}
		_, _ = tx.Exec(ctx, `INSERT INTO wo_approval_log (wo_id, action, actor_user_id, actor_role_code, comment) VALUES ($1, 'Rejected', $2, $3, $4)`, input.WOID, input.UserID, input.RoleCode, comment)

		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return map[string]interface{}{"wo_id": input.WOID, "status": "Cancelled"}, nil
	}

	// 1. Circuit-breaker guarded freshness re-check call to mes-master-data-service
	_, err = masterDataApprovalBreaker.Execute(func() (interface{}, error) {
		reqURL := fmt.Sprintf("%s/api/mes/master-data/production-versions/%s", input.MasterDataServiceURL, pvID)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			return nil, err
		}
		if input.UserID != "" {
			req.Header.Set("X-User-ID", input.UserID)
		}
		if input.RoleCode != "" {
			req.Header.Set("X-Role-Code", input.RoleCode)
		}
		if input.TraceID != "" {
			req.Header.Set("X-Trace-ID", input.TraceID)
		}
		resp, err := masterDataApprovalClient.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			var pvRes struct {
				LifecycleStatus string `json:"lifecycle_status"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&pvRes); err == nil && pvRes.LifecycleStatus != "" {
				if pvRes.LifecycleStatus != "Released" {
					return nil, fmt.Errorf("production version %s is no longer Released (status: %s)", pvID, pvRes.LifecycleStatus)
				}
			}
		}
		if resp.StatusCode >= http.StatusInternalServerError {
			return nil, fmt.Errorf("master-data freshness check failed: %s", resp.Status)
		}
		return nil, nil
	})
	if err != nil {
		if sharedkernel.IsCircuitBreakerOpen(err) {
			return nil, sharedkernel.NewRetryableDependencyError("mes-master-data-service", fmt.Errorf("approval gate circuit breaker open: %w", err))
		}
		return nil, sharedkernel.NewRetryableDependencyError("mes-master-data-service", fmt.Errorf("approval gate unavailable: %w", err))
	}

	// 2. Permission check
	allowed := false
	roles := []string{"EXECUTIVE", "PLANT_MANAGER", "PROD_MANAGER"}
	for _, r := range roles {
		if r == input.RoleCode {
			allowed = true
			break
		}
	}
	if !allowed {
		return nil, errors.New("unauthorized role for Work Order approval")
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.UserID)
	var operationCount int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM wo_operation WHERE wo_id = $1`, input.WOID).Scan(&operationCount); err != nil || operationCount == 0 {
		return nil, fmt.Errorf("WO_ROUTING_SNAPSHOT_MISSING")
	}
	if err := requireSelectedLineConsistency(ctx, tx, input.WOID); err != nil {
		return nil, err
	}
	if input.DemoPrintOnApproval && currentStatus != "Draft" && currentStatus != "PendingApproval" {
		var queued int
		_ = tx.QueryRow(ctx, `SELECT COUNT(*) FROM wo_print_job WHERE wo_id=$1`, input.WOID).Scan(&queued)
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return map[string]interface{}{"wo_id": input.WOID, "status": currentStatus, "approval_mode": "DEMO_PRINT_ON_APPROVAL", "material_staging_bypassed": true, "print_triggered_on_approval": queued > 0, "print_jobs_queued": queued, "idempotent_replay": true}, nil
	}

	var woCode, itemRevID, itemCode, itemName, uomID, siteID, pStart, pEnd string
	var quantity float64
	err = tx.QueryRow(ctx, `
		UPDATE wo_header
		SET status = 'Released', approved_by = $1, approved_at = NOW(), updated_by = $1, updated_at = NOW()
		WHERE wo_id = $2 AND status IN ('Draft', 'PendingApproval')
		RETURNING wo_code, item_revision_id, item_code, item_name, uom_id, site_id, quantity, planned_start_at::text, planned_end_at::text
	`, input.UserID, input.WOID).Scan(&woCode, &itemRevID, &itemCode, &itemName, &uomID, &siteID, &quantity, &pStart, &pEnd)
	if err != nil {
		return nil, fmt.Errorf("work order is not in an approvable state: %w", err)
	}

	comment := "Approved"
	if input.Comment != "" {
		comment = input.Comment
	}
	approvalMode, allocationBypassed, approvalPolicy, warnings, bypassReason := "STANDARD", false, "Strict", "[]", ""
	if input.DemoPrintOnApproval {
		approvalMode, allocationBypassed, approvalPolicy, warnings = "DEMO_PRINT_ON_APPROVAL", true, "Demo", `["DEMO_RESOURCE_ALLOCATION_BYPASSED","DEMO_MATERIAL_STAGING_BYPASSED"]`
		bypassReason = "Demo approval bypasses strict resource validation and material staging; print is triggered on approval."
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wo_approval_log (wo_id, action, actor_user_id, actor_role_code, comment, approval_mode, resource_allocation_bypassed, bypass_reason, resource_allocation_status, approval_policy, resource_allocation_warning_codes) VALUES ($1, 'Approved', $2, $3, $4, $5, $6, $7, 'Valid', $8, $9::jsonb)`, input.WOID, input.UserID, input.RoleCode, comment, approvalMode, allocationBypassed, bypassReason, approvalPolicy, warnings); err != nil {
		return nil, fmt.Errorf("failed to write approval audit: %w", err)
	}
	if input.DemoPrintOnApproval {
		if err := ensureDemoResourceAllocations(ctx, tx, input.WOID, input.UserID); err != nil {
			return nil, err
		}
		if _, err := QueueDemoPrintOperationsTx(ctx, tx, input.WOID, input.UserID, input.TraceID); err != nil {
			return nil, err
		}
	}

	reqRows, err := tx.Query(ctx, `SELECT component_item_revision_id, required_qty, uom_id FROM wo_material_requirement WHERE wo_id = $1`, input.WOID)
	type reqStruct struct {
		CompRevID string  `json:"component_item_revision_id"`
		Qty       float64 `json:"required_qty"`
		UOMID     string  `json:"uom_id"`
	}
	var reqs []reqStruct
	if err == nil {
		for reqRows.Next() {
			var r reqStruct
			_ = reqRows.Scan(&r.CompRevID, &r.Qty, &r.UOMID)
			reqs = append(reqs, r)
		}
		reqRows.Close()
	}

	payload := map[string]interface{}{
		"wo_id":                 input.WOID,
		"wo_code":               woCode,
		"item_revision_id":      itemRevID,
		"quantity":              quantity,
		"planned_start_at":      pStart,
		"planned_end_at":        pEnd,
		"material_requirements": reqs,
	}
	envelope := sharedkernel.CreateEventEnvelope("MES.Execution.WOApproved.v1", "mes-execution-service", input.TraceID, payload)
	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.WOApproved.v1", envelope); err != nil {
		return nil, fmt.Errorf("failed to write WOApproved event to outbox: %w", err)
	}
	workOrderPayload := map[string]interface{}{
		"wo_id": input.WOID, "wo_code": woCode, "item_revision_id": itemRevID,
		"item_code": itemCode, "item_name": itemName, "uom_id": uomID,
		"quantity": quantity, "site_id": siteID, "planned_start_at": pStart,
		"planned_end_at": pEnd, "status": "Released", "aggregate_version": 1,
	}
	workOrderReleased := sharedkernel.CreateEventEnvelope("MES.Execution.WorkOrderReleased.v1", "mes-execution-service", input.TraceID, workOrderPayload)
	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.WorkOrderReleased.v1", workOrderReleased); err != nil {
		return nil, fmt.Errorf("failed to write WorkOrderReleased event to outbox: %w", err)
	}
	requirementRows, err := tx.Query(ctx, `SELECT requirement_id, component_item_revision_id, component_item_code, required_qty, uom_id, COALESCE(issue_operation_id::text, ''), demand_version FROM wo_material_requirement WHERE wo_id = $1 ORDER BY requirement_id`, input.WOID)
	if err != nil {
		return nil, fmt.Errorf("failed to load material requirements: %w", err)
	}
	type materialRequirement struct {
		ID, ComponentRevisionID, ComponentCode, UOM, IssueOperationID string
		RequiredQty float64
		DemandVersion int
	}
	requirements := make([]materialRequirement, 0)
	for requirementRows.Next() {
		var requirementID, componentRevisionID, componentCode, requirementUOM, issueOperationID string
		var requiredQty float64
		var demandVersion int
		if err := requirementRows.Scan(&requirementID, &componentRevisionID, &componentCode, &requiredQty, &requirementUOM, &issueOperationID, &demandVersion); err != nil {
			requirementRows.Close()
			return nil, err
		}
		requirements = append(requirements, materialRequirement{ID: requirementID, ComponentRevisionID: componentRevisionID, ComponentCode: componentCode, UOM: requirementUOM, IssueOperationID: issueOperationID, RequiredQty: requiredQty, DemandVersion: demandVersion})
	}
	if err := requirementRows.Err(); err != nil {
		requirementRows.Close()
		return nil, fmt.Errorf("failed to read material requirements: %w", err)
	}
	requirementRows.Close()
	for _, requirement := range requirements {
		demandPayload := map[string]interface{}{"demand_id": requirement.ID, "demand_version": requirement.DemandVersion, "wo_id": input.WOID, "wo_code": woCode, "site_id": siteID, "item_revision_id": requirement.ComponentRevisionID, "item_code": requirement.ComponentCode, "required_qty": requirement.RequiredQty, "uom_id": requirement.UOM, "issue_operation_id": requirement.IssueOperationID, "status": "Released"}
		demandEvent := sharedkernel.CreateEventEnvelope("MES.Execution.MaterialRequirementPublished.v1", "mes-execution-service", input.TraceID, demandPayload)
		if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.MaterialRequirementPublished.v1", demandEvent); err != nil {
			return nil, fmt.Errorf("failed to write MaterialRequirementPublished event: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	result := map[string]interface{}{
		"wo_id":                       input.WOID,
		"wo_code":                     woCode,
		"status":                      "Released",
		"approval_mode":               approvalMode,
		"approved_by":                 input.UserID,
		"event_published":             true,
		"event_type":                  "MES.Execution.WOApproved.v1",
		"approval_policy":             approvalPolicy,
		"material_staging_bypassed":   input.DemoPrintOnApproval,
		"print_triggered_on_approval": input.DemoPrintOnApproval,
	}
	if input.DemoPrintOnApproval {
		var queued int
		_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM wo_print_job WHERE wo_id=$1`, input.WOID).Scan(&queued)
		result["print_jobs_queued"] = queued
	}
	return result, nil
}

// ensureDemoResourceAllocations creates a complete, committed planning view for
// the demo approval path. It intentionally does not reserve physical capacity;
// strict planning and reservation remain unchanged when the flag is disabled.
func ensureDemoResourceAllocations(ctx context.Context, tx interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}, woID, userID string) error {
	if _, err := tx.Exec(ctx, `SELECT wo_id FROM wo_header WHERE wo_id=$1 FOR UPDATE`, woID); err != nil {
		return err
	}
	var siteID, shiftID, selectedLineID string
	var woStart time.Time
	var quantity float64
	if err := tx.QueryRow(ctx, `SELECT site_id, shift_id, planned_start_at, quantity, COALESCE(selected_production_line_id::text, '') FROM wo_header WHERE wo_id=$1`, woID).Scan(&siteID, &shiftID, &woStart, &quantity, &selectedLineID); err != nil {
		return fmt.Errorf("DEMO_RESOURCE_ALLOCATION_FAILED: %w", err)
	}
	if selectedLineID == "" {
		return fmt.Errorf("DEMO_RESOURCE_ALLOCATION_FAILED: WO_LINE_SELECTION_REQUIRED")
	}
	if shiftID == "" {
		return fmt.Errorf("DEMO_RESOURCE_ALLOCATION_FAILED: WORK_ORDER_SHIFT_REQUIRED")
	}
	rows, err := tx.Query(ctx, `SELECT wo_operation_id, work_center_id, workstation_id, standard_setup_time_min, standard_cycle_time_sec, standard_efficiency_factor, base_quantity, standard_yield, queue_time_min, move_time_min FROM wo_operation WHERE wo_id=$1 ORDER BY sequence_no`, woID)
	if err != nil {
		return fmt.Errorf("DEMO_RESOURCE_ALLOCATION_FAILED: %w", err)
	}
	type demoOperation struct {
		opID, workCenter                                   string
		workstation                                        *string
		setup, cycle, efficiency, base, yield, queue, move *float64
	}
	var operations []demoOperation
	currentStart := woStart
	for rows.Next() {
		var operation demoOperation
		if err := rows.Scan(&operation.opID, &operation.workCenter, &operation.workstation, &operation.setup, &operation.cycle, &operation.efficiency, &operation.base, &operation.yield, &operation.queue, &operation.move); err != nil {
			return err
		}
		operations = append(operations, operation)
	}
	rowsErr := rows.Err()
	rows.Close()
	if rowsErr != nil {
		return rowsErr
	}
	for _, operation := range operations {
		opID, workCenter, workstation := operation.opID, operation.workCenter, operation.workstation
		setup, cycle, efficiency, base, yield, queue, move := operation.setup, operation.cycle, operation.efficiency, operation.base, operation.yield, operation.queue, operation.move
		var existing string
		err := tx.QueryRow(ctx, `SELECT allocation_id FROM wo_resource_allocation WHERE wo_operation_id=$1 AND status IN ('Draft','Validated','Committed') FOR UPDATE`, opID).Scan(&existing)
		if err == nil {
			continue
		}
		if err != pgx.ErrNoRows {
			return err
		}
		b := valueOrDefault(base, 1)
		e := valueOrDefault(efficiency, 1)
		y := valueOrDefault(yield, 1)
		if b <= 0 || e <= 0 || y <= 0 {
			return fmt.Errorf("DEMO_RESOURCE_ALLOCATION_FAILED: INVALID_PLANNING_SNAPSHOT")
		}
		run := (valueOrDefault(cycle, 0) / 60) * (quantity / b) / e / y
		duration := valueOrDefault(setup, 0) + run + valueOrDefault(queue, 0) + valueOrDefault(move, 0)
		if duration <= 0 {
			duration = 1
		}
		end := currentStart.Add(time.Duration(duration * float64(time.Minute)))
		allocationID := uuid.New().String()
		warnings := []byte(`["DEMO_RESOURCE_ALLOCATION_BYPASSED"]`)
		snapshot := []byte(fmt.Sprintf(`{"demo_mode":true,"base_quantity":%v,"cycle_time_sec":%v,"efficiency_factor":%v,"standard_yield":%v,"total_duration_min":%v}`, b, valueOrDefault(cycle, 0), e, y, duration))
		if _, err := tx.Exec(ctx, `INSERT INTO wo_resource_allocation (allocation_id,wo_id,wo_operation_id,site_id,planned_production_line_id,planned_work_center_id,planned_workstation_id,planned_shift_id,planned_start_at,planned_end_at,source,status,validation_status,setup_time_min,run_time_min,queue_time_min,move_time_min,total_duration_min,warning_codes,validation_snapshot,allocated_by,change_reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SystemRecommended','Committed','Valid',$11,$12,$13,$14,$15,$16,$17,$18,$19)`, allocationID, woID, opID, siteID, selectedLineID, workCenter, nilIfEmptyPtr(workstation), shiftID, currentStart, end, valueOrDefault(setup, 0), run, valueOrDefault(queue, 0), valueOrDefault(move, 0), duration, warnings, snapshot, userID, "DEMO_PRINT_ON_APPROVAL"); err != nil {
			return fmt.Errorf("DEMO_RESOURCE_ALLOCATION_FAILED: %w", err)
		}
		currentStart = end
	}
	return nil
}

func valueOrDefault(value *float64, fallback float64) float64 {
	if value != nil {
		return *value
	}
	return fallback
}

func nilIfEmptyPtr(value *string) interface{} {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil
	}
	return *value
}
