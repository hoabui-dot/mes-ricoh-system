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
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Set current user for audit
	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.OperatorUserID)

	// 1. Verify WO is Released or InProgress
	var woStatus string
	err = tx.QueryRow(ctx, `SELECT status FROM wo_header WHERE wo_id = $1`, input.WOID).Scan(&woStatus)
	if err != nil {
		return nil, fmt.Errorf("work order %s not found: %w", input.WOID, err)
	}
	if woStatus != "Released" && woStatus != "InProgress" {
		return nil, fmt.Errorf("work order %s is in status %s, must be Released or InProgress to start operation", input.WOID, woStatus)
	}
	if err := requireSelectedLineConsistency(ctx, tx, input.WOID); err != nil {
		return nil, err
	}

	// Update WO status to InProgress if Released
	if woStatus == "Released" {
		_, err = tx.Exec(ctx, `UPDATE wo_header SET status = 'InProgress', updated_by = $1, updated_at = NOW() WHERE wo_id = $2`, input.OperatorUserID, input.WOID)
		if err != nil {
			return nil, fmt.Errorf("failed to update WO status to InProgress: %w", err)
		}
	}

	// 2. Verify WOOperation and check predecessor completion
	var opSeq int
	var predSeq *string
	var opStatus string
	err = tx.QueryRow(ctx, `
		SELECT sequence_no, predecessor_seq, status
		FROM wo_operation WHERE wo_operation_id = $1 AND wo_id = $2
	`, input.WOOperationID, input.WOID).Scan(&opSeq, &predSeq, &opStatus)
	if err != nil {
		return nil, fmt.Errorf("operation %s not found for WO %s: %w", input.WOOperationID, input.WOID, err)
	}

	if opStatus == "Finished" || opStatus == "ExecutionError" || opStatus == "InProgress" {
		return nil, fmt.Errorf("operation %s is already in status %s", input.WOOperationID, opStatus)
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
	_, err = tx.Exec(ctx, `
		UPDATE wo_operation SET status = 'InProgress', row_version = row_version + 1 WHERE wo_operation_id = $1
	`, input.WOOperationID)
	if err != nil {
		return nil, fmt.Errorf("failed to update operation status to InProgress: %w", err)
	}

	// 4. Publish Outbox Event MES.Execution.OperationStarted.v1
	env := sharedkernel.CreateEventEnvelope(
		"MES.Execution.OperationStarted.v1",
		"mes-execution-service",
		"",
		map[string]interface{}{
			"session_id":       sessionID,
			"wo_id":            input.WOID,
			"wo_operation_id":  input.WOOperationID,
			"terminal_ref":     input.TerminalRef,
			"operator_user_id": input.OperatorUserID,
			"started_at":       now.Format(time.RFC3339Nano),
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
