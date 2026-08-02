package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
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

type StartExecutionInput struct {
	WOID    string
	UserID  string
	TraceID string
}

// StartExecution moves a Released WO into execution and queues only the
// currently predecessor-ready operations. The transaction owns both state and
// outbox writes, so a restart cannot create a second dispatch for an operation.
func StartExecution(ctx context.Context, pool *pgxpool.Pool, input StartExecutionInput) (map[string]interface{}, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.UserID)
	var status string
	if err := tx.QueryRow(ctx, `SELECT status::text FROM wo_header WHERE wo_id = $1 FOR UPDATE`, input.WOID).Scan(&status); err != nil {
		return nil, fmt.Errorf("WO_NOT_FOUND")
	}
	if status != "Released" && status != "InProgress" {
		return nil, fmt.Errorf("WO_EXECUTION_STATUS_INVALID")
	}
	if err := requireSelectedLineConsistency(ctx, tx, input.WOID); err != nil {
		return nil, err
	}
	var operationCount, allocationCount int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*)::int,
		       COUNT(a.allocation_id)::int
		FROM wo_operation o
		LEFT JOIN wo_resource_allocation a
		  ON a.wo_operation_id=o.wo_operation_id
		 AND a.status='Committed'
		 AND a.validation_status IN ('Valid','ValidWithWarnings')
		WHERE o.wo_id=$1`, input.WOID).Scan(&operationCount, &allocationCount); err != nil {
		return nil, err
	}
	if operationCount == 0 || allocationCount != operationCount {
		return nil, fmt.Errorf("WO_RESOURCE_ALLOCATION_INVALID")
	}
	if status == "Released" {
		if _, err := tx.Exec(ctx, `UPDATE wo_header SET status='InProgress', updated_by=$1, updated_at=NOW(), row_version=row_version+1 WHERE wo_id=$2`, input.UserID, input.WOID); err != nil {
			return nil, err
		}
	}
	queued, err := queueReadyOperations(ctx, tx, input.WOID, input.UserID, input.TraceID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return map[string]interface{}{"wo_id": input.WOID, "status": "InProgress", "queued_operations": queued}, nil
}

func DispatchReadyOperations(ctx context.Context, pool *pgxpool.Pool, woID, userID, traceID string) (int, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, userID)
	count, err := queueReadyOperations(ctx, tx, woID, userID, traceID)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return count, nil
}

type ExecutionTx interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

type executionTx = ExecutionTx

// QueueDemoPrintOperationsTx queues every PRINT_STATION operation directly
// during demo approval. It intentionally ignores predecessor/material gates;
// the caller owns the transaction so approval and the print outbox are atomic.
func QueueDemoPrintOperationsTx(ctx context.Context, tx ExecutionTx, woID, userID, traceID string) (int, error) {
	return queueOperations(ctx, tx, woID, userID, traceID, true)
}

func queueReadyOperations(ctx context.Context, tx executionTx, woID, userID, traceID string) (int, error) {
	return queueOperations(ctx, tx, woID, userID, traceID, false)
}

func queueOperations(ctx context.Context, tx executionTx, woID, userID, traceID string, printOnly bool) (int, error) {
	where := `o.status IN ('Pending','Ready') AND (o.predecessor_seq IS NULL OR o.predecessor_seq='' OR NOT EXISTS (
			SELECT 1 FROM wo_operation p WHERE p.wo_id=o.wo_id AND p.sequence_no = ANY(string_to_array(o.predecessor_seq, ',')::int[]) AND p.status <> 'Finished'))`
	if printOnly {
		where = `o.status IN ('Pending','Ready') AND o.execution_target_type='PRINT_STATION'`
	}
	rows, err := tx.Query(ctx, fmt.Sprintf(`
		SELECT o.wo_operation_id, o.operation_id, o.routing_operation_id, o.operation_code, o.operation_name,
		       o.work_center_id, COALESCE(a.planned_workstation_id, o.workstation_id), o.execution_target_type, o.sequence_no, o.predecessor_seq,
		       h.wo_code, h.quantity, h.item_code, h.item_name, o.requires_output_label,
		       o.base_quantity, o.units_per_label, o.label_quantity_method, o.copies_per_label, o.label_count, o.print_copies
		FROM wo_operation o JOIN wo_header h ON h.wo_id=o.wo_id
		LEFT JOIN wo_resource_allocation a ON a.wo_operation_id=o.wo_operation_id AND a.status='Committed' AND a.validation_status IN ('Valid','ValidWithWarnings')
		WHERE o.wo_id=$1 AND %s
		ORDER BY o.sequence_no`, where), woID)
	if err != nil {
		return 0, err
	}
	type readyOperation struct {
		opID, operationID, routingID, opCode, wcID, target, woCode, itemCode, itemName string
		opName                                                                         []byte
		workstationID                                                                  *string
		seq                                                                            int
		pred                                                                           *string
		quantity                                                                       float64
		requiresOutputLabel                                                            bool
		baseQuantity, unitsPerLabel                                                    *float64
		labelQuantityMethod                                                            string
		copiesPerLabel, labelCount, printCopies                                        int
	}
	var ready []readyOperation
	for rows.Next() {
		var op readyOperation
		if err := rows.Scan(&op.opID, &op.operationID, &op.routingID, &op.opCode, &op.opName, &op.wcID, &op.workstationID, &op.target, &op.seq, &op.pred, &op.woCode, &op.quantity, &op.itemCode, &op.itemName, &op.requiresOutputLabel, &op.baseQuantity, &op.unitsPerLabel, &op.labelQuantityMethod, &op.copiesPerLabel, &op.labelCount, &op.printCopies); err != nil {
			rows.Close()
			return 0, err
		}
		ready = append(ready, op)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()
	count := 0
	for _, op := range ready {
		opID, operationID, routingID, opCode, opName, wcID, workstationID, target, seq, woCode, quantity, itemCode, itemName := op.opID, op.operationID, op.routingID, op.opCode, op.opName, op.wcID, op.workstationID, op.target, op.seq, op.woCode, op.quantity, op.itemCode, op.itemName
		if target == "" {
			target = "UNRESOLVED"
		}
		if target == "UNRESOLVED" {
			return count, fmt.Errorf("WO_OPERATION_EXECUTION_TARGET_UNRESOLVED")
		}
		printStationCode, printStationID, err := resolvePrintStation(ctx, workstationID)
		if err != nil && target == "PRINT_STATION" {
			return count, err
		}
		eventType := "MES.Execution.OperationDispatchQueued.v1"
		status := "DispatchQueued"
		payload := map[string]interface{}{
			"work_order_id": woID, "workOrderId": woID, "work_order_code": woCode, "workOrderCode": woCode,
			"wo_operation_id": opID, "woOperationId": opID, "routing_operation_id": routingID,
			"sequence_no": seq, "operation_code": opCode, "operation_name": string(opName),
			"work_center_id": wcID, "workstation_id": workstationID, "dispatch_mode": "DEMO_SHARED_KIOSK",
			"execution_target_type": target, "status": "READY_FOR_EXECUTION", "trace_id": traceID,
		}
		var printJobID uuid.UUID
		printAttemptNo := 1
		if target == "PRINT_STATION" {
			eventType = "command.printer.print.batch"
			stationCode := printStationCode
			stationID := printStationID
			adapterID := os.Getenv("MES_DEMO_PRINT_ADAPTER_ID")
			if adapterID == "" {
				adapterID = "PRINT-ADAPTER-01"
			}
			var jobID uuid.UUID
			var jobCode string
			attemptNo := 1
			var existingID, existingCode string
			var existingAttempts int
			existingErr := tx.QueryRow(ctx, `SELECT print_job_id, job_code, attempt_count FROM wo_print_job WHERE wo_operation_id=$1 AND status IN ('Failed','RetryPending') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, opID).Scan(&existingID, &existingCode, &existingAttempts)
			if existingErr == nil {
				jobID, _ = uuid.Parse(existingID)
				jobCode = existingCode
				attemptNo = existingAttempts + 1
				printAttemptNo = attemptNo
				if _, err := tx.Exec(ctx, `UPDATE wo_print_job SET status='Pending', attempt_count=$1, last_error_code=NULL, last_error_message=NULL, failed_at=NULL WHERE print_job_id=$2`, attemptNo, jobID); err != nil {
					return count, err
				}
			} else if existingErr == pgx.ErrNoRows {
				jobID = uuid.New()
				jobCode = fmt.Sprintf("PJ-%s", strings.ReplaceAll(jobID.String(), "-", "")[:12])
			} else {
				return count, existingErr
			}
			commandID := uuid.New()
			idempotency := fmt.Sprintf("%s-%d", opID, attemptNo)
			if existingErr == pgx.ErrNoRows {
				if _, err := tx.Exec(ctx, `INSERT INTO wo_print_job (print_job_id, job_code, wo_id, wo_operation_id, routing_operation_id, operation_id, workstation_id, print_station_id, adapter_id, requested_quantity, status, idempotency_key, correlation_id, attempt_count) VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,'')::uuid,$9,$10,'Pending',$11,$12,$13)`, jobID, jobCode, woID, opID, routingID, operationID, workstationID, stationID, adapterID, quantity, idempotency, traceID, printAttemptNo); err != nil {
					return count, err
				}
			}
			printJobID = jobID
			if op.labelCount < 1 {
				base := valueOrBase(op.baseQuantity, valueOrBase(op.unitsPerLabel, 0))
				var quantityErr error
				op.labelCount, quantityErr = calculateLabelQuantity(quantity, base)
				if quantityErr != nil {
					return count, quantityErr
				}
			}
			if op.copiesPerLabel < 1 {
				op.copiesPerLabel = 1
			}
			if op.printCopies < 1 {
				op.printCopies = op.labelCount * op.copiesPerLabel
			}
			labelItems := make([]map[string]interface{}, 0, op.printCopies)
			for labelNo := 1; labelNo <= op.labelCount; labelNo++ {
				for copyNo := 1; copyNo <= op.copiesPerLabel; copyNo++ {
					labelItems = append(labelItems, map[string]interface{}{"job_id": fmt.Sprintf("%s-label-%03d-copy-%02d", jobID, labelNo, copyNo), "product_serial": fmt.Sprintf("%s-%03d", woCode, labelNo), "sequence": labelNo})
				}
			}
			payload = map[string]interface{}{
				"event_type": eventType, "event_id": commandID.String(), "job_id": jobID.String(), "job_no": woCode,
				"job_type": "MES_WO_PRINT", "product_code": itemCode, "product_serial": nil, "status": "PROCESSING", "source_system": "mes-execution-service",
				"timestamp":  time.Now().UTC().Format(time.RFC3339Nano),
				"attempt_no": attemptNo, "payload_json": fmt.Sprintf(`{"workOrderId":"%s","woOperationId":"%s","quantity":%v,"itemName":%q}`, woID, opID, quantity, itemName),
				"dispatch_target": "production-printer", "target_printer": nil,
				"printJobId": jobID.String(), "workOrderId": woID, "woOperationId": opID, "printStationId": stationCode, "adapterId": adapterID,
				"operationCode": opCode, "quantity": quantity, "requested_quantity": quantity, "production_standard_base_quantity": valueOrBase(op.baseQuantity, valueOrBase(op.unitsPerLabel, 0)), "calculated_cycles": op.labelCount, "required_labels": op.labelCount, "labels_per_cycle": 1, "units_per_label": op.unitsPerLabel, "label_quantity_method": op.labelQuantityMethod, "label_count": op.labelCount, "copies_per_label": op.copiesPerLabel, "print_copies": op.printCopies, "total_copies": op.printCopies, "demo_mode": DemoPrintOnApprovalEnabled(), "label_items": labelItems, "batch_size": 100, "production_order_no": woCode, "correlationId": traceID,
			}
			if _, err := tx.Exec(ctx, `UPDATE wo_operation SET print_station_id=NULLIF($1,'')::uuid, adapter_id=$2 WHERE wo_operation_id=$3`, stationID, adapterID, opID); err != nil {
				return count, err
			}
			status = "DispatchQueued"
		}
		envelope := sharedkernel.CreateEventEnvelope(eventType, "mes-execution-service", traceID, payload)
		if target == "PRINT_STATION" {
			commandID, _ := payload["event_id"].(string)
			if _, err := tx.Exec(ctx, `UPDATE wo_print_job SET command_event_id=$1, status='DispatchQueued', dispatched_at=NOW(), label_count=$3, copies_per_label=$4, total_copies=$5, units_per_label=$6, label_quantity_method=$7 WHERE print_job_id=$2`, commandID, printJobID, op.labelCount, op.copiesPerLabel, op.printCopies, op.unitsPerLabel, op.labelQuantityMethod); err != nil {
				return count, err
			}
			if _, err := tx.Exec(ctx, `INSERT INTO wo_print_job_attempt (print_job_id, attempt_no, command_event_id) VALUES ($1,$2,$3) ON CONFLICT (command_event_id) DO NOTHING`, printJobID, printAttemptNo, commandID); err != nil {
				return count, err
			}
		}
		if err := sharedkernel.WriteToOutbox(ctx, tx, eventType, envelope); err != nil {
			return count, err
		}
		printStatus := "NotRequired"
		if target == "PRINT_STATION" {
			printStatus = "Queued"
		}
		if _, err := tx.Exec(ctx, `UPDATE wo_operation SET status=$1, print_status=$2, dispatch_event_id=$3, row_version=row_version+1 WHERE wo_operation_id=$4 AND status IN ('Pending','Ready')`, status, printStatus, envelope.EventID, opID); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

func calculateLabelQuantity(quantity, base float64) (int, error) {
	if quantity <= 0 || base <= 0 {
		return 0, fmt.Errorf("PRINT_QUANTITY_CANNOT_BE_CALCULATED")
	}
	return int(math.Ceil(quantity / base)), nil
}

func valueOrBase(value *float64, fallback float64) float64 {
	if value != nil && *value > 0 {
		return *value
	}
	return fallback
}

func resolvePrintStation(ctx context.Context, workstationID *string) (string, string, error) {
	if workstationID == nil || strings.TrimSpace(*workstationID) == "" {
		return "", "", fmt.Errorf("PRINT_STATION_BINDING_MISSING")
	}
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("MASTER_DATA_SERVICE_URL")), "/")
	if baseURL == "" {
		return "", "", fmt.Errorf("PRINT_STATION_READINESS_UNAVAILABLE")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/mes/master-data/workstations/"+*workstationID+"/print-station-readiness", nil)
	if err != nil {
		return "", "", fmt.Errorf("PRINT_STATION_READINESS_UNAVAILABLE")
	}
	client := &http.Client{Timeout: 7 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("PRINT_STATION_READINESS_UNAVAILABLE")
	}
	defer resp.Body.Close()
	var body struct {
		Ready bool   `json:"ready"`
		Code  string `json:"code"`
		Data  struct {
			ID   string `json:"print_station_id"`
			Code string `json:"print_station_code"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil || resp.StatusCode >= 500 {
		return "", "", fmt.Errorf("PRINT_STATION_READINESS_UNAVAILABLE")
	}
	if !body.Ready {
		if body.Code != "" {
			return "", "", errors.New(body.Code)
		}
		return "", "", errors.New("PRINT_STATION_NOT_READY")
	}
	if body.Data.Code == "" {
		return "", "", errors.New("PRINT_STATION_BINDING_MISSING")
	}
	return body.Data.Code, body.Data.ID, nil
}
