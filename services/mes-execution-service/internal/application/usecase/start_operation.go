package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/domain"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type StartOperationInput struct {
	WOID           string `json:"wo_id"`
	WOOperationID  string `json:"wo_operation_id"`
	TerminalRef    string `json:"terminal_ref"`
	OperatorUserID string `json:"operator_user_id"`
}

func StartOperation(ctx context.Context, pool *pgxpool.Pool, input StartOperationInput) (*domain.ExecutionSession, error) {
	if _, err := uuid.Parse(input.OperatorUserID); err != nil {
		return nil, fmt.Errorf("OPERATOR_USER_ID_INVALID")
	}
	if input.TerminalRef == "" {
		return nil, fmt.Errorf("TERMINAL_REF_REQUIRED")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Set current user for audit
	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.OperatorUserID)

	// Lock the work order and operation so only one active attempt can be created.
	var woStatus, woCode, dispatchMode, siteID, productionLineID string
	err = tx.QueryRow(ctx, `SELECT status,wo_code,dispatch_mode,site_id::text,COALESCE(selected_production_line_id::text,'') FROM wo_header WHERE wo_id = $1 FOR UPDATE`, input.WOID).Scan(&woStatus, &woCode, &dispatchMode, &siteID, &productionLineID)
	if err != nil {
		return nil, fmt.Errorf("work order %s not found: %w", input.WOID, err)
	}
	if woStatus != "Released" && woStatus != "InProgress" {
		return nil, fmt.Errorf("work order %s is in status %s, must be Released or InProgress to start operation", input.WOID, woStatus)
	}
	if err := requireSelectedLineConsistency(ctx, tx, input.WOID); err != nil {
		return nil, err
	}

	// Verify the manual operation and predecessor gate.
	var opSeq int
	var predSeq *string
	var opStatus, executionTarget, operationID, operationCode, workCenterID, workstationID string
	err = tx.QueryRow(ctx, `
		SELECT sequence_no, predecessor_seq, status, execution_target_type,
		       operation_id::text,operation_code,work_center_id::text,COALESCE(workstation_id::text,'')
		FROM wo_operation WHERE wo_operation_id = $1 AND wo_id = $2
		FOR UPDATE
	`, input.WOOperationID, input.WOID).Scan(&opSeq, &predSeq, &opStatus, &executionTarget, &operationID, &operationCode, &workCenterID, &workstationID)
	if err != nil {
		return nil, fmt.Errorf("operation %s not found for WO %s: %w", input.WOOperationID, input.WOID, err)
	}

	if executionTarget == "PRINT_STATION" {
		return nil, fmt.Errorf("PRINT_STATION_MANUAL_COMMAND_FORBIDDEN")
	}
	if opStatus == "InProgress" {
		var session domain.ExecutionSession
		err := tx.QueryRow(ctx, `
			SELECT session_id::text, wo_operation_id::text, terminal_ref,
			       operator_user_id::text, started_at, status
			FROM execution_session
			WHERE wo_operation_id=$1 AND status='IN_PROGRESS'
			ORDER BY started_at DESC LIMIT 1 FOR UPDATE
		`, input.WOOperationID).Scan(&session.SessionID, &session.WOOperationID,
			&session.TerminalRef, &session.OperatorUserID, &session.StartedAt, &session.Status)
		if err == nil && session.OperatorUserID == input.OperatorUserID && session.TerminalRef == input.TerminalRef {
			return &session, nil
		}
		return nil, fmt.Errorf("OPERATION_START_ACTIVE_SESSION_CONFLICT")
	}
	if opStatus != "Ready" && opStatus != "DispatchQueued" {
		return nil, fmt.Errorf("OPERATION_START_INVALID_STATE")
	}
	var committedAllocationCount int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM wo_resource_allocation
		WHERE wo_operation_id=$1
		  AND wo_id=$2
		  AND status='Committed'
		  AND validation_status IN ('Valid','ValidWithWarnings')`, input.WOOperationID, input.WOID).Scan(&committedAllocationCount); err != nil {
		return nil, err
	}
	if committedAllocationCount != 1 {
		return nil, fmt.Errorf("WO_RESOURCE_ALLOCATION_INVALID")
	}
	if predSeq != nil && *predSeq != "" {
		// Check predecessor operation is Finished
		var predStatus string
		err = tx.QueryRow(ctx, `
			SELECT status FROM wo_operation WHERE wo_id = $1 AND sequence_no = $2
		`, input.WOID, *predSeq).Scan(&predStatus)
		if err == nil && predStatus != "Finished" {
			return nil, fmt.Errorf("predecessor operation (seq %s) is in status %s, must be Finished before starting seq %d", *predSeq, predStatus, opSeq)
		}
	}

	if woStatus == "Released" {
		if tag, err := tx.Exec(ctx, `UPDATE wo_header SET status = 'InProgress', updated_by = $1, updated_at = NOW(), row_version=row_version+1 WHERE wo_id = $2 AND status='Released'`, input.OperatorUserID, input.WOID); err != nil || tag.RowsAffected() != 1 {
			return nil, fmt.Errorf("WORK_ORDER_START_STATE_CONFLICT")
		}
	}

	// 3. Create execution_session
	sessionID := uuid.New().String()
	now := time.Now().UTC()
	_, err = tx.Exec(ctx, `
		INSERT INTO execution_session (session_id, wo_operation_id, terminal_ref, operator_user_id, started_at, status)
		VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS')
	`, sessionID, input.WOOperationID, input.TerminalRef, input.OperatorUserID, now)
	if err != nil {
		return nil, fmt.Errorf("failed to create execution_session: %w", err)
	}

	// Update wo_operation status to InProgress
	tag, err := tx.Exec(ctx, `
		UPDATE wo_operation SET status = 'InProgress', row_version = row_version + 1
		WHERE wo_operation_id = $1 AND status IN ('Ready','DispatchQueued')
	`, input.WOOperationID)
	if err != nil || tag.RowsAffected() != 1 {
		return nil, fmt.Errorf("OPERATION_START_STATE_CONFLICT")
	}

	// 4. Publish Outbox Event MES.Execution.OperationStarted.v1
	env := sharedkernel.CreateEventEnvelope(
		"MES.Execution.OperationStarted.v1",
		"mes-execution-service",
		"",
		map[string]interface{}{
			"wo_code":                     woCode,
			"session_id":                  sessionID,
			"wo_id":                       input.WOID,
			"wo_operation_id":             input.WOOperationID,
			"terminal_ref":                input.TerminalRef,
			"operator_user_id":            input.OperatorUserID,
			"operation_id":                operationID,
			"operation_code":              operationCode,
			"sequence_no":                 opSeq,
			"site_id":                     siteID,
			"selected_production_line_id": productionLineID,
			"work_center_id":              workCenterID,
			"workstation_id":              workstationID,
			"dispatch_mode":               dispatchMode,
			"execution_target_type":       executionTarget,
			"started_at":                  now.Format(time.RFC3339Nano),
		},
	)
	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.OperationStarted.v1", env); err != nil {
		return nil, fmt.Errorf("failed to write outbox event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &domain.ExecutionSession{
		SessionID:      sessionID,
		WOOperationID:  input.WOOperationID,
		TerminalRef:    input.TerminalRef,
		OperatorUserID: input.OperatorUserID,
		StartedAt:      now,
		Status:         "IN_PROGRESS",
	}, nil
}
