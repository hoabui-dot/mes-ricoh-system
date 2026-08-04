//go:build integration

package usecase

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const integrationUser = "10000000-0000-0000-0000-000000000001"

type executionFixture struct {
	WOID, WOCode, OperationID, NextOperationID, SessionID string
	SiteID, LineID, WorkCenterID, ShiftID                 string
}

func integrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()
	dsn := os.Getenv("MES_EXECUTION_TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5440/mes_mvp?sslmode=disable"
	}
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := admin.Ping(ctx); err != nil {
		admin.Close()
		t.Fatalf("integration database unavailable: %v", err)
	}
	schema := "phase01_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir("../../../migrations")
	if err != nil {
		t.Fatal(err)
	}
	var files []string
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".up.sql") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)
	for _, name := range files {
		content, err := os.ReadFile(filepath.Join("../../../migrations", name))
		if err != nil {
			t.Fatal(err)
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, string(content)); err != nil {
			_ = tx.Rollback(ctx)
			t.Fatalf("migration %s failed: %v", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+quotedSchema+" CASCADE")
		admin.Close()
	})
	return pool
}

func insertFixture(t *testing.T, pool *pgxpool.Pool, woStatus, operationStatus, target string, withSuccessor bool) executionFixture {
	t.Helper()
	f := executionFixture{
		WOID: uuid.NewString(), WOCode: "WO-PHASE01-" + uuid.NewString()[:8],
		OperationID: uuid.NewString(), SiteID: uuid.NewString(), LineID: uuid.NewString(),
		WorkCenterID: uuid.NewString(), ShiftID: uuid.NewString(),
	}
	ctx := context.Background()
	now := time.Now().UTC()
	_, err := pool.Exec(ctx, `
		INSERT INTO wo_header
		  (wo_id, wo_code, production_version_id, item_revision_id, item_code, item_name,
		   quantity, uom_id, site_id, shift_id, planned_start_at, planned_end_at, status,
		   created_by, selected_production_line_id, selected_production_line_code,
		   line_selection_mode, line_selection_status)
		VALUES ($1,$2,$3,$4,'ITEM-PHASE01','Phase 01 Item',10,$5,$6,$7,$8,$9,$10,$11,$12,'LINE-PHASE01','AUTO','SELECTED')
	`, f.WOID, f.WOCode, uuid.NewString(), uuid.NewString(), uuid.NewString(), f.SiteID,
		f.ShiftID, now.Add(-time.Hour), now.Add(time.Hour), woStatus, integrationUser, f.LineID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO wo_operation
		  (wo_operation_id, wo_id, sequence_no, operation_id, operation_code, work_center_id,
		   status, execution_target_type, production_line_id)
		VALUES ($1,$2,10,$3,'OP-MANUAL-01',$4,$5,$6,$7)
	`, f.OperationID, f.WOID, uuid.NewString(), f.WorkCenterID, operationStatus, target, f.LineID)
	if err != nil {
		t.Fatal(err)
	}
	if withSuccessor {
		f.NextOperationID = uuid.NewString()
		_, err = pool.Exec(ctx, `
			INSERT INTO wo_operation
			  (wo_operation_id, wo_id, sequence_no, operation_id, operation_code, work_center_id,
			   predecessor_seq, status, execution_target_type, production_line_id)
			VALUES ($1,$2,20,$3,'OP-MANUAL-02',$4,'10','Ready','KIOSK_DEMO',$5)
		`, f.NextOperationID, f.WOID, uuid.NewString(), f.WorkCenterID, f.LineID)
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, operationID := range []string{f.OperationID, f.NextOperationID} {
		if operationID == "" {
			continue
		}
		_, err = pool.Exec(ctx, `
			INSERT INTO wo_resource_allocation
			  (wo_id, wo_operation_id, site_id, planned_work_center_id, planned_shift_id,
			   planned_start_at, planned_end_at, source, status, validation_status,
			   allocated_by, planned_production_line_id)
			VALUES ($1,$2,$3,$4,$5,$6,$7,'SystemRecommended','Committed','Valid',$8,$9)
		`, f.WOID, operationID, f.SiteID, f.WorkCenterID, f.ShiftID, now.Add(-time.Hour), now.Add(time.Hour), integrationUser, f.LineID)
		if err != nil {
			t.Fatal(err)
		}
	}
	if operationStatus == "InProgress" {
		f.SessionID = uuid.NewString()
		_, err = pool.Exec(ctx, `INSERT INTO execution_session(session_id,wo_operation_id,terminal_ref,operator_user_id,status) VALUES($1,$2,'KIOSK-DEMO-01',$3,'IN_PROGRESS')`, f.SessionID, f.OperationID, integrationUser)
		if err != nil {
			t.Fatal(err)
		}
	}
	return f
}

func requireStates(t *testing.T, pool *pgxpool.Pool, f executionFixture, wantWO, wantOperation, wantSession string) {
	t.Helper()
	var wo, operation string
	if err := pool.QueryRow(context.Background(), `SELECT h.status::text,o.status FROM wo_header h JOIN wo_operation o ON o.wo_id=h.wo_id WHERE h.wo_id=$1 AND o.wo_operation_id=$2`, f.WOID, f.OperationID).Scan(&wo, &operation); err != nil {
		t.Fatal(err)
	}
	if wo != wantWO || operation != wantOperation {
		t.Fatalf("states got WO=%s operation=%s, want WO=%s operation=%s", wo, operation, wantWO, wantOperation)
	}
	if wantSession != "" {
		var session string
		if err := pool.QueryRow(context.Background(), `SELECT status FROM execution_session WHERE session_id=$1`, f.SessionID).Scan(&session); err != nil {
			t.Fatal(err)
		}
		if session != wantSession {
			t.Fatalf("session state got %s, want %s", session, wantSession)
		}
	}
}

func TestStartConfirmAndSuccessfulWorkOrderIntegration(t *testing.T) {
	pool := integrationPool(t)
	f := insertFixture(t, pool, "Released", "Ready", "KIOSK_DEMO", false)
	session, err := StartOperation(context.Background(), pool, StartOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, TerminalRef: "KIOSK-DEMO-01", OperatorUserID: integrationUser})
	if err != nil {
		t.Fatalf("start failed: %v", err)
	}
	f.SessionID = session.SessionID
	duplicate, err := StartOperation(context.Background(), pool, StartOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, TerminalRef: "KIOSK-DEMO-01", OperatorUserID: integrationUser})
	if err != nil || duplicate.SessionID != session.SessionID {
		t.Fatalf("idempotent start got %#v, %v", duplicate, err)
	}
	if _, err := StartOperation(context.Background(), pool, StartOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, TerminalRef: "OTHER", OperatorUserID: integrationUser}); err == nil || !strings.Contains(err.Error(), "ACTIVE_SESSION_CONFLICT") {
		t.Fatalf("expected competing start rejection, got %v", err)
	}
	if _, err := ConfirmOperation(context.Background(), pool, nil, ConfirmOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, SessionID: f.SessionID, QtyGood: -1, OperatorUserID: integrationUser}); err == nil || !strings.Contains(err.Error(), "QUANTITY_INVALID") {
		t.Fatalf("expected quantity validation, got %v", err)
	}
	confirmation, err := ConfirmOperation(context.Background(), pool, nil, ConfirmOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, SessionID: f.SessionID, QtyGood: 10, OperatorUserID: integrationUser, RoleCode: "OPERATOR", IdempotencyAttempt: "one"})
	if err != nil {
		t.Fatalf("confirm failed: %v", err)
	}
	duplicateConfirmation, err := ConfirmOperation(context.Background(), pool, nil, ConfirmOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, SessionID: f.SessionID, QtyGood: 10, OperatorUserID: integrationUser})
	if err != nil || duplicateConfirmation.ConfirmationID != confirmation.ConfirmationID {
		t.Fatalf("idempotent confirm got %#v, %v", duplicateConfirmation, err)
	}
	requireStates(t, pool, f, "Completed", "Finished", "COMPLETED")
}

func TestFailureRetryAndBlockingIntegration(t *testing.T) {
	pool := integrationPool(t)
	f := insertFixture(t, pool, "InProgress", "InProgress", "KIOSK_DEMO", true)
	base := FailOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, SessionID: f.SessionID, OperatorUserID: integrationUser, RoleCode: "OPERATOR", TerminalRef: "KIOSK-DEMO-01", TraceID: "trace-fail"}
	missing := base
	missing.IdempotencyKey = "fail-missing"
	if _, err := FailOperation(context.Background(), pool, missing); err == nil || !strings.Contains(err.Error(), "FAILURE_REASON_REQUIRED") {
		t.Fatalf("expected missing reason rejection, got %v", err)
	}
	base.IdempotencyKey = "fail-success"
	base.ReasonCode = "EXEC-EQUIPMENT"
	base.ReasonNameI18n = map[string]string{"vi": "Loi thiet bi", "en": "Equipment failure"}
	base.ReasonText = "Machine stopped"
	failed, err := FailOperation(context.Background(), pool, base)
	if err != nil {
		t.Fatalf("fail command failed: %v", err)
	}
	requireStates(t, pool, f, "Paused", "ExecutionError", "FAILED")
	duplicate, err := FailOperation(context.Background(), pool, base)
	if err != nil || duplicate.HistoryID != failed.HistoryID {
		t.Fatalf("duplicate fail got %#v, %v", duplicate, err)
	}
	other := insertFixture(t, pool, "InProgress", "InProgress", "KIOSK_DEMO", false)
	collision := base
	collision.WOID = other.WOID
	collision.WOOperationID = other.OperationID
	collision.SessionID = other.SessionID
	if _, err := FailOperation(context.Background(), pool, collision); err == nil || !strings.Contains(err.Error(), "IDEMPOTENCY_KEY_CONFLICT") {
		t.Fatalf("cross-operation idempotency collision must be rejected, got %v", err)
	}
	var historyCount, failedEventCount, statusEventCount int
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*)::int FROM wo_operation_execution_history WHERE wo_operation_id=$1 AND action='FAILED'`, f.OperationID).Scan(&historyCount); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), `SELECT (COUNT(*) FILTER (WHERE event_type='MES.Execution.OperationFailed.v1'))::int, (COUNT(*) FILTER (WHERE event_type='MES.Execution.WOStatusChanged.v1'))::int FROM outbox_events WHERE payload->'payload'->>'wo_operation_id'=$1`, f.OperationID).Scan(&failedEventCount, &statusEventCount); err != nil {
		t.Fatal(err)
	}
	if historyCount != 1 || failedEventCount != 1 || statusEventCount != 1 {
		t.Fatalf("unexpected audit/outbox counts: history=%d failed=%d status=%d", historyCount, failedEventCount, statusEventCount)
	}
	var eventReason, eventFrom, eventTo string
	if err := pool.QueryRow(context.Background(), `SELECT payload->'payload'->>'reason_code',payload->'payload'->>'from_state',payload->'payload'->>'to_state' FROM outbox_events WHERE event_type='MES.Execution.OperationFailed.v1' AND payload->'payload'->>'wo_operation_id'=$1`, f.OperationID).Scan(&eventReason, &eventFrom, &eventTo); err != nil {
		t.Fatal(err)
	}
	if eventReason != "EXEC-EQUIPMENT" || eventFrom != "InProgress" || eventTo != "ExecutionError" {
		t.Fatalf("invalid failure event payload: %s %s %s", eventReason, eventFrom, eventTo)
	}
	if completed, err := CheckAndCompleteWorkOrder(context.Background(), pool, f.WOID, integrationUser); err != nil || completed {
		t.Fatalf("failed WO must not complete: completed=%v err=%v", completed, err)
	}
	if _, err := StartOperation(context.Background(), pool, StartOperationInput{WOID: f.WOID, WOOperationID: f.NextOperationID, TerminalRef: "KIOSK-DEMO-01", OperatorUserID: integrationUser}); err == nil {
		t.Fatal("successor start must be blocked while WO is paused")
	}
	denied := RetryOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, OperatorUserID: uuid.NewString(), RoleCode: "OPERATOR", TerminalRef: "KIOSK-DEMO-01", IdempotencyKey: "retry-denied"}
	if _, err := RetryOperation(context.Background(), pool, denied); err == nil || !strings.Contains(err.Error(), "RETRY_FORBIDDEN") {
		t.Fatalf("expected retry denial, got %v", err)
	}
	allowed := RetryOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, OperatorUserID: integrationUser, RoleCode: "OPERATOR", TerminalRef: "KIOSK-DEMO-01", IdempotencyKey: "retry-success", TraceID: "trace-retry"}
	retried, err := RetryOperation(context.Background(), pool, allowed)
	if err != nil {
		t.Fatalf("retry failed: %v", err)
	}
	if retried.ToOperationStatus != "Ready" {
		t.Fatalf("unexpected retry result: %#v", retried)
	}
	requireStates(t, pool, f, "InProgress", "Ready", "FAILED")
	var sessionCount, retryHistory int
	_ = pool.QueryRow(context.Background(), `SELECT COUNT(*)::int FROM execution_session WHERE wo_operation_id=$1`, f.OperationID).Scan(&sessionCount)
	_ = pool.QueryRow(context.Background(), `SELECT COUNT(*)::int FROM wo_operation_execution_history WHERE wo_operation_id=$1`, f.OperationID).Scan(&retryHistory)
	if sessionCount != 1 || retryHistory != 2 {
		t.Fatalf("retry must preserve one failed session and append history: sessions=%d history=%d", sessionCount, retryHistory)
	}
	newSession, err := StartOperation(context.Background(), pool, StartOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, TerminalRef: "KIOSK-DEMO-01", OperatorUserID: integrationUser})
	if err != nil || newSession.SessionID == f.SessionID {
		t.Fatalf("new attempt start failed: %#v %v", newSession, err)
	}
}

func TestAbortIsNotFailureIntegration(t *testing.T) {
	pool := integrationPool(t)
	f := insertFixture(t, pool, "InProgress", "InProgress", "KIOSK_DEMO", false)
	input := AbortOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, SessionID: f.SessionID, OperatorUserID: integrationUser, RoleCode: "OPERATOR", TerminalRef: "KIOSK-DEMO-01", IdempotencyKey: "abort-success"}
	result, err := AbortOperation(context.Background(), pool, input)
	if err != nil {
		t.Fatalf("abort failed: %v", err)
	}
	duplicate, err := AbortOperation(context.Background(), pool, input)
	if err != nil || duplicate.HistoryID != result.HistoryID {
		t.Fatalf("duplicate abort got %#v, %v", duplicate, err)
	}
	requireStates(t, pool, f, "InProgress", "Ready", "ABORTED")
	var failedCount, abortCount int
	if err := pool.QueryRow(context.Background(), `SELECT (COUNT(*) FILTER (WHERE action='FAILED'))::int, (COUNT(*) FILTER (WHERE action='ABORTED'))::int FROM wo_operation_execution_history WHERE wo_operation_id=$1`, f.OperationID).Scan(&failedCount, &abortCount); err != nil {
		t.Fatal(err)
	}
	if failedCount != 0 || abortCount != 1 {
		t.Fatalf("abort history is incorrect: failed=%d aborted=%d", failedCount, abortCount)
	}
}

func TestInvalidStateAndPrintStationCommandsIntegration(t *testing.T) {
	pool := integrationPool(t)
	ready := insertFixture(t, pool, "InProgress", "Ready", "KIOSK_DEMO", false)
	if _, err := FailOperation(context.Background(), pool, FailOperationInput{WOID: ready.WOID, WOOperationID: ready.OperationID, SessionID: uuid.NewString(), ReasonCode: "EXEC-EQUIPMENT", OperatorUserID: integrationUser, IdempotencyKey: "invalid-state"}); err == nil {
		t.Fatal("fail from Ready must be rejected")
	}
	printing := insertFixture(t, pool, "InProgress", "InProgress", "PRINT_STATION", false)
	if _, err := FailOperation(context.Background(), pool, FailOperationInput{WOID: printing.WOID, WOOperationID: printing.OperationID, SessionID: printing.SessionID, ReasonCode: "EXEC-EQUIPMENT", OperatorUserID: integrationUser, TerminalRef: "KIOSK-DEMO-01", IdempotencyKey: "print-fail"}); err == nil || !strings.Contains(err.Error(), "PRINT_STATION") {
		t.Fatalf("print fail should be rejected, got %v", err)
	}
	if _, err := ConfirmOperation(context.Background(), pool, nil, ConfirmOperationInput{WOID: printing.WOID, WOOperationID: printing.OperationID, SessionID: printing.SessionID, QtyGood: 1, OperatorUserID: integrationUser}); err == nil || !strings.Contains(err.Error(), "PRINT_STATION") {
		t.Fatalf("print confirm should be rejected, got %v", err)
	}
	printReady := insertFixture(t, pool, "Released", "Ready", "PRINT_STATION", false)
	if _, err := StartOperation(context.Background(), pool, StartOperationInput{WOID: printReady.WOID, WOOperationID: printReady.OperationID, TerminalRef: "KIOSK-DEMO-01", OperatorUserID: integrationUser}); err == nil || !strings.Contains(err.Error(), "PRINT_STATION") {
		t.Fatalf("print start should be rejected, got %v", err)
	}
	if _, err := RetryOperation(context.Background(), pool, RetryOperationInput{WOID: printing.WOID, WOOperationID: printing.OperationID, OperatorUserID: integrationUser, RoleCode: "OPERATOR", TerminalRef: "KIOSK-DEMO-01", IdempotencyKey: "print-retry"}); err == nil || !strings.Contains(err.Error(), "PRINT_STATION") {
		t.Fatalf("print retry should be rejected, got %v", err)
	}
}

func TestPlantManagerRetrySiteScopeIntegration(t *testing.T) {
	pool := integrationPool(t)
	f := insertFixture(t, pool, "InProgress", "InProgress", "KIOSK_DEMO", false)
	_, err := FailOperation(context.Background(), pool, FailOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, SessionID: f.SessionID, ReasonCode: "EXEC-EQUIPMENT", OperatorUserID: integrationUser, TerminalRef: "KIOSK-DEMO-01", IdempotencyKey: "manager-fail"})
	if err != nil {
		t.Fatal(err)
	}
	manager := uuid.NewString()
	if _, err := RetryOperation(context.Background(), pool, RetryOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, OperatorUserID: manager, RoleCode: "PLANT_MANAGER", SiteID: uuid.NewString(), IdempotencyKey: "manager-wrong-site"}); err == nil || !strings.Contains(err.Error(), "SITE_SCOPE") {
		t.Fatalf("expected site-scope denial, got %v", err)
	}
	if _, err := RetryOperation(context.Background(), pool, RetryOperationInput{WOID: f.WOID, WOOperationID: f.OperationID, OperatorUserID: manager, RoleCode: "PLANT_MANAGER", SiteID: f.SiteID, IdempotencyKey: "manager-right-site"}); err != nil {
		t.Fatalf("plant manager retry failed: %v", err)
	}
}

func TestMigrationHistoryIsAppendOnly(t *testing.T) {
	pool := integrationPool(t)
	var constraint string
	err := pool.QueryRow(context.Background(), `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='wo_operation_execution_history'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%RETRY_REQUESTED%' LIMIT 1`).Scan(&constraint)
	if err != nil || !strings.Contains(constraint, "FAILED") || !strings.Contains(constraint, "ABORTED") {
		t.Fatalf("history action constraint missing: %q, %v", constraint, err)
	}
}

func TestDemoDispatchQueuesEveryEligibleManualOperationWithPersistedPolicy(t *testing.T) {
	pool := integrationPool(t)
	f := insertFixture(t, pool, "Released", "Ready", "MANUAL", false)
	ctx := context.Background()
	routingOperationID := uuid.NewString()
	if _, err := pool.Exec(ctx, `UPDATE wo_header SET dispatch_mode='DEMO_SHARED_KIOSK' WHERE wo_id=$1`, f.WOID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE wo_operation SET routing_operation_id=$2 WHERE wo_operation_id=$1`, f.OperationID, routingOperationID); err != nil {
		t.Fatal(err)
	}
	secondOperationID := uuid.NewString()
	if _, err := pool.Exec(ctx, `
		INSERT INTO wo_operation
		  (wo_operation_id,wo_id,sequence_no,operation_id,routing_operation_id,operation_code,
		   operation_name,work_center_id,status,execution_target_type,production_line_id)
		VALUES($1,$2,20,$3,$4,'OP-MANUAL-02','{"vi":"Thu cong 02","en":"Manual 02"}'::jsonb,
		       $5,'Ready','MANUAL',$6)
	`, secondOperationID, f.WOID, uuid.NewString(), uuid.NewString(), f.WorkCenterID, f.LineID); err != nil {
		t.Fatal(err)
	}

	queued, err := DispatchReadyOperations(ctx, pool, f.WOID, integrationUser, "phase02-demo-dispatch")
	if err != nil {
		t.Fatal(err)
	}
	if queued != 2 {
		t.Fatalf("expected both eligible manual operations to be queued, got %d", queued)
	}
	var eventCount int
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM outbox_events
		WHERE event_type='MES.Execution.OperationDispatchQueued.v1'
		  AND payload->'payload'->>'wo_id'=$1
		  AND payload->'payload'->>'dispatch_mode'='DEMO_SHARED_KIOSK'
		  AND payload->'payload'->>'execution_target_type'='MANUAL'
	`, f.WOID).Scan(&eventCount); err != nil {
		t.Fatal(err)
	}
	if eventCount != 2 {
		t.Fatalf("expected two correlated demo dispatch events, got %d", eventCount)
	}
}
