package http

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/application/usecase"
)

const (
	workflowStatusAccepted  = "accepted"
	workflowStatusRunning   = "running"
	workflowStatusSucceeded = "succeeded"
	workflowStatusFailed    = "failed"
)

type creationWorkflowRequest struct {
	Input       usecase.CreateWOInput
	Payload     map[string]interface{}
	UserID      string
	Idempotency string
	RequestHash string
}

type creationWorkflowManager struct {
	pool    *pgxpool.Pool
	mu      sync.RWMutex
	clients map[string]map[*creationWorkflowClient]struct{}
}

type creationWorkflowClient struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

var creationWorkflowUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		// Kong/authentication is the trust boundary. The service still verifies workflow ownership.
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		parsed, err := url.Parse(origin)
		host := r.Host
		if parsedHost, _, splitErr := net.SplitHostPort(r.Host); splitErr == nil {
			host = parsedHost
		}
		return err == nil && parsed.Hostname() == host
	},
}

func newCreationWorkflowManager(pool *pgxpool.Pool) *creationWorkflowManager {
	return &creationWorkflowManager{pool: pool, clients: make(map[string]map[*creationWorkflowClient]struct{})}
}

func (m *creationWorkflowManager) start(ctx context.Context, request creationWorkflowRequest) (string, string, error) {
	wid := uuid.New()
	cid := uuid.New()
	requestJSON, err := json.Marshal(request.Payload)
	if err != nil {
		return "", "", err
	}
	var existingID uuid.UUID
	var existingStatus, existingHash string
	err = m.pool.QueryRow(ctx, `
		INSERT INTO wo_creation_workflow
		(workflow_id, correlation_id, user_id, idempotency_key, request_hash, request_payload, status, current_step)
		VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'request_validation')
		ON CONFLICT (user_id, idempotency_key) DO NOTHING
		RETURNING workflow_id`, wid, cid, request.UserID, request.Idempotency, request.RequestHash, string(requestJSON), workflowStatusAccepted).Scan(&existingID)
	if err == nil {
		go m.run(request, wid, cid)
		return wid.String(), workflowStatusAccepted, nil
	}
	if err != pgx.ErrNoRows {
		return "", "", err
	}
	if err := m.pool.QueryRow(ctx, `SELECT workflow_id, status, request_hash FROM wo_creation_workflow WHERE user_id=$1 AND idempotency_key=$2`, request.UserID, request.Idempotency).Scan(&existingID, &existingStatus, &existingHash); err != nil {
		return "", "", err
	}
	if existingHash != request.RequestHash {
		return "", "", fmt.Errorf("IDEMPOTENCY_KEY_PAYLOAD_CONFLICT")
	}
	return existingID.String(), existingStatus, nil
}

func (m *creationWorkflowManager) run(request creationWorkflowRequest, workflowID, correlationID uuid.UUID) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := m.publish(ctx, workflowID, correlationID, "workflow.started", nil, workflowStatusRunning, "", nil); err != nil {
		log.Printf("[CreationWorkflow] workflow.started failed: %v", err)
		return
	}

	if err := validateCreationRequest(request.Input); err != nil {
		m.fail(ctx, workflowID, correlationID, "request_validation", "ERR-WO-REQUEST-001", err.Error(), true)
		return
	}
	_ = m.publish(ctx, workflowID, correlationID, "step.succeeded", stepPayload("request_validation", 1, "succeeded", "workOrders.creation.steps.request.success", nil, map[string]interface{}{"quantity": request.Input.Quantity}), workflowStatusRunning, "request_validation", nil)

	_ = m.publish(ctx, workflowID, correlationID, "step.started", stepPayload("master_data_readiness", 2, "running", "workOrders.creation.steps.readiness.running", nil, nil), workflowStatusRunning, "master_data_readiness", nil)
	readiness, err := usecase.CheckMasterDataReadiness(ctx, m.pool, request.Input.ItemRevisionID, request.Input.SiteID, request.Input.ProductionVersionID)
	if err != nil || !readiness.Ready {
		detail := readiness.MissingPrerequisites
		if err != nil {
			detail = append(detail, err.Error())
		}
		m.fail(ctx, workflowID, correlationID, "master_data_readiness", "ERR-WO-READINESS-001", fmt.Sprintf("%v", detail), true)
		return
	}
	if request.Input.UOMID != "" && readiness.UOMID != "" && request.Input.UOMID != readiness.UOMID {
		m.fail(ctx, workflowID, correlationID, "master_data_readiness", "ERR-WO-READINESS-001", "[WORK_ORDER_PRODUCTION_VERSION_CONTEXT_MISMATCH:uom_id]", false)
		return
	}
	// Production Version is authoritative. Replace all derived request fields
	// with the values resolved by the readiness query before creating the WO.
	request.Input.ProductionVersionID = readiness.ProductionVersionID
	request.Input.ItemRevisionID = readiness.ItemRevisionID
	request.Input.SiteID = readiness.SiteID
	request.Input.UOMID = readiness.UOMID
	_ = m.publish(ctx, workflowID, correlationID, "step.succeeded", stepPayload("master_data_readiness", 2, "succeeded", "workOrders.creation.steps.readiness.success", nil, map[string]interface{}{"productionVersionId": readiness.ProductionVersionID, "mbomId": readiness.MBOMHeaderID, "routingId": readiness.RoutingHeaderID}), workflowStatusRunning, "master_data_readiness", nil)

	_ = m.publish(ctx, workflowID, correlationID, "step.started", stepPayload("create_transaction", 3, "running", "workOrders.creation.steps.transaction.running", nil, nil), workflowStatusRunning, "create_transaction", nil)
	created, err := usecase.CreateWorkOrder(ctx, m.pool, request.Input)
	if err != nil {
		m.fail(ctx, workflowID, correlationID, "create_transaction", "ERR-WO-CREATE-001", err.Error(), true)
		return
	}
	workOrderID, _ := created["wo_id"].(string)
	workOrderCode, _ := created["wo_code"].(string)
	var operationCount, materialCount int
	_ = m.pool.QueryRow(ctx, `SELECT COUNT(*) FROM wo_operation WHERE wo_id=$1`, workOrderID).Scan(&operationCount)
	_ = m.pool.QueryRow(ctx, `SELECT COUNT(*) FROM wo_material_requirement WHERE wo_id=$1`, workOrderID).Scan(&materialCount)
	result := map[string]interface{}{"workOrderId": workOrderID, "workOrderCode": workOrderCode, "status": "Draft", "operationCount": operationCount, "materialCount": materialCount}
	_ = m.publish(ctx, workflowID, correlationID, "step.succeeded", stepPayload("create_transaction", 3, "succeeded", "workOrders.creation.steps.transaction.success", nil, result), workflowStatusRunning, "create_transaction", result)

	// CreateWorkOrder commits the outbox write before returning. This is the only event guarantee exposed here.
	_ = m.publish(ctx, workflowID, correlationID, "step.event_queued", stepPayload("outbox_queued", 4, "event_queued", "workOrders.creation.steps.outbox.success", nil, map[string]interface{}{"eventType": "MES.Execution.WOCreated.v1"}), workflowStatusRunning, "outbox_queued", result)
	_ = m.publish(ctx, workflowID, correlationID, "workflow.succeeded", map[string]interface{}{"workflow": map[string]interface{}{"status": workflowStatusSucceeded, "work_order_id": workOrderID, "work_order_code": workOrderCode}}, workflowStatusSucceeded, "outbox_queued", result)
}

func validateCreationRequest(input usecase.CreateWOInput) error {
	if input.ProductionVersionID == "" {
		return fmt.Errorf("production_version_id is required")
	}
	if input.ShiftID == "" {
		return fmt.Errorf("SHIFT_REQUIRED")
	}
	if input.Quantity <= 0 {
		return fmt.Errorf("quantity must be greater than zero")
	}
	start, err := time.Parse(time.RFC3339, input.PlannedStartAt)
	if err != nil {
		return fmt.Errorf("invalid planned start date")
	}
	end, err := time.Parse(time.RFC3339, input.PlannedEndAt)
	if err != nil {
		return fmt.Errorf("invalid planned end date")
	}
	if !end.After(start) {
		return fmt.Errorf("planned end must be after planned start")
	}
	return nil
}

func stepPayload(id string, order int, status, messageKey string, params, result map[string]interface{}) map[string]interface{} {
	return map[string]interface{}{"step": map[string]interface{}{"id": id, "order": order, "status": status, "title_key": "workOrders.creation.steps." + id + ".title", "message_key": messageKey, "message_params": params, "result": result}}
}

func (m *creationWorkflowManager) fail(ctx context.Context, workflowID, correlationID uuid.UUID, stepID, code, detail string, retryable bool) {
	errorData := map[string]interface{}{"code": code, "message_key": "workOrders.creation.errors." + code, "retryable": retryable, "technical_reference": workflowID.String()}
	errorData["detail"] = detail
	_ = m.publish(ctx, workflowID, correlationID, "step.failed", map[string]interface{}{"step": map[string]interface{}{"id": stepID, "status": "failed", "order": 1, "error": errorData}}, workflowStatusFailed, stepID, map[string]interface{}{"errorCode": code})
	failedOrder := 1
	for _, definition := range []struct {
		id    string
		order int
	}{{"request_validation", 1}, {"master_data_readiness", 2}, {"create_transaction", 3}, {"outbox_queued", 4}} {
		if definition.id == stepID {
			failedOrder = definition.order
			break
		}
	}
	for _, definition := range []struct {
		id    string
		order int
	}{{"request_validation", 1}, {"master_data_readiness", 2}, {"create_transaction", 3}, {"outbox_queued", 4}} {
		if definition.order > failedOrder {
			_ = m.publish(ctx, workflowID, correlationID, "step.skipped", stepPayload(definition.id, definition.order, "skipped", "workOrders.creation.steps.skipped", nil, nil), workflowStatusFailed, stepID, nil)
		}
	}
	_ = m.publish(ctx, workflowID, correlationID, "workflow.failed", map[string]interface{}{"workflow": map[string]interface{}{"status": workflowStatusFailed}}, workflowStatusFailed, stepID, nil)
}

func (m *creationWorkflowManager) publish(ctx context.Context, workflowID, correlationID uuid.UUID, eventType string, body map[string]interface{}, status, currentStep string, result map[string]interface{}) error {
	var sequence int64
	var eventID uuid.UUID
	err := func() error {
		tx, err := m.pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)
		if err := tx.QueryRow(ctx, `SELECT last_sequence + 1 FROM wo_creation_workflow WHERE workflow_id=$1 FOR UPDATE`, workflowID).Scan(&sequence); err != nil {
			return err
		}
		eventID = uuid.New()
		payload := map[string]interface{}{"event_id": eventID.String(), "event_type": eventType, "schema_version": 1, "workflow_id": workflowID.String(), "correlation_id": correlationID.String(), "sequence": sequence, "occurred_at": time.Now().UTC().Format(time.RFC3339Nano), "source_service": "mes-execution-service"}
		for key, value := range body {
			payload[key] = value
		}
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO wo_creation_workflow_event (event_id, workflow_id, event_type, sequence, payload) VALUES ($1,$2,$3,$4,$5::jsonb)`, eventID, workflowID, eventType, sequence, string(encoded)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE wo_creation_workflow SET status=$1::varchar,current_step=$2::varchar,last_sequence=$3::bigint,work_order_id=COALESCE($4::uuid,work_order_id),work_order_code=COALESCE($5::varchar,work_order_code),error_code=CASE WHEN $1::varchar='failed' THEN COALESCE($6::varchar,error_code) ELSE error_code END,updated_at=NOW() WHERE workflow_id=$7::uuid`, status, currentStep, sequence, resultValue(result, "workOrderId"), resultValue(result, "workOrderCode"), resultValue(result, "errorCode"), workflowID); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}()
	if err == nil {
		m.broadcast(workflowID.String(), payloadFromEvent(workflowID, eventID, eventType, sequence, body, correlationID))
	} else {
		log.Printf("[CreationWorkflow] publish %s failed for %s: %v", eventType, workflowID, err)
	}
	return err
}

func resultValue(result map[string]interface{}, key string) interface{} {
	if result == nil {
		return nil
	}
	return result[key]
}
func payloadFromEvent(workflowID, eventID uuid.UUID, eventType string, sequence int64, body map[string]interface{}, correlationID uuid.UUID) map[string]interface{} {
	p := map[string]interface{}{"event_id": eventID.String(), "event_type": eventType, "schema_version": 1, "workflow_id": workflowID.String(), "correlation_id": correlationID.String(), "sequence": sequence, "occurred_at": time.Now().UTC().Format(time.RFC3339Nano), "source_service": "mes-execution-service"}
	for k, v := range body {
		p[k] = v
	}
	return p
}

func (m *creationWorkflowManager) snapshot(ctx context.Context, workflowID, userID string) (map[string]interface{}, error) {
	var status, currentStep, code string
	var last int64
	var woID *string
	if err := m.pool.QueryRow(ctx, `SELECT status,current_step,last_sequence,work_order_id::text,COALESCE(work_order_code,'') FROM wo_creation_workflow WHERE workflow_id=$1 AND user_id=$2`, workflowID, userID).Scan(&status, &currentStep, &last, &woID, &code); err != nil {
		return nil, err
	}
	rows, err := m.pool.Query(ctx, `SELECT payload FROM wo_creation_workflow_event WHERE workflow_id=$1 ORDER BY sequence`, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]map[string]interface{}, 0)
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err == nil {
			var item map[string]interface{}
			if json.Unmarshal(raw, &item) == nil {
				events = append(events, item)
			}
		}
	}
	return map[string]interface{}{"workflow_id": workflowID, "status": status, "current_step": currentStep, "last_sequence": last, "work_order_id": woID, "work_order_code": code, "events": events}, nil
}

func (m *creationWorkflowManager) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	workflowID := chi.URLParam(r, "id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		userID = r.URL.Query().Get("user_id")
	}
	snapshot, err := m.snapshot(r.Context(), workflowID, userID)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"WORKFLOW_NOT_FOUND"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"WORKFLOW_READ_FAILED"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snapshot)
}

func (m *creationWorkflowManager) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	workflowID := r.URL.Query().Get("workflow_id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		userID = r.URL.Query().Get("user_id")
	}
	if workflowID == "" || userID == "" {
		http.Error(w, "workflow_id and authenticated user are required", http.StatusBadRequest)
		return
	}
	if _, err := m.snapshot(r.Context(), workflowID, userID); err != nil {
		http.Error(w, "workflow not found", http.StatusNotFound)
		return
	}
	conn, err := creationWorkflowUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := &creationWorkflowClient{conn: conn}
	m.addClient(workflowID, client)
	defer m.removeClient(workflowID, client)
	defer conn.Close()
	if snapshot, err := m.snapshot(r.Context(), workflowID, userID); err == nil {
		client.write(map[string]interface{}{
			"event_type":     "workflow.snapshot",
			"schema_version": 1,
			"workflow_id":    workflowID,
			"events":         snapshot["events"],
			"status":         snapshot["status"],
			"last_sequence":  snapshot["last_sequence"],
		})
	}
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (m *creationWorkflowManager) addClient(id string, client *creationWorkflowClient) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.clients[id] == nil {
		m.clients[id] = make(map[*creationWorkflowClient]struct{})
	}
	m.clients[id][client] = struct{}{}
}
func (m *creationWorkflowManager) removeClient(id string, client *creationWorkflowClient) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.clients[id], client)
	if len(m.clients[id]) == 0 {
		delete(m.clients, id)
	}
}
func (c *creationWorkflowClient) write(payload interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	_ = c.conn.WriteJSON(payload)
}
func (m *creationWorkflowManager) broadcast(id string, payload map[string]interface{}) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for client := range m.clients[id] {
		client.write(payload)
	}
}

func requestHash(payload map[string]interface{}) string {
	raw, _ := json.Marshal(payload)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func parseCreationWorkflowRequest(ctx context.Context, pool *pgxpool.Pool, r *http.Request, userID, idempotency string) (creationWorkflowRequest, error) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return creationWorkflowRequest{}, fmt.Errorf("INVALID_REQUEST_BODY")
	}
	itemCode, _ := body["item_code"].(string)
	itemRevisionID, _ := body["item_revision_id"].(string)
	productionVersionID, _ := body["production_version_id"].(string)
	siteID, _ := body["site_id"].(string)
	itemName, _ := body["item_name"].(string)
	if localized, ok := body["item_name"].(map[string]interface{}); ok {
		itemName, _ = localized["vi"].(string)
		if itemName == "" {
			itemName, _ = localized["en"].(string)
		}
	}
	quantity, _ := body["quantity"].(float64)
	if quantity <= 0 || productionVersionID == "" {
		return creationWorkflowRequest{}, fmt.Errorf("INVALID_REQUEST")
	}
	start := time.Now().UTC().Truncate(time.Second)
	if raw, ok := body["planned_start_at"].(string); ok && raw != "" {
		if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
			start = parsed
		}
	}
	end := start.Add(24 * time.Hour)
	if raw, ok := body["planned_end_at"].(string); ok && raw != "" {
		if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
			end = parsed
		}
	} else if raw, ok := body["target_date"].(string); ok && raw != "" {
		if parsed, err := time.Parse("2006-01-02", raw); err == nil {
			end = parsed.Add(24 * time.Hour)
		}
	}
	uomID, _ := body["uom_id"].(string)
	shiftID, _ := body["shift_id"].(string)
	if shiftID == "" {
		return creationWorkflowRequest{}, fmt.Errorf("SHIFT_REQUIRED")
	}
	payload := map[string]interface{}{"item_code": itemCode, "item_revision_id": itemRevisionID, "item_name": itemName, "quantity": quantity, "uom_id": uomID, "site_id": siteID, "shift_id": shiftID, "planned_start_at": start.Format(time.RFC3339), "planned_end_at": end.Format(time.RFC3339)}
	payload["production_version_id"] = productionVersionID
	return creationWorkflowRequest{Input: usecase.CreateWOInput{ProductionVersionID: productionVersionID, ItemRevisionID: itemRevisionID, ItemCode: itemCode, ItemName: itemName, Quantity: quantity, UOMID: uomID, SiteID: siteID, ShiftID: shiftID, PlannedStartAt: start.Format(time.RFC3339), PlannedEndAt: end.Format(time.RFC3339), UserID: userID, TraceID: getHeader(r, "X-Trace-ID", uuid.NewString())}, Payload: payload, UserID: userID, Idempotency: idempotency, RequestHash: requestHash(payload)}, nil
}

func (m *creationWorkflowManager) handleStart(w http.ResponseWriter, r *http.Request) {
	userID := getHeader(r, "X-User-ID", systemUserID)
	idempotency := r.Header.Get("Idempotency-Key")
	if idempotency == "" {
		http.Error(w, `{"error":"IDEMPOTENCY_KEY_REQUIRED"}`, http.StatusBadRequest)
		return
	}
	request, err := parseCreationWorkflowRequest(r.Context(), m.pool, r, userID, idempotency)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusUnprocessableEntity)
		return
	}
	wid, status, err := m.start(r.Context(), request)
	if err != nil {
		if err.Error() == "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT" {
			http.Error(w, `{"error":"IDEMPOTENCY_KEY_PAYLOAD_CONFLICT"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"WORKFLOW_START_FAILED"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{"workflow_id": wid, "correlation_id": wid, "status": status, "stream": map[string]string{"channel": "work-order-creation", "workflow_id": wid}})
}

func (m *creationWorkflowManager) handleCodePreview(w http.ResponseWriter, r *http.Request) {
	numberDate := time.Now().UTC().Format("20060102")
	var next int64
	if err := m.pool.QueryRow(r.Context(), `SELECT COALESCE((SELECT current_value FROM wo_numbering_daily WHERE number_date = CURRENT_DATE), 0) + 1`).Scan(&next); err != nil {
		http.Error(w, `{"error":"ERR-WO-CODE-PREVIEW"}`, http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"preview_code": fmt.Sprintf("%s-%s-%04d", usecase.WorkOrderCodePrefix, numberDate, next), "is_reserved": false, "prefix": usecase.WorkOrderCodePrefix})
}
