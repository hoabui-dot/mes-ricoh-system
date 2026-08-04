//go:build integration

package usecase

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestKioskGroupedReadModelAndJobCardProjection(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	now := time.Now().UTC()
	userID, siteID, lineID, shiftID := integrationUser, uuid.NewString(), uuid.NewString(), uuid.NewString()
	workCenterID, workstationID, equipmentID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO rm_work_center(master_id,code,name,site_id,area_id,lifecycle_status) VALUES($1,'WC-PHASE03','{"vi":"Trung tam Phase 03","en":"Phase 03 Work Center"}',$2,$3,'Released')`, workCenterID, siteID, uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO rm_equipment(master_id,code,name,site_id,work_center_id,equipment_type,lifecycle_status) VALUES($1,'EQ-PHASE03','{"vi":"May Phase 03","en":"Phase 03 Equipment"}',$2,$3,'Machine','Released')`, equipmentID, siteID, workCenterID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO rm_employee(master_id,code,name,site_id,employee_status,lifecycle_status) VALUES($1,'OPERATOR-PHASE03','{"vi":"Nhan vien Phase 03","en":"Phase 03 Operator"}',$2,'Active','Released')`, userID, siteID); err != nil {
		t.Fatal(err)
	}

	mainWO := insertKioskWO(t, pool, "WO-PHASE03-MAIN", "DEMO_SHARED_KIOSK", "Paused", siteID, lineID, shiftID, now)
	states := []struct {
		sequence                          int
		code, status, target, predecessor string
	}{
		{10, "OP-FINISHED", "Finished", "MANUAL", ""},
		{20, "OP-ACTIVE", "InProgress", "MANUAL", "10"},
		{30, "OP-FAILED", "ExecutionError", "MANUAL", "20"},
		{40, "OP-BLOCKED-PRED", "Ready", "MANUAL", "30"},
		{50, "OP-BLOCKED-PAUSE", "Pending", "MANUAL", ""},
		{60, "OP-PRINT", "DispatchQueued", "PRINT_STATION", "50"},
	}
	operationIDs := map[int]string{}
	for _, state := range states {
		operationID := uuid.NewString()
		operationIDs[state.sequence] = operationID
		printStatus := "NotRequired"
		if state.target == "PRINT_STATION" {
			printStatus = "Queued"
		}
		_, err := pool.Exec(ctx, `
			INSERT INTO wo_operation
			 (wo_operation_id,wo_id,sequence_no,operation_id,routing_operation_id,operation_code,
			  operation_name,work_center_id,predecessor_seq,status,execution_target_type,
			  workstation_id,production_line_id,production_line_code,production_line_name_i18n,
			  expected_good_quantity,planned_start_at,planned_end_at,print_status)
			VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NULLIF($9,''),$10,$11,$12,$13,'LINE-PHASE03',
			       '{"vi":"Day chuyen Phase 03","en":"Phase 03 Line"}'::jsonb,10,$14,$15,$16)
		`, operationID, mainWO, state.sequence, uuid.NewString(), uuid.NewString(), state.code,
			`{"vi":"`+state.code+` VI","en":"`+state.code+` EN"}`, workCenterID, state.predecessor,
			state.status, state.target, workstationID, lineID, now.Add(-time.Hour), now.Add(time.Hour), printStatus)
		if err != nil {
			t.Fatal(err)
		}
		if state.target != "PRINT_STATION" {
			_, err = pool.Exec(ctx, `
				INSERT INTO wo_resource_allocation
				 (wo_id,wo_operation_id,site_id,planned_work_center_id,planned_workstation_id,
				  planned_equipment_id,planned_shift_id,planned_start_at,planned_end_at,source,status,
				  validation_status,validation_snapshot,allocated_by,planned_production_line_id)
				VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SystemRecommended','Committed','Valid',
				 $10::jsonb,$11,$12)
			`, mainWO, operationID, siteID, workCenterID, workstationID, equipmentID, shiftID,
				now.Add(-time.Hour), now.Add(time.Hour),
				`{"candidate":{"workstation":{"id":"`+workstationID+`","code":"WS-PHASE03","name":{"vi":"Tram Phase 03","en":"Phase 03 Workstation"}}}}`, userID, lineID)
			if err != nil {
				t.Fatal(err)
			}
		}
	}

	finishedSession := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO execution_session(session_id,wo_operation_id,terminal_ref,operator_user_id,started_at,ended_at,status) VALUES($1,$2,'KIOSK-DEMO-01',$3,$4,$5,'COMPLETED')`, finishedSession, operationIDs[10], userID, now.Add(-50*time.Minute), now.Add(-40*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO operation_confirmation(wo_operation_id,session_id,qty_good,qty_scrap,confirmed_at) VALUES($1,$2,8,2,$3)`, operationIDs[10], finishedSession, now.Add(-40*time.Minute)); err != nil {
		t.Fatal(err)
	}
	activeSession := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO execution_session(session_id,wo_operation_id,terminal_ref,operator_user_id,started_at,status) VALUES($1,$2,'KIOSK-DEMO-01',$3,$4,'IN_PROGRESS')`, activeSession, operationIDs[20], userID, now.Add(-10*time.Minute)); err != nil {
		t.Fatal(err)
	}
	failedSession := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO execution_session(session_id,wo_operation_id,terminal_ref,operator_user_id,started_at,ended_at,status) VALUES($1,$2,'KIOSK-DEMO-01',$3,$4,$5,'FAILED')`, failedSession, operationIDs[30], userID, now.Add(-30*time.Minute), now.Add(-20*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO wo_operation_execution_history
		 (wo_id,wo_operation_id,session_id,action,reason_code,reason_name_i18n,reason_text,
		  actor_user_id,actor_role_code,terminal_ref,from_operation_status,to_operation_status,
		  from_wo_status,to_wo_status,idempotency_key,trace_id,occurred_at)
		VALUES($1,$2,$3,'FAILED','EXEC-EQUIPMENT','{"vi":"Loi thiet bi","en":"Equipment failure"}',
		       'Motor stopped',$4,'OPERATOR','KIOSK-DEMO-01','InProgress','ExecutionError',
		       'InProgress','Paused','phase03-failure','phase03',$5)
	`, mainWO, operationIDs[30], failedSession, userID, now.Add(-20*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO wo_print_job
		 (job_code,wo_id,wo_operation_id,operation_id,workstation_id,requested_quantity,status,
		  idempotency_key,correlation_id,attempt_count,dispatched_at)
		VALUES('PJ-PHASE03',$1,$2,$3,$4,10,'DispatchQueued','phase03-print','phase03',1,$5)
	`, mainWO, operationIDs[60], uuid.NewString(), workstationID, now.Add(-5*time.Minute)); err != nil {
		t.Fatal(err)
	}

	readyWO := insertKioskWO(t, pool, "WO-PHASE03-READY", "DEMO_SHARED_KIOSK", "Released", siteID, lineID, shiftID, now.Add(-time.Minute))
	readyOperation := uuid.NewString()
	insertReadyKioskOperation(t, pool, readyWO, readyOperation, siteID, lineID, shiftID, workCenterID, workstationID, equipmentID, userID, now)
	thirdWO := insertKioskWO(t, pool, "WO-PHASE03-THIRD", "DEMO_SHARED_KIOSK", "Released", siteID, lineID, shiftID, now.Add(-2*time.Minute))
	insertReadyKioskOperation(t, pool, thirdWO, uuid.NewString(), siteID, lineID, shiftID, workCenterID, workstationID, equipmentID, userID, now)
	productionWO := insertKioskWO(t, pool, "WO-PHASE03-PRODUCTION", "WORK_CENTER", "Released", siteID, lineID, shiftID, now)
	insertReadyKioskOperation(t, pool, productionWO, uuid.NewString(), siteID, lineID, shiftID, workCenterID, workstationID, equipmentID, userID, now)

	pageOne, err := ListKioskWorkOrders(ctx, pool, "KIOSK-DEMO-01", 1, 2)
	if err != nil {
		t.Fatal(err)
	}
	if pageOne.Pagination.TotalItems != 3 || pageOne.Pagination.TotalPages != 2 || len(pageOne.Data) != 2 {
		t.Fatalf("pagination or terminal scope mismatch: %+v", pageOne.Pagination)
	}
	pageTwo, err := ListKioskWorkOrders(ctx, pool, "KIOSK-DEMO-01", 2, 2)
	if err != nil || len(pageTwo.Data) != 1 {
		t.Fatalf("second page mismatch: data=%d err=%v", len(pageTwo.Data), err)
	}
	if _, err := ListKioskWorkOrders(ctx, pool, "KIOSK-CUT-01", 1, 20); err == nil {
		t.Fatal("production terminal must not access demo grouped projection")
	}

	detail, err := GetKioskWorkOrderDetail(ctx, pool, "KIOSK-DEMO-01", mainWO)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.JobCards) != 5 || len(detail.PrintOperations) != 1 {
		t.Fatalf("manual/print projection mismatch: manual=%d print=%d", len(detail.JobCards), len(detail.PrintOperations))
	}
	counts := detail.WorkOrder.JobCounts
	if counts.Total != 5 || counts.Completed != 1 || counts.InProgress != 1 || counts.Failed != 1 || counts.Blocked != 2 || counts.Waiting != 0 || counts.Ready != 0 {
		t.Fatalf("state counts mismatch: %+v", counts)
	}
	if math.Abs(detail.WorkOrder.ProgressPercent-16.67) > 0.001 || detail.WorkOrder.ManualProgressPercent != 20 {
		t.Fatalf("progress mismatch overall=%v manual=%v", detail.WorkOrder.ProgressPercent, detail.WorkOrder.ManualProgressPercent)
	}
	if detail.WorkOrder.UOMCode != "PCS" {
		t.Fatalf("business UOM code was not projected: %+v", detail.WorkOrder)
	}
	byCode := map[string]bool{}
	for _, card := range detail.JobCards {
		if byCode[card.OperationCode] {
			t.Fatalf("duplicate job card %s", card.OperationCode)
		}
		byCode[card.OperationCode] = true
		if card.ExecutionTargetType == "PRINT_STATION" {
			t.Fatal("print operation leaked into manual job cards")
		}
		if card.OperationCode == "OP-ACTIVE" {
			if card.ActiveSession == nil || card.ActiveSession.SessionID != activeSession || card.ActiveSession.OperatorCode != "OPERATOR-PHASE03" || !card.ActionEligibility.CanComplete || !card.ActionEligibility.CanFail || !card.ActionEligibility.CanAbort {
				t.Fatalf("active-session recovery/eligibility mismatch: %+v", card)
			}
		}
		if card.OperationCode == "OP-FAILED" {
			if card.Failure == nil || card.Failure.ReasonCode != "EXEC-EQUIPMENT" || card.Failure.ReasonText == nil || !card.ActionEligibility.CanRetry {
				t.Fatalf("failure projection mismatch: %+v", card)
			}
		}
	}
	if !detail.PrintOperations[0].ReadOnly || detail.PrintOperations[0].PrintJobCode != "PJ-PHASE03" {
		t.Fatalf("print read-only context mismatch: %+v", detail.PrintOperations[0])
	}

	readyDetail, err := GetKioskWorkOrderDetail(ctx, pool, "KIOSK-DEMO-01", readyWO)
	if err != nil || len(readyDetail.JobCards) != 1 || !readyDetail.JobCards[0].ActionEligibility.CanStart || len(readyDetail.JobCards[0].ActionEligibility.Blockers) != 0 {
		t.Fatalf("ready action eligibility mismatch: detail=%+v err=%v", readyDetail, err)
	}
	if _, err := GetKioskWorkOrderDetail(ctx, pool, "KIOSK-DEMO-01", productionWO); err == nil {
		t.Fatal("production WO must not be readable from demo detail")
	}
}

func insertKioskWO(t *testing.T, pool *pgxpool.Pool, code, mode, status, siteID, lineID, shiftID string, now time.Time) string {
	t.Helper()
	woID := uuid.NewString()
	itemRevisionID := uuid.NewString()
	uomID := uuid.NewString()
	if _, err := pool.Exec(context.Background(), `
		INSERT INTO rm_item_revision
		 (master_id,code,name,revision_code,item_type,site_id,base_uom_id,base_uom_code,lifecycle_status)
		VALUES($1,$2,'{"vi":"Vat tu Phase 03","en":"Phase 03 Item"}','R1','FG',$3,$4,'PCS','Released')
	`, itemRevisionID, "ITEM-REV-"+code, siteID, uomID); err != nil {
		t.Fatal(err)
	}
	_, err := pool.Exec(context.Background(), `
		INSERT INTO wo_header
		 (wo_id,wo_code,production_version_id,item_revision_id,item_code,item_name,quantity,uom_id,
		  site_id,shift_id,planned_start_at,planned_end_at,status,created_by,dispatch_mode,
		  selected_production_line_id,selected_production_line_code,selected_production_line_name_i18n,
		  line_selection_mode,line_selection_status,updated_at)
		VALUES($1,$2,$3,$4,'ITEM-PHASE03','Phase 03 Item',10,$5,$6,$7,$8,$9,$10,$11,$12,$13,
		       'LINE-PHASE03','{"vi":"Day chuyen Phase 03","en":"Phase 03 Line"}'::jsonb,
		       'AUTO','READY',$14)
	`, woID, code, uuid.NewString(), itemRevisionID, uomID, siteID, shiftID,
		now.Add(-time.Hour), now.Add(time.Hour), status, integrationUser, mode, lineID, now)
	if err != nil {
		t.Fatal(err)
	}
	return woID
}

func insertReadyKioskOperation(t *testing.T, pool *pgxpool.Pool, woID, operationID, siteID, lineID, shiftID, workCenterID, workstationID, equipmentID, userID string, now time.Time) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO wo_operation
		 (wo_operation_id,wo_id,sequence_no,operation_id,routing_operation_id,operation_code,
		  operation_name,work_center_id,status,execution_target_type,workstation_id,
		  production_line_id,production_line_code,production_line_name_i18n,expected_good_quantity)
		VALUES($1,$2,10,$3,$4,'OP-READY','{"vi":"San sang","en":"Ready"}'::jsonb,$5,
		       'Ready','MANUAL',$6,$7,'LINE-PHASE03','{"vi":"Day chuyen Phase 03","en":"Phase 03 Line"}',10)
	`, operationID, woID, uuid.NewString(), uuid.NewString(), workCenterID, workstationID, lineID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(context.Background(), `
		INSERT INTO wo_resource_allocation
		 (wo_id,wo_operation_id,site_id,planned_work_center_id,planned_workstation_id,
		  planned_equipment_id,planned_shift_id,planned_start_at,planned_end_at,source,status,
		  validation_status,validation_snapshot,allocated_by,planned_production_line_id)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SystemRecommended','Committed','Valid',
		       $10::jsonb,$11,$12)
	`, woID, operationID, siteID, workCenterID, workstationID, equipmentID, shiftID,
		now.Add(-time.Hour), now.Add(time.Hour),
		`{"candidate":{"workstation":{"id":"`+workstationID+`","code":"WS-PHASE03","name":{"vi":"Tram Phase 03","en":"Phase 03 Workstation"}}}}`, userID, lineID)
	if err != nil {
		t.Fatal(err)
	}
}
