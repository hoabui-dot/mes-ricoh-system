package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/domain"
)

type kioskHeader struct {
	WOID, WOCode, ItemCode, ItemName, UOMID, UOMCode string
	LineID, LineCode, Status, DispatchMode           string
	Quantity                                         float64
	LineName                                         any
	UpdatedAt                                        time.Time
}

type kioskOperationState struct {
	SequenceNo      int
	PredecessorSeq  string
	Status          string
	Target          string
	AllocationReady bool
}

type kioskOperationProjection struct {
	WOOperationID, OperationID, OperationCode, PredecessorSeq, Status, Target string
	LineID, LineCode, WorkCenterID, WorkCenterCode, WorkstationID             string
	AllocationID, AllocationStatus, ValidationStatus                          string
	PlannedWorkstationID, PlannedEquipmentID, PlannedMachineGroupID           string
	PlannedPrimaryMachineUnitID, EquipmentCode                                string
	SequenceNo                                                                int
	OperationName, LineName, WorkCenterName, EquipmentName                    any
	ValidationSnapshot                                                        map[string]interface{}
	WarningCodes                                                              any
	ExpectedGoodQuantity                                                      *float64
	PlannedStartAt, PlannedEndAt                                              *time.Time
	LastSession                                                               *domain.KioskSessionContext
	QtyGood, QtyScrap                                                         float64
	FinishedAt                                                                *time.Time
	Failure                                                                   *domain.KioskFailureContext
}

func ListKioskWorkOrders(ctx context.Context, pool *pgxpool.Pool, terminalRef string, page, pageSize int) (*domain.KioskWorkOrderList, error) {
	if err := validateDemoTerminal(terminalRef); err != nil {
		return nil, err
	}
	page, pageSize = normalizePagination(page, pageSize)
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var total int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM wo_header h
		WHERE h.dispatch_mode='DEMO_SHARED_KIOSK'
		  AND EXISTS (SELECT 1 FROM wo_operation o WHERE o.wo_id=h.wo_id AND o.execution_target_type <> 'PRINT_STATION')
	`).Scan(&total); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `
		SELECT h.wo_id::text,h.wo_code,h.item_code,h.item_name,h.quantity::float8,h.uom_id::text,
		       COALESCE(r.base_uom_code,''),
		       COALESCE(h.selected_production_line_id::text,''),COALESCE(h.selected_production_line_code,''),
		       COALESCE(h.selected_production_line_name_i18n,'{}'::jsonb),h.status::text,h.dispatch_mode,
		       GREATEST(h.updated_at,
		         COALESCE((SELECT MAX(COALESCE(s.ended_at,s.started_at)) FROM execution_session s JOIN wo_operation o ON o.wo_operation_id=s.wo_operation_id WHERE o.wo_id=h.wo_id),h.updated_at),
		         COALESCE((SELECT MAX(c.confirmed_at) FROM operation_confirmation c JOIN wo_operation o ON o.wo_operation_id=c.wo_operation_id WHERE o.wo_id=h.wo_id),h.updated_at),
		         COALESCE((SELECT MAX(x.occurred_at) FROM wo_operation_execution_history x WHERE x.wo_id=h.wo_id),h.updated_at),
		         COALESCE((SELECT MAX(COALESCE(p.completed_at,p.failed_at,p.dispatched_at,p.created_at)) FROM wo_print_job p WHERE p.wo_id=h.wo_id),h.updated_at))
		FROM wo_header h
		LEFT JOIN rm_item_revision r ON r.master_id=h.item_revision_id
		WHERE h.dispatch_mode='DEMO_SHARED_KIOSK'
		  AND EXISTS (SELECT 1 FROM wo_operation o WHERE o.wo_id=h.wo_id AND o.execution_target_type <> 'PRINT_STATION')
		ORDER BY h.updated_at DESC,h.wo_code
		LIMIT $1 OFFSET $2
	`, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, err
	}
	headers := []kioskHeader{}
	for rows.Next() {
		header, err := scanKioskHeader(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		headers = append(headers, header)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	result := &domain.KioskWorkOrderList{Data: []domain.KioskWorkOrderSummary{}}
	for _, header := range headers {
		states, err := loadKioskOperationStates(ctx, tx, header.WOID)
		if err != nil {
			return nil, err
		}
		result.Data = append(result.Data, summarizeKioskWorkOrder(header, states))
	}
	result.Pagination = domain.KioskPagination{Page: page, PageSize: pageSize, TotalItems: total}
	if total > 0 {
		result.Pagination.TotalPages = int(math.Ceil(float64(total) / float64(pageSize)))
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

func GetKioskWorkOrderDetail(ctx context.Context, pool *pgxpool.Pool, terminalRef, woID string) (*domain.KioskWorkOrderDetail, error) {
	if err := validateDemoTerminal(terminalRef); err != nil {
		return nil, err
	}
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	header, err := loadKioskHeader(ctx, tx, woID)
	if err != nil {
		return nil, err
	}
	if header.DispatchMode != "DEMO_SHARED_KIOSK" {
		return nil, fmt.Errorf("KIOSK_WORK_ORDER_NOT_FOUND")
	}
	states, err := loadKioskOperationStates(ctx, tx, woID)
	if err != nil {
		return nil, err
	}
	projections, err := loadKioskOperationProjections(ctx, tx, woID)
	if err != nil {
		return nil, err
	}
	stateBySequence := make(map[int]string, len(states))
	for _, state := range states {
		stateBySequence[state.SequenceNo] = state.Status
	}
	detail := &domain.KioskWorkOrderDetail{
		WorkOrder: summarizeKioskWorkOrder(header, states), JobCards: []domain.KioskJobCard{},
		PrintOperations: []domain.KioskPrintOperation{}, ProjectionAt: time.Now().UTC(),
	}
	for _, projection := range projections {
		if projection.Target == "PRINT_STATION" {
			printOperation, err := loadKioskPrintOperation(ctx, tx, projection)
			if err != nil {
				return nil, err
			}
			detail.PrintOperations = append(detail.PrintOperations, printOperation)
			continue
		}
		predecessors := parsePredecessors(projection.PredecessorSeq)
		predecessorsReady := predecessorsFinished(predecessors, stateBySequence)
		allocationReady := projection.AllocationStatus == "Committed" && (projection.ValidationStatus == "Valid" || projection.ValidationStatus == "ValidWithWarnings")
		resource := resourceContext(projection)
		eligibility := actionEligibility(header.Status, terminalRef, projection, predecessorsReady, allocationReady)
		card := domain.KioskJobCard{
			WOOperationID: projection.WOOperationID, OperationID: projection.OperationID,
			OperationCode: projection.OperationCode, OperationName: projection.OperationName,
			SequenceNo: projection.SequenceNo, PredecessorSequences: predecessors,
			PredecessorStatus:        predecessorDisplayStatus(predecessors, stateBySequence),
			SelectedProductionLineID: firstNonEmpty(projection.LineID, header.LineID), SelectedProductionLineCode: firstNonEmpty(projection.LineCode, header.LineCode),
			ExecutionTargetType: projection.Target, Status: projection.Status,
			DisplayState: classifyKioskOperation(header.Status, projection.Status, predecessorsReady),
			Resource:     resource, LastSession: projection.LastSession,
			RequestedQuantity: header.Quantity, ExpectedGoodQuantity: projection.ExpectedGoodQuantity,
			QtyGood: projection.QtyGood, QtyScrap: projection.QtyScrap,
			PlannedStartAt: projection.PlannedStartAt, PlannedEndAt: projection.PlannedEndAt,
			FinishedAt: projection.FinishedAt, Failure: projection.Failure,
			Behavior:          domain.OperationBehavior(projection.OperationCode),
			FailureImpact:     domain.KioskFailureImpact{OperationState: "ExecutionError", WorkOrderState: "Paused", SuccessorsBlocked: true},
			ActionEligibility: eligibility,
		}
		if projection.LastSession != nil {
			card.StartedAt = &projection.LastSession.StartedAt
			if projection.LastSession.Status == "IN_PROGRESS" {
				card.ActiveSession = projection.LastSession
			}
		}
		detail.JobCards = append(detail.JobCards, card)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return detail, nil
}

func validateDemoTerminal(terminalRef string) error {
	demoCode := os.Getenv("DEMO_KIOSK_TERMINAL_CODE")
	if demoCode == "" {
		demoCode = "KIOSK-DEMO-01"
	}
	if strings.TrimSpace(terminalRef) != demoCode {
		return fmt.Errorf("KIOSK_TERMINAL_SCOPE_FORBIDDEN")
	}
	return nil
}

func normalizePagination(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

type rowScanner interface {
	Scan(...interface{}) error
}

func scanKioskHeader(row rowScanner) (kioskHeader, error) {
	var header kioskHeader
	var lineName []byte
	err := row.Scan(&header.WOID, &header.WOCode, &header.ItemCode, &header.ItemName, &header.Quantity,
		&header.UOMID, &header.UOMCode, &header.LineID, &header.LineCode, &lineName, &header.Status, &header.DispatchMode, &header.UpdatedAt)
	header.LineName = decodeJSON(lineName)
	return header, err
}

func loadKioskHeader(ctx context.Context, tx pgx.Tx, woID string) (kioskHeader, error) {
	row := tx.QueryRow(ctx, `
		SELECT h.wo_id::text,h.wo_code,h.item_code,h.item_name,h.quantity::float8,h.uom_id::text,
		       COALESCE(r.base_uom_code,''),
		       COALESCE(h.selected_production_line_id::text,''),COALESCE(h.selected_production_line_code,''),
		       COALESCE(h.selected_production_line_name_i18n,'{}'::jsonb),h.status::text,h.dispatch_mode,
		       GREATEST(h.updated_at,
		         COALESCE((SELECT MAX(COALESCE(s.ended_at,s.started_at)) FROM execution_session s JOIN wo_operation o ON o.wo_operation_id=s.wo_operation_id WHERE o.wo_id=h.wo_id),h.updated_at),
		         COALESCE((SELECT MAX(c.confirmed_at) FROM operation_confirmation c JOIN wo_operation o ON o.wo_operation_id=c.wo_operation_id WHERE o.wo_id=h.wo_id),h.updated_at),
		         COALESCE((SELECT MAX(x.occurred_at) FROM wo_operation_execution_history x WHERE x.wo_id=h.wo_id),h.updated_at),
		         COALESCE((SELECT MAX(COALESCE(p.completed_at,p.failed_at,p.dispatched_at,p.created_at)) FROM wo_print_job p WHERE p.wo_id=h.wo_id),h.updated_at))
		FROM wo_header h
		LEFT JOIN rm_item_revision r ON r.master_id=h.item_revision_id
		WHERE h.wo_id=$1
	`, woID)
	header, err := scanKioskHeader(row)
	if err == pgx.ErrNoRows {
		return kioskHeader{}, fmt.Errorf("KIOSK_WORK_ORDER_NOT_FOUND")
	}
	return header, err
}

func loadKioskOperationStates(ctx context.Context, tx pgx.Tx, woID string) ([]kioskOperationState, error) {
	rows, err := tx.Query(ctx, `
		SELECT o.sequence_no,COALESCE(o.predecessor_seq,''),o.status,o.execution_target_type,
		       EXISTS(SELECT 1 FROM wo_resource_allocation a WHERE a.wo_operation_id=o.wo_operation_id AND a.status='Committed' AND a.validation_status IN ('Valid','ValidWithWarnings'))
		FROM wo_operation o WHERE o.wo_id=$1 ORDER BY o.sequence_no
	`, woID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	states := []kioskOperationState{}
	for rows.Next() {
		var state kioskOperationState
		if err := rows.Scan(&state.SequenceNo, &state.PredecessorSeq, &state.Status, &state.Target, &state.AllocationReady); err != nil {
			return nil, err
		}
		states = append(states, state)
	}
	return states, rows.Err()
}

func summarizeKioskWorkOrder(header kioskHeader, states []kioskOperationState) domain.KioskWorkOrderSummary {
	statusBySequence := make(map[int]string, len(states))
	for _, state := range states {
		statusBySequence[state.SequenceNo] = state.Status
	}
	counts := domain.KioskJobCounts{}
	allFinished, manualFinished := 0, 0
	for _, state := range states {
		if state.Status == "Finished" {
			allFinished++
		}
		if state.Target == "PRINT_STATION" {
			continue
		}
		counts.Total++
		predecessorsReady := predecessorsFinished(parsePredecessors(state.PredecessorSeq), statusBySequence)
		switch classifyKioskOperation(header.Status, state.Status, predecessorsReady) {
		case "waiting":
			counts.Waiting++
		case "ready":
			counts.Ready++
		case "in_progress":
			counts.InProgress++
		case "completed":
			counts.Completed++
			manualFinished++
		case "failed":
			counts.Failed++
		case "blocked":
			counts.Blocked++
		}
	}
	progress, manualProgress := 0.0, 0.0
	if len(states) > 0 {
		progress = percent(allFinished, len(states))
	}
	if counts.Total > 0 {
		manualProgress = percent(manualFinished, counts.Total)
	}
	return domain.KioskWorkOrderSummary{
		WOID: header.WOID, WOCode: header.WOCode, ItemCode: header.ItemCode, ItemName: header.ItemName,
		Quantity: header.Quantity, UOMID: header.UOMID, UOMCode: header.UOMCode,
		SelectedProductionLineID: header.LineID, SelectedProductionLineCode: header.LineCode,
		SelectedProductionLineName: header.LineName, Status: header.Status, DispatchMode: header.DispatchMode,
		JobCounts: counts, ProgressPercent: progress, ManualProgressPercent: manualProgress, UpdatedAt: header.UpdatedAt,
	}
}

func percent(numerator, denominator int) float64 {
	return math.Round((float64(numerator)/float64(denominator))*10000) / 100
}

func classifyKioskOperation(woStatus, operationStatus string, predecessorsReady bool) string {
	switch operationStatus {
	case "Finished":
		return "completed"
	case "ExecutionError":
		return "failed"
	case "InProgress":
		return "in_progress"
	}
	if woStatus == "Paused" || !predecessorsReady {
		return "blocked"
	}
	if operationStatus == "Ready" || operationStatus == "DispatchQueued" {
		return "ready"
	}
	return "waiting"
}

func parsePredecessors(value string) []int {
	if strings.TrimSpace(value) == "" {
		return []int{}
	}
	result := []int{}
	for _, part := range strings.Split(value, ",") {
		sequence, err := strconv.Atoi(strings.TrimSpace(part))
		if err == nil {
			result = append(result, sequence)
		}
	}
	return result
}

func predecessorsFinished(predecessors []int, states map[int]string) bool {
	for _, sequence := range predecessors {
		if states[sequence] != "Finished" {
			return false
		}
	}
	return true
}

func predecessorDisplayStatus(predecessors []int, states map[int]string) string {
	if len(predecessors) == 0 {
		return "NOT_REQUIRED"
	}
	if predecessorsFinished(predecessors, states) {
		return "COMPLETED"
	}
	return "BLOCKED"
}

func loadKioskOperationProjections(ctx context.Context, tx pgx.Tx, woID string) ([]kioskOperationProjection, error) {
	rows, err := tx.Query(ctx, `
		SELECT o.wo_operation_id::text,o.operation_id::text,o.operation_code,COALESCE(o.operation_name,'{}'::jsonb),
		       o.sequence_no,COALESCE(o.predecessor_seq,''),o.status,o.execution_target_type,
		       COALESCE(o.production_line_id::text,''),COALESCE(o.production_line_code,''),COALESCE(o.production_line_name_i18n,'{}'::jsonb),
		       o.work_center_id::text,COALESCE(wc.code,''),COALESCE(wc.name,'{}'::jsonb),COALESCE(o.workstation_id::text,''),
		       o.expected_good_quantity::float8,o.planned_start_at,o.planned_end_at,
		       COALESCE(a.allocation_id::text,''),COALESCE(a.status,''),COALESCE(a.validation_status,''),
		       COALESCE(a.planned_workstation_id::text,''),COALESCE(a.planned_equipment_id::text,''),
		       COALESCE(a.planned_machine_group_id::text,''),COALESCE(a.planned_primary_machine_unit_id::text,''),
		       COALESCE(a.validation_snapshot,'{}'::jsonb),COALESCE(a.warning_codes,'[]'::jsonb),
		       COALESCE(eq.code,''),COALESCE(eq.name,'{}'::jsonb),
		       COALESCE(s.session_id::text,''),COALESCE(s.terminal_ref,''),COALESCE(s.operator_user_id::text,''),
		       COALESCE(se.code,''),COALESCE(se.name,'{}'::jsonb),COALESCE(s.status,''),s.started_at,s.ended_at,
		       COALESCE(c.qty_good,0)::float8,COALESCE(c.qty_scrap,0)::float8,c.finished_at,
		       COALESCE(f.history_id::text,''),COALESCE(f.session_id::text,''),COALESCE(f.reason_code,''),
		       COALESCE(f.reason_name_i18n,'{}'::jsonb),f.reason_text,COALESCE(f.actor_user_id::text,''),
		       COALESCE(f.terminal_ref,''),f.occurred_at
		FROM wo_operation o
		LEFT JOIN rm_work_center wc ON wc.master_id=o.work_center_id
		LEFT JOIN LATERAL (
		  SELECT x.* FROM wo_resource_allocation x
		  WHERE x.wo_operation_id=o.wo_operation_id AND x.status IN ('Draft','Validated','Committed')
		  ORDER BY x.allocated_at DESC LIMIT 1
		) a ON true
		LEFT JOIN rm_equipment eq ON eq.master_id=a.planned_equipment_id
		LEFT JOIN LATERAL (
		  SELECT x.* FROM execution_session x WHERE x.wo_operation_id=o.wo_operation_id
		  ORDER BY x.started_at DESC LIMIT 1
		) s ON true
		LEFT JOIN rm_employee se ON se.master_id=s.operator_user_id
		LEFT JOIN LATERAL (
		  SELECT SUM(x.qty_good) qty_good,SUM(x.qty_scrap) qty_scrap,MAX(x.confirmed_at) finished_at
		  FROM operation_confirmation x WHERE x.wo_operation_id=o.wo_operation_id
		) c ON true
		LEFT JOIN LATERAL (
		  SELECT x.* FROM wo_operation_execution_history x
		  WHERE x.wo_operation_id=o.wo_operation_id AND x.action='FAILED'
		  ORDER BY x.occurred_at DESC LIMIT 1
		) f ON true
		WHERE o.wo_id=$1 ORDER BY o.sequence_no
	`, woID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []kioskOperationProjection{}
	for rows.Next() {
		var value kioskOperationProjection
		var operationName, lineName, workCenterName, validationSnapshot, warningCodes, equipmentName []byte
		var sessionID, sessionTerminal, sessionOperator, sessionOperatorCode, sessionStatus string
		var sessionOperatorName []byte
		var sessionStarted, sessionEnded *time.Time
		var failureID, failureSessionID, failureReason, failureActor, failureTerminal string
		var failureName []byte
		var failureText *string
		var failureAt *time.Time
		if err := rows.Scan(
			&value.WOOperationID, &value.OperationID, &value.OperationCode, &operationName,
			&value.SequenceNo, &value.PredecessorSeq, &value.Status, &value.Target,
			&value.LineID, &value.LineCode, &lineName, &value.WorkCenterID, &value.WorkCenterCode,
			&workCenterName, &value.WorkstationID, &value.ExpectedGoodQuantity,
			&value.PlannedStartAt, &value.PlannedEndAt, &value.AllocationID, &value.AllocationStatus,
			&value.ValidationStatus, &value.PlannedWorkstationID, &value.PlannedEquipmentID,
			&value.PlannedMachineGroupID, &value.PlannedPrimaryMachineUnitID, &validationSnapshot,
			&warningCodes, &value.EquipmentCode, &equipmentName,
			&sessionID, &sessionTerminal, &sessionOperator, &sessionOperatorCode, &sessionOperatorName,
			&sessionStatus, &sessionStarted, &sessionEnded,
			&value.QtyGood, &value.QtyScrap, &value.FinishedAt,
			&failureID, &failureSessionID, &failureReason, &failureName, &failureText,
			&failureActor, &failureTerminal, &failureAt,
		); err != nil {
			return nil, err
		}
		value.OperationName, value.LineName = decodeJSON(operationName), decodeJSON(lineName)
		value.WorkCenterName, value.EquipmentName = decodeJSON(workCenterName), decodeJSON(equipmentName)
		_ = json.Unmarshal(validationSnapshot, &value.ValidationSnapshot)
		value.WarningCodes = decodeJSON(warningCodes)
		if sessionID != "" && sessionStarted != nil {
			value.LastSession = &domain.KioskSessionContext{SessionID: sessionID, OperatorUserID: sessionOperator,
				OperatorCode: sessionOperatorCode, OperatorName: decodeJSON(sessionOperatorName),
				TerminalRef: sessionTerminal, Status: sessionStatus, StartedAt: *sessionStarted, EndedAt: sessionEnded}
		}
		if failureID != "" && failureAt != nil {
			var name map[string]string
			_ = json.Unmarshal(failureName, &name)
			value.Failure = &domain.KioskFailureContext{HistoryID: failureID, SessionID: failureSessionID,
				ReasonCode: failureReason, ReasonNameI18n: name, ReasonText: failureText,
				OperatorUserID: failureActor, TerminalRef: failureTerminal, OccurredAt: *failureAt}
		}
		result = append(result, value)
	}
	return result, rows.Err()
}

func resourceContext(value kioskOperationProjection) domain.KioskResourceContext {
	workstation := domain.KioskNamedResource{ID: firstNonEmpty(value.PlannedWorkstationID, value.WorkstationID)}
	if candidate, ok := value.ValidationSnapshot["candidate"].(map[string]interface{}); ok {
		if snapshot, ok := candidate["workstation"].(map[string]interface{}); ok {
			workstation.ID, _ = snapshot["id"].(string)
			workstation.Code, _ = snapshot["code"].(string)
			workstation.Name = snapshot["name"]
		}
	}
	context := domain.KioskResourceContext{
		AllocationID: value.AllocationID, AllocationStatus: value.AllocationStatus,
		ValidationStatus: value.ValidationStatus,
		WorkCenter:       domain.KioskNamedResource{ID: value.WorkCenterID, Code: value.WorkCenterCode, Name: value.WorkCenterName},
		Workstation:      workstation, WarningCodes: value.WarningCodes,
	}
	switch {
	case value.PlannedPrimaryMachineUnitID != "":
		context.AllocatedType = "MachineUnit"
		context.Allocated.ID = value.PlannedPrimaryMachineUnitID
	case value.PlannedEquipmentID != "":
		context.AllocatedType = "Equipment"
		context.Allocated = domain.KioskNamedResource{ID: value.PlannedEquipmentID, Code: value.EquipmentCode, Name: value.EquipmentName}
	case value.PlannedMachineGroupID != "":
		context.AllocatedType = "MachineGroup"
		context.Allocated.ID = value.PlannedMachineGroupID
	case workstation.ID != "":
		context.AllocatedType = "Workstation"
		context.Allocated = workstation
	default:
		context.AllocatedType = "WorkCenter"
		context.Allocated = context.WorkCenter
	}
	return context
}

func actionEligibility(woStatus, terminalRef string, value kioskOperationProjection, predecessorsReady, allocationReady bool) domain.KioskActionEligibility {
	result := domain.KioskActionEligibility{Blockers: []string{}}
	switch value.Status {
	case "Finished":
		result.Blockers = append(result.Blockers, "OPERATION_ALREADY_COMPLETED")
	case "ExecutionError":
		if woStatus != "Paused" {
			result.Blockers = append(result.Blockers, "WORK_ORDER_NOT_PAUSED")
		} else if value.Failure == nil {
			result.Blockers = append(result.Blockers, "OPERATION_FAILURE_HISTORY_NOT_FOUND")
		} else if value.Failure.TerminalRef != terminalRef {
			result.Blockers = append(result.Blockers, "TERMINAL_SCOPE_MISMATCH")
		} else {
			result.CanRetry = true
		}
	case "InProgress":
		if value.LastSession == nil || value.LastSession.Status != "IN_PROGRESS" {
			result.Blockers = append(result.Blockers, "EXECUTION_SESSION_NOT_ACTIVE")
		} else if value.LastSession.TerminalRef != terminalRef {
			result.Blockers = append(result.Blockers, "TERMINAL_SCOPE_MISMATCH")
		} else {
			result.CanComplete, result.CanFail, result.CanAbort = true, true, true
		}
	case "Ready", "DispatchQueued":
		if woStatus != "Released" && woStatus != "InProgress" {
			result.Blockers = append(result.Blockers, "WORK_ORDER_STATE_NOT_EXECUTABLE")
		}
		if !predecessorsReady {
			result.Blockers = append(result.Blockers, "PREDECESSOR_NOT_FINISHED")
		}
		if !allocationReady {
			result.Blockers = append(result.Blockers, "RESOURCE_ALLOCATION_NOT_COMMITTED")
		}
		result.CanStart = len(result.Blockers) == 0
	default:
		if !predecessorsReady {
			result.Blockers = append(result.Blockers, "PREDECESSOR_NOT_FINISHED")
		} else {
			result.Blockers = append(result.Blockers, "OPERATION_NOT_READY")
		}
	}
	return result
}

func loadKioskPrintOperation(ctx context.Context, tx pgx.Tx, value kioskOperationProjection) (domain.KioskPrintOperation, error) {
	result := domain.KioskPrintOperation{
		WOOperationID: value.WOOperationID, OperationCode: value.OperationCode,
		OperationName: value.OperationName, SequenceNo: value.SequenceNo, Status: value.Status,
		WorkstationID: value.WorkstationID, ReadOnly: true,
	}
	err := tx.QueryRow(ctx, `
		SELECT COALESCE(o.print_status,''),COALESCE(p.print_job_id::text,''),COALESCE(p.job_code,''),
		       COALESCE(p.status,''),COALESCE(p.selected_printer_code,''),COALESCE(p.last_error_code,''),
		       COALESCE(p.last_error_message,''),p.dispatched_at,p.completed_at
		FROM wo_operation o
		LEFT JOIN LATERAL (
		  SELECT x.* FROM wo_print_job x WHERE x.wo_operation_id=o.wo_operation_id
		  ORDER BY x.created_at DESC LIMIT 1
		) p ON true
		WHERE o.wo_operation_id=$1
	`, value.WOOperationID).Scan(&result.PrintStatus, &result.PrintJobID, &result.PrintJobCode,
		&result.PrintJobStatus, &result.SelectedPrinterCode, &result.LastErrorCode,
		&result.LastErrorMessage, &result.DispatchedAt, &result.CompletedAt)
	return result, err
}

func decodeJSON(raw []byte) any {
	var value any
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil {
		return map[string]interface{}{}
	}
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
