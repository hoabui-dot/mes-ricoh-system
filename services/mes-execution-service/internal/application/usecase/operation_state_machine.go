package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/domain"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type FailOperationInput struct {
	WOID                  string
	WOOperationID         string
	SessionID             string
	ReasonCode            string
	ReasonNameI18n        map[string]string
	ReasonText            string
	ReasonRequiresComment bool
	OperatorUserID        string
	RoleCode              string
	TerminalRef           string
	IdempotencyKey        string
	TraceID               string
}

type AbortOperationInput struct {
	WOID           string
	WOOperationID  string
	SessionID      string
	OperatorUserID string
	RoleCode       string
	TerminalRef    string
	IdempotencyKey string
	TraceID        string
}

type RetryOperationInput struct {
	WOID           string
	WOOperationID  string
	OperatorUserID string
	RoleCode       string
	TerminalRef    string
	SiteID         string
	IdempotencyKey string
	TraceID        string
}

type lockedOperation struct {
	WOCode           string
	WOStatus         string
	DispatchMode     string
	SiteID           string
	ProductionLineID string
	OperationID      string
	OperationCode    string
	OperationStatus  string
	ExecutionTarget  string
	SequenceNo       int
	WorkCenterID     string
	WorkstationID    string
	SessionStatus    string
	SessionOperator  string
	SessionTerminal  string
}

func normalizeTransitionInput(userID, roleCode, idempotencyKey, traceID string) (string, string, string, string, error) {
	userID = strings.TrimSpace(userID)
	if _, err := uuid.Parse(userID); err != nil {
		return "", "", "", "", fmt.Errorf("OPERATOR_USER_ID_INVALID")
	}
	roleCode = strings.ToUpper(strings.TrimSpace(roleCode))
	if roleCode == "" {
		roleCode = "OPERATOR"
	}
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if idempotencyKey == "" || len(idempotencyKey) > 200 {
		return "", "", "", "", fmt.Errorf("IDEMPOTENCY_KEY_REQUIRED")
	}
	traceID = strings.TrimSpace(traceID)
	if traceID == "" {
		traceID = idempotencyKey
	}
	return userID, roleCode, idempotencyKey, traceID, nil
}

func lockOperationSession(ctx context.Context, tx pgx.Tx, woID, operationID, sessionID string) (*lockedOperation, error) {
	var value lockedOperation
	err := tx.QueryRow(ctx, `
		SELECT h.wo_code, h.status::text, h.dispatch_mode, h.site_id::text,
		       COALESCE(h.selected_production_line_id::text, ''),
		       o.operation_id::text, o.operation_code, o.status, o.execution_target_type,
		       o.sequence_no, o.work_center_id::text, COALESCE(o.workstation_id::text, ''),
		       s.status, s.operator_user_id::text, s.terminal_ref
		FROM wo_header h
		JOIN wo_operation o ON o.wo_id = h.wo_id
		JOIN execution_session s ON s.wo_operation_id = o.wo_operation_id
		WHERE h.wo_id = $1 AND o.wo_operation_id = $2 AND s.session_id = $3
		FOR UPDATE OF h, o, s
	`, woID, operationID, sessionID).Scan(
		&value.WOCode, &value.WOStatus, &value.DispatchMode, &value.SiteID, &value.ProductionLineID,
		&value.OperationID, &value.OperationCode, &value.OperationStatus, &value.ExecutionTarget,
		&value.SequenceNo, &value.WorkCenterID, &value.WorkstationID,
		&value.SessionStatus, &value.SessionOperator, &value.SessionTerminal,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("EXECUTION_SESSION_NOT_FOUND")
		}
		return nil, err
	}
	return &value, nil
}

func loadExistingTransition(ctx context.Context, tx pgx.Tx, action, idempotencyKey, actor, woID, operationID, sessionID string) (*domain.OperationExecutionTransition, error) {
	var result domain.OperationExecutionTransition
	var reasonNameJSON []byte
	err := tx.QueryRow(ctx, `
		SELECT h.history_id::text, h.wo_id::text, wh.wo_code, h.wo_operation_id::text,
		       o.operation_code, h.session_id::text, h.action, h.reason_code,
		       h.reason_name_i18n, h.reason_text, h.from_operation_status,
		       h.to_operation_status, h.from_wo_status, h.to_wo_status,
		       h.terminal_ref, h.actor_user_id::text, h.occurred_at
		FROM wo_operation_execution_history h
		JOIN wo_header wh ON wh.wo_id = h.wo_id
		JOIN wo_operation o ON o.wo_operation_id = h.wo_operation_id
		WHERE h.action = $1 AND h.idempotency_key = $2
	`, action, idempotencyKey).Scan(
		&result.HistoryID, &result.WOID, &result.WOCode, &result.WOOperationID,
		&result.OperationCode, &result.SessionID, &result.Action, &result.ReasonCode,
		&reasonNameJSON, &result.ReasonText, &result.FromOperationStatus,
		&result.ToOperationStatus, &result.FromWOStatus, &result.ToWOStatus,
		&result.TerminalRef, &result.OperatorUserID, &result.OccurredAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if result.OperatorUserID != actor || result.WOID != woID || result.WOOperationID != operationID {
		return nil, fmt.Errorf("IDEMPOTENCY_KEY_CONFLICT")
	}
	if sessionID != "" && (result.SessionID == nil || *result.SessionID != sessionID) {
		return nil, fmt.Errorf("IDEMPOTENCY_KEY_CONFLICT")
	}
	_ = json.Unmarshal(reasonNameJSON, &result.ReasonNameI18n)
	return &result, nil
}

func insertExecutionHistory(ctx context.Context, tx pgx.Tx, result *domain.OperationExecutionTransition, roleCode, idempotencyKey, traceID string) error {
	reasonName, err := json.Marshal(result.ReasonNameI18n)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO wo_operation_execution_history
		  (history_id, wo_id, wo_operation_id, session_id, action, reason_code,
		   reason_name_i18n, reason_text, actor_user_id, actor_role_code, terminal_ref,
		   from_operation_status, to_operation_status, from_wo_status, to_wo_status,
		   idempotency_key, trace_id, occurred_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
	`, result.HistoryID, result.WOID, result.WOOperationID, result.SessionID,
		result.Action, result.ReasonCode, reasonName, result.ReasonText,
		result.OperatorUserID, roleCode, result.TerminalRef,
		result.FromOperationStatus, result.ToOperationStatus,
		result.FromWOStatus, result.ToWOStatus, idempotencyKey, traceID, result.OccurredAt)
	return err
}

func transitionPayload(value *lockedOperation, result *domain.OperationExecutionTransition, roleCode string) map[string]interface{} {
	return map[string]interface{}{
		"history_id": result.HistoryID, "wo_id": result.WOID, "wo_code": result.WOCode,
		"wo_operation_id": result.WOOperationID, "operation_id": value.OperationID,
		"operation_code": value.OperationCode, "sequence_no": value.SequenceNo,
		"site_id": value.SiteID, "selected_production_line_id": value.ProductionLineID,
		"work_center_id": value.WorkCenterID, "workstation_id": value.WorkstationID,
		"execution_target_type": value.ExecutionTarget, "session_id": result.SessionID,
		"dispatch_mode": value.DispatchMode,
		"terminal_ref":  result.TerminalRef, "operator_user_id": result.OperatorUserID,
		"operator_role_code": roleCode, "from_state": result.FromOperationStatus,
		"to_state": result.ToOperationStatus, "wo_from_state": result.FromWOStatus,
		"wo_to_state": result.ToWOStatus, "reason_code": result.ReasonCode,
		"reason_name_i18n": result.ReasonNameI18n, "reason_text": result.ReasonText,
		"occurred_at": result.OccurredAt.Format(time.RFC3339Nano),
	}
}

func writeTransitionEvent(ctx context.Context, tx pgx.Tx, topic, traceID string, payload map[string]interface{}) error {
	envelope := sharedkernel.CreateEventEnvelope(topic, "mes-execution-service", traceID, payload)
	if err := sharedkernel.WriteToOutbox(ctx, tx, topic, envelope); err != nil {
		return fmt.Errorf("failed to write %s event: %w", topic, err)
	}
	return nil
}

func FailOperation(ctx context.Context, pool *pgxpool.Pool, input FailOperationInput) (*domain.OperationExecutionTransition, error) {
	userID, roleCode, idempotencyKey, traceID, err := normalizeTransitionInput(input.OperatorUserID, input.RoleCode, input.IdempotencyKey, input.TraceID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(input.ReasonCode) == "" {
		return nil, fmt.Errorf("FAILURE_REASON_REQUIRED")
	}
	if input.ReasonRequiresComment && strings.TrimSpace(input.ReasonText) == "" {
		return nil, fmt.Errorf("FAILURE_REASON_TEXT_REQUIRED")
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, userID)

	if existing, err := loadExistingTransition(ctx, tx, "FAILED", idempotencyKey, userID, input.WOID, input.WOOperationID, input.SessionID); err != nil || existing != nil {
		return existing, err
	}
	value, err := lockOperationSession(ctx, tx, input.WOID, input.WOOperationID, input.SessionID)
	if err != nil {
		return nil, err
	}
	if existing, err := loadExistingTransition(ctx, tx, "FAILED", idempotencyKey, userID, input.WOID, input.WOOperationID, input.SessionID); err != nil || existing != nil {
		return existing, err
	}
	if value.ExecutionTarget == "PRINT_STATION" {
		return nil, fmt.Errorf("PRINT_STATION_MANUAL_COMMAND_FORBIDDEN")
	}
	if value.WOStatus != "InProgress" || value.OperationStatus != "InProgress" || value.SessionStatus != "IN_PROGRESS" {
		return nil, fmt.Errorf("OPERATION_FAIL_INVALID_STATE")
	}
	if value.SessionOperator != userID {
		return nil, fmt.Errorf("OPERATION_SESSION_OPERATOR_MISMATCH")
	}
	if input.TerminalRef != "" && input.TerminalRef != value.SessionTerminal {
		return nil, fmt.Errorf("OPERATION_SESSION_TERMINAL_MISMATCH")
	}

	now := time.Now().UTC()
	historyID := uuid.NewString()
	sessionID := input.SessionID
	reasonCode := strings.TrimSpace(input.ReasonCode)
	var reasonText *string
	if text := strings.TrimSpace(input.ReasonText); text != "" {
		reasonText = &text
	}
	result := &domain.OperationExecutionTransition{
		HistoryID: historyID, WOID: input.WOID, WOCode: value.WOCode,
		WOOperationID: input.WOOperationID, OperationCode: value.OperationCode,
		SessionID: &sessionID, Action: "FAILED", ReasonCode: &reasonCode,
		ReasonNameI18n: input.ReasonNameI18n, ReasonText: reasonText,
		FromOperationStatus: "InProgress", ToOperationStatus: "ExecutionError",
		FromWOStatus: "InProgress", ToWOStatus: "Paused", TerminalRef: value.SessionTerminal,
		OperatorUserID: userID, OccurredAt: now,
	}
	if err := insertExecutionHistory(ctx, tx, result, roleCode, idempotencyKey, traceID); err != nil {
		return nil, err
	}
	if tag, err := tx.Exec(ctx, `UPDATE execution_session SET status='FAILED', ended_at=$1 WHERE session_id=$2 AND status='IN_PROGRESS'`, now, input.SessionID); err != nil || tag.RowsAffected() != 1 {
		return nil, fmt.Errorf("OPERATION_FAIL_SESSION_UPDATE_CONFLICT")
	}
	if tag, err := tx.Exec(ctx, `UPDATE wo_operation SET status='ExecutionError', row_version=row_version+1 WHERE wo_operation_id=$1 AND status='InProgress'`, input.WOOperationID); err != nil || tag.RowsAffected() != 1 {
		return nil, fmt.Errorf("OPERATION_FAIL_STATE_CONFLICT")
	}
	if tag, err := tx.Exec(ctx, `UPDATE wo_header SET status='Paused', updated_by=$1, updated_at=$2, row_version=row_version+1 WHERE wo_id=$3 AND status='InProgress'`, userID, now, input.WOID); err != nil || tag.RowsAffected() != 1 {
		return nil, fmt.Errorf("WORK_ORDER_PAUSE_CONFLICT")
	}
	payload := transitionPayload(value, result, roleCode)
	if err := writeTransitionEvent(ctx, tx, "MES.Execution.OperationFailed.v1", traceID, payload); err != nil {
		return nil, err
	}
	if err := writeTransitionEvent(ctx, tx, "MES.Execution.WOStatusChanged.v1", traceID, payload); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

func AbortOperation(ctx context.Context, pool *pgxpool.Pool, input AbortOperationInput) (*domain.OperationExecutionTransition, error) {
	userID, roleCode, idempotencyKey, traceID, err := normalizeTransitionInput(input.OperatorUserID, input.RoleCode, input.IdempotencyKey, input.TraceID)
	if err != nil {
		return nil, err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, userID)
	if existing, err := loadExistingTransition(ctx, tx, "ABORTED", idempotencyKey, userID, input.WOID, input.WOOperationID, input.SessionID); err != nil || existing != nil {
		return existing, err
	}
	value, err := lockOperationSession(ctx, tx, input.WOID, input.WOOperationID, input.SessionID)
	if err != nil {
		return nil, err
	}
	if existing, err := loadExistingTransition(ctx, tx, "ABORTED", idempotencyKey, userID, input.WOID, input.WOOperationID, input.SessionID); err != nil || existing != nil {
		return existing, err
	}
	if value.ExecutionTarget == "PRINT_STATION" {
		return nil, fmt.Errorf("PRINT_STATION_MANUAL_COMMAND_FORBIDDEN")
	}
	if value.WOStatus != "InProgress" || value.OperationStatus != "InProgress" || value.SessionStatus != "IN_PROGRESS" {
		return nil, fmt.Errorf("OPERATION_ABORT_INVALID_STATE")
	}
	if value.SessionOperator != userID {
		return nil, fmt.Errorf("OPERATION_SESSION_OPERATOR_MISMATCH")
	}
	if input.TerminalRef != "" && input.TerminalRef != value.SessionTerminal {
		return nil, fmt.Errorf("OPERATION_SESSION_TERMINAL_MISMATCH")
	}
	now := time.Now().UTC()
	historyID := uuid.NewString()
	sessionID := input.SessionID
	result := &domain.OperationExecutionTransition{
		HistoryID: historyID, WOID: input.WOID, WOCode: value.WOCode,
		WOOperationID: input.WOOperationID, OperationCode: value.OperationCode,
		SessionID: &sessionID, Action: "ABORTED", FromOperationStatus: "InProgress",
		ToOperationStatus: "Ready", FromWOStatus: "InProgress", ToWOStatus: "InProgress",
		TerminalRef: value.SessionTerminal, OperatorUserID: userID, OccurredAt: now,
	}
	if err := insertExecutionHistory(ctx, tx, result, roleCode, idempotencyKey, traceID); err != nil {
		return nil, err
	}
	if tag, err := tx.Exec(ctx, `UPDATE execution_session SET status='ABORTED', ended_at=$1 WHERE session_id=$2 AND status='IN_PROGRESS'`, now, input.SessionID); err != nil || tag.RowsAffected() != 1 {
		return nil, fmt.Errorf("OPERATION_ABORT_SESSION_UPDATE_CONFLICT")
	}
	if tag, err := tx.Exec(ctx, `UPDATE wo_operation SET status='Ready', row_version=row_version+1 WHERE wo_operation_id=$1 AND status='InProgress'`, input.WOOperationID); err != nil || tag.RowsAffected() != 1 {
		return nil, fmt.Errorf("OPERATION_ABORT_STATE_CONFLICT")
	}
	if err := writeTransitionEvent(ctx, tx, "MES.Execution.OperationAborted.v1", traceID, transitionPayload(value, result, roleCode)); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

func RetryOperation(ctx context.Context, pool *pgxpool.Pool, input RetryOperationInput) (*domain.OperationExecutionTransition, error) {
	userID, roleCode, idempotencyKey, traceID, err := normalizeTransitionInput(input.OperatorUserID, input.RoleCode, input.IdempotencyKey, input.TraceID)
	if err != nil {
		return nil, err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, userID)
	if existing, err := loadExistingTransition(ctx, tx, "RETRY_REQUESTED", idempotencyKey, userID, input.WOID, input.WOOperationID, ""); err != nil || existing != nil {
		return existing, err
	}

	var value lockedOperation
	err = tx.QueryRow(ctx, `
		SELECT h.wo_code, h.status::text, h.dispatch_mode, h.site_id::text,
		       COALESCE(h.selected_production_line_id::text, ''), o.operation_id::text,
		       o.operation_code, o.status, o.execution_target_type, o.sequence_no,
		       o.work_center_id::text, COALESCE(o.workstation_id::text, '')
		FROM wo_header h JOIN wo_operation o ON o.wo_id=h.wo_id
		WHERE h.wo_id=$1 AND o.wo_operation_id=$2 FOR UPDATE OF h,o
	`, input.WOID, input.WOOperationID).Scan(
		&value.WOCode, &value.WOStatus, &value.DispatchMode, &value.SiteID, &value.ProductionLineID,
		&value.OperationID, &value.OperationCode, &value.OperationStatus,
		&value.ExecutionTarget, &value.SequenceNo, &value.WorkCenterID, &value.WorkstationID,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("OPERATION_NOT_FOUND")
		}
		return nil, err
	}
	if existing, err := loadExistingTransition(ctx, tx, "RETRY_REQUESTED", idempotencyKey, userID, input.WOID, input.WOOperationID, ""); err != nil || existing != nil {
		return existing, err
	}
	if value.ExecutionTarget == "PRINT_STATION" {
		return nil, fmt.Errorf("PRINT_STATION_MANUAL_COMMAND_FORBIDDEN")
	}
	if value.WOStatus != "Paused" || value.OperationStatus != "ExecutionError" {
		return nil, fmt.Errorf("OPERATION_RETRY_INVALID_STATE")
	}

	var failedSessionID, failedActor, failedTerminal, reasonCode string
	var reasonNameJSON []byte
	var reasonText *string
	err = tx.QueryRow(ctx, `
		SELECT session_id::text, actor_user_id::text, terminal_ref, reason_code,
		       reason_name_i18n, reason_text
		FROM wo_operation_execution_history
		WHERE wo_id=$1 AND wo_operation_id=$2 AND action='FAILED'
		ORDER BY occurred_at DESC LIMIT 1 FOR UPDATE
	`, input.WOID, input.WOOperationID).Scan(&failedSessionID, &failedActor, &failedTerminal, &reasonCode, &reasonNameJSON, &reasonText)
	if err != nil {
		return nil, fmt.Errorf("OPERATION_FAILURE_HISTORY_NOT_FOUND")
	}
	var reasonName map[string]string
	_ = json.Unmarshal(reasonNameJSON, &reasonName)
	switch roleCode {
	case "OPERATOR":
		if failedActor != userID || input.TerminalRef == "" || input.TerminalRef != failedTerminal {
			return nil, fmt.Errorf("OPERATION_RETRY_FORBIDDEN")
		}
	case "PLANT_MANAGER":
		if input.SiteID == "" || input.SiteID != value.SiteID {
			return nil, fmt.Errorf("OPERATION_RETRY_SITE_SCOPE_REQUIRED")
		}
	default:
		return nil, fmt.Errorf("OPERATION_RETRY_FORBIDDEN")
	}

	now := time.Now().UTC()
	historyID := uuid.NewString()
	result := &domain.OperationExecutionTransition{
		HistoryID: historyID, WOID: input.WOID, WOCode: value.WOCode,
		WOOperationID: input.WOOperationID, OperationCode: value.OperationCode,
		SessionID: &failedSessionID, Action: "RETRY_REQUESTED", ReasonCode: &reasonCode,
		ReasonNameI18n: reasonName, ReasonText: reasonText,
		FromOperationStatus: "ExecutionError", ToOperationStatus: "Ready",
		FromWOStatus: "Paused", ToWOStatus: "InProgress", TerminalRef: failedTerminal,
		OperatorUserID: userID, OccurredAt: now,
	}
	if err := insertExecutionHistory(ctx, tx, result, roleCode, idempotencyKey, traceID); err != nil {
		return nil, err
	}
	if tag, err := tx.Exec(ctx, `UPDATE wo_operation SET status='Ready', row_version=row_version+1 WHERE wo_operation_id=$1 AND status='ExecutionError'`, input.WOOperationID); err != nil || tag.RowsAffected() != 1 {
		return nil, fmt.Errorf("OPERATION_RETRY_STATE_CONFLICT")
	}
	if tag, err := tx.Exec(ctx, `UPDATE wo_header SET status='InProgress', updated_by=$1, updated_at=$2, row_version=row_version+1 WHERE wo_id=$3 AND status='Paused'`, userID, now, input.WOID); err != nil || tag.RowsAffected() != 1 {
		return nil, fmt.Errorf("WORK_ORDER_RETRY_STATE_CONFLICT")
	}
	payload := transitionPayload(&value, result, roleCode)
	if err := writeTransitionEvent(ctx, tx, "MES.Execution.OperationRetryRequested.v1", traceID, payload); err != nil {
		return nil, err
	}
	if err := writeTransitionEvent(ctx, tx, "MES.Execution.WOStatusChanged.v1", traceID, payload); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}
