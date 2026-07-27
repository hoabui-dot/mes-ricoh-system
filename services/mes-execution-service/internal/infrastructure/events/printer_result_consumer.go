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
	if !strings.Contains(strings.ToLower(eventType), "printer.printed") && !strings.Contains(strings.ToLower(eventType), "printer.error") {
		return nil
	}
	eventID := stringValue(payload, "event_id", "eventId", "EventId")
	if eventID == "" {
		eventID = stringValue(root, "EventId", "eventId", "event_id")
	}
	jobID := stringValue(payload, "job_id", "jobId", "JobId")
	if eventID == "" || jobID == "" {
		log.Printf("[PrinterResultConsumer] ignored printer result with missing correlation event_id=%q job_id=%q event_type=%q", eventID, jobID, eventType)
		return nil
	}
	success := strings.Contains(strings.ToLower(eventType), "printer.printed") && boolValue(payload, "success")
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
	var printJobID, woID, opID string
	if err := tx.QueryRow(ctx, `SELECT print_job_id, wo_id, wo_operation_id FROM wo_print_job WHERE print_job_id=$1::uuid OR job_code=$1::text FOR UPDATE`, jobID).Scan(&printJobID, &woID, &opID); err != nil {
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
		_, _ = tx.Exec(ctx, `UPDATE wo_operation SET status='Finished', row_version=row_version+1 WHERE wo_operation_id=$1 AND status <> 'Finished'`, opID)
		_, _ = tx.Exec(ctx, `UPDATE execution_session SET status='COMPLETED', ended_at=$1 WHERE wo_operation_id=$2 AND status='IN_PROGRESS'`, now, opID)
		env := sharedkernel.CreateEventEnvelope("MES.Execution.OperationFinished.v1", "mes-execution-service", printJobID, map[string]interface{}{"wo_id": woID, "wo_operation_id": opID, "print_job_id": printJobID, "printer_code": printerCode, "printed_quantity": payload["printed_quantity"], "finished_at": now.Format(time.RFC3339Nano), "automatic": true})
		if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.OperationFinished.v1", env); err != nil {
			return err
		}
	} else {
		_, _ = tx.Exec(ctx, `UPDATE wo_print_job SET status='Failed', failed_at=$1, last_error_code='PRINTER_ERROR', last_error_message=$2 WHERE print_job_id=$3`, now, errorMessage, printJobID)
		_, _ = tx.Exec(ctx, `UPDATE wo_print_job_attempt SET status='Failed', error_code='PRINTER_ERROR', error_message=$1, completed_at=$2 WHERE print_job_id=$3 AND status <> 'Completed'`, errorMessage, now, printJobID)
		_, _ = tx.Exec(ctx, `UPDATE wo_operation SET status='ExecutionError', row_version=row_version+1 WHERE wo_operation_id=$1 AND status <> 'Finished'`, opID)
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

func stringValue(m map[string]interface{}, names ...string) string {
	for _, name := range names {
		if value, ok := m[name].(string); ok {
			return value
		}
	}
	return ""
}
func boolValue(m map[string]interface{}, name string) bool { value, _ := m[name].(bool); return value }
