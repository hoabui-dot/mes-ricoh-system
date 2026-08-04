package events

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/application/usecase"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
	"github.com/segmentio/kafka-go"
)

type PrinterResultConsumer struct {
	brokers []string
	pool    *pgxpool.Pool
	reader  *kafka.Reader
	cancel  context.CancelFunc
	wg      sync.WaitGroup
}

func NewPrinterResultConsumer(brokers []string, pool *pgxpool.Pool) *PrinterResultConsumer {
	return &PrinterResultConsumer{brokers: brokers, pool: pool}
}

func (c *PrinterResultConsumer) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	c.reader = kafka.NewReader(kafka.ReaderConfig{Brokers: c.brokers, Topic: "station.events.printer", GroupID: "mes-execution-printer-results", StartOffset: kafka.FirstOffset, MinBytes: 1, MaxBytes: 10 * 1024 * 1024})
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		log.Printf("[PrinterResultConsumer] Listening on station.events.printer")
		for {
			message, err := c.reader.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("[PrinterResultConsumer] read error: %v", err)
				time.Sleep(time.Second)
				continue
			}
			if err := c.process(ctx, message.Value); err != nil {
				log.Printf("[PrinterResultConsumer] process error: %v", err)
			}
		}
	}()
}

func (c *PrinterResultConsumer) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
	if c.reader != nil {
		_ = c.reader.Close()
	}
	c.wg.Wait()
}

func (c *PrinterResultConsumer) process(ctx context.Context, value []byte) error {
	var root map[string]interface{}
	if err := json.Unmarshal(value, &root); err != nil {
		return err
	}
	payload := root
	if nested, ok := root["Payload"].(map[string]interface{}); ok {
		payload = nested
	} else if nested, ok := root["payload"].(map[string]interface{}); ok {
		payload = nested
	}
	// Kafka envelopes from the printer adapter use the shared-contract PascalCase
	// fields, while older publishers used camel/snake case. Accept both forms so
	// a valid result is never silently discarded at the transport boundary.
	eventType := stringValue(root, "EventType", "eventType", "event_type")
	if eventType == "" {
		eventType = stringValue(payload, "EventType", "eventType", "event_type")
	}
	lowerEventType := strings.ToLower(eventType)
	if !strings.Contains(lowerEventType, "printer.printed") && !strings.Contains(lowerEventType, "printer.error") && !strings.Contains(lowerEventType, "batch.printed") && lowerEventType != "productionbatchprinted" && lowerEventType != "printerprinted" {
		return nil
	}
	eventID := stringValue(payload, "event_id", "eventId", "EventId")
	if eventID == "" {
		eventID = stringValue(root, "EventId", "eventId", "event_id")
	}
	jobID := stringValue(payload, "job_id", "jobId", "JobId", "command_id", "commandId", "CommandId")
	if eventID == "" || jobID == "" {
		log.Printf("[PrinterResultConsumer] ignored printer result with missing correlation event_id=%q job_id=%q event_type=%q", eventID, jobID, eventType)
		return nil
	}
	success := (strings.Contains(lowerEventType, "printer.printed") || strings.Contains(lowerEventType, "batch.printed")) && boolValue(payload, "success")
	printerCode := stringValue(payload, "printer_code", "printerCode")
	errorMessage := stringValue(payload, "error_message", "errorMessage")
	log.Printf("[PrinterResultConsumer] applying event=%s type=%s job=%s success=%t printer=%s", eventID, eventType, jobID, success, printerCode)
	return c.apply(ctx, eventID, eventType, jobID, printerCode, success, errorMessage, payload)
}

func (c *PrinterResultConsumer) apply(ctx context.Context, eventID, eventType, jobID, printerCode string, success bool, errorMessage string, payload map[string]interface{}) error {
	tx, err := c.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var printJobID, woID, opID, woCode, dispatchMode, siteID, productionLineID string
	var operationID, operationCode, workCenterID, workstationID string
	var sequenceNo int
	// Correlation IDs arrive as strings, while command_event_id and
	// print_job_id are UUID columns. Compare their text representations so the
	// result consumer can also accept job_code without relying on PostgreSQL to
	// infer a UUID parameter type for every OR branch.
	if err := tx.QueryRow(ctx, `
		SELECT p.print_job_id::text,p.wo_id::text,p.wo_operation_id::text,
		       h.wo_code,h.dispatch_mode,h.site_id::text,COALESCE(h.selected_production_line_id::text,''),
		       o.operation_id::text,o.operation_code,o.sequence_no,o.work_center_id::text,
		       COALESCE(o.workstation_id::text,'')
		FROM wo_print_job p
		JOIN wo_header h ON h.wo_id=p.wo_id
		JOIN wo_operation o ON o.wo_operation_id=p.wo_operation_id
		WHERE p.command_event_id::text=$1 OR p.print_job_id::text=$1 OR p.job_code=$1
		FOR UPDATE OF p,o,h
	`, jobID).Scan(&printJobID, &woID, &opID, &woCode, &dispatchMode, &siteID, &productionLineID,
		&operationID, &operationCode, &sequenceNo, &workCenterID, &workstationID); err != nil {
		log.Printf("[PrinterResultConsumer] print job lookup failed job=%s event=%s: %v", jobID, eventID, err)
		return nil
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	inserted, err := tx.Exec(ctx, `INSERT INTO wo_print_job_event (event_id, print_job_id, event_type, payload) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (event_id) DO NOTHING`, eventID, printJobID, eventType, payloadJSON)
	if err != nil {
		return err
	}
	if inserted.RowsAffected() == 0 {
		return tx.Commit(ctx)
	}
	now := time.Now().UTC()
	if success {
		if _, err := tx.Exec(ctx, `UPDATE wo_print_job SET status='Completed', selected_printer_code=NULLIF($1,''), completed_at=$2, last_error_code=NULL, last_error_message=NULL WHERE print_job_id=$3`, printerCode, now, printJobID); err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `UPDATE wo_print_job_attempt SET status='Completed', selected_printer_code=NULLIF($1,''), completed_at=$2 WHERE print_job_id=$3 AND status <> 'Completed'`, printerCode, now, printJobID)
		_, _ = tx.Exec(ctx, `UPDATE wo_operation SET status='Finished', print_status='Completed', row_version=row_version+1 WHERE wo_operation_id=$1 AND status <> 'Finished'`, opID)
		_, _ = tx.Exec(ctx, `UPDATE execution_session SET status='COMPLETED', ended_at=$1 WHERE wo_operation_id=$2 AND status='IN_PROGRESS'`, now, opID)
		env := sharedkernel.CreateEventEnvelope("MES.Execution.OperationFinished.v1", "mes-execution-service", printJobID, printOperationEventPayload(woID, opID, woCode, dispatchMode, siteID, productionLineID, operationID, operationCode, workCenterID, workstationID, printJobID, printerCode, sequenceNo, now, payload))
		if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.OperationFinished.v1", env); err != nil {
			return err
		}
	} else {
		_, _ = tx.Exec(ctx, `UPDATE wo_print_job SET status='Failed', failed_at=$1, last_error_code='PRINTER_ERROR', last_error_message=$2 WHERE print_job_id=$3`, now, errorMessage, printJobID)
		_, _ = tx.Exec(ctx, `UPDATE wo_print_job_attempt SET status='Failed', error_code='PRINTER_ERROR', error_message=$1, completed_at=$2 WHERE print_job_id=$3 AND status <> 'Completed'`, errorMessage, now, printJobID)
		_, _ = tx.Exec(ctx, `UPDATE wo_operation SET status='ExecutionError', print_status='Failed', row_version=row_version+1 WHERE wo_operation_id=$1 AND status <> 'Finished'`, opID)
		failurePayload := printOperationEventPayload(woID, opID, woCode, dispatchMode, siteID, productionLineID, operationID, operationCode, workCenterID, workstationID, printJobID, printerCode, sequenceNo, now, payload)
		failurePayload["reason_code"] = "PRINTER_ERROR"
		failurePayload["error_message"] = errorMessage
		env := sharedkernel.CreateEventEnvelope("MES.Execution.OperationFailed.v1", "mes-execution-service", printJobID, failurePayload)
		if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.OperationFailed.v1", env); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if success {
		_, _ = usecase.DispatchReadyOperations(ctx, c.pool, woID, "00000000-0000-0000-0000-000000000001", printJobID)
		_, _ = usecase.CheckAndCompleteWorkOrder(ctx, c.pool, woID, "00000000-0000-0000-0000-000000000001")
	}
	return nil
}

func printOperationEventPayload(woID, operationSnapshotID, woCode, dispatchMode, siteID, productionLineID, operationID, operationCode, workCenterID, workstationID, printJobID, printerCode string, sequenceNo int, occurredAt time.Time, payload map[string]interface{}) map[string]interface{} {
	return map[string]interface{}{
		"wo_id": woID, "wo_code": woCode, "wo_operation_id": operationSnapshotID,
		"operation_id": operationID, "operation_code": operationCode, "sequence_no": sequenceNo,
		"site_id": siteID, "selected_production_line_id": productionLineID,
		"work_center_id": workCenterID, "workstation_id": workstationID,
		"dispatch_mode": dispatchMode, "execution_target_type": "PRINT_STATION",
		"print_job_id": printJobID, "printer_code": printerCode,
		"printed_quantity": payload["printed_quantity"], "occurred_at": occurredAt.Format(time.RFC3339Nano),
		"automatic": true,
	}
}

func stringValue(m map[string]interface{}, names ...string) string {
	for _, name := range names {
		if value, ok := m[name].(string); ok {
			return value
		}
	}
	return ""
}
func boolValue(m map[string]interface{}, name string) bool { value, _ := m[name].(bool); return value }
