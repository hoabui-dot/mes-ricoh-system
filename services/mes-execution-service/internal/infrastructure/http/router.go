package http

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/application/usecase"
	"github.com/mom-platform/mes-execution-service/internal/domain"
	serviceauth "github.com/mom-platform/mes-execution-service/internal/infrastructure/auth"
	"github.com/mom-platform/mes-execution-service/internal/infrastructure/client"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

const systemUserID = "00000000-0000-0000-0000-000000000001"

func NewRouter(pool *pgxpool.Pool, traceabilityClient *client.TraceabilityClient, resourcePlanningClient *client.ResourcePlanningClient, failureReasonClient *client.FailureReasonClient) http.Handler {
	r := chi.NewRouter()
	keycloakURL := envOrDefault("KEYCLOAK_URL", "http://platform-keycloak:8080")
	issuerValue := envOrDefault("KEYCLOAK_ISSUERS", keycloakURL+"/realms/wonsealtech")
	kioskVerifier := serviceauth.NewVerifier(keycloakURL, "wonsealtech", "mes-client", strings.Split(issuerValue, ","))
	creationWorkflows := newCreationWorkflowManager(pool)
	allocationService := usecase.NewAllocationService(pool, resourcePlanningClient)

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Authorization, X-User-ID, X-Role-Code, X-Site-ID, X-Trace-ID, Idempotency-Key, X-MES-Approval-Policy")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "mes-execution-service"})
	})

	r.Get("/metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte("# HELP mes_execution_service_up Service health\n# TYPE mes_execution_service_up gauge\nmes_execution_service_up 1\n"))
	})

	r.Route("/api/mes/execution", func(r chi.Router) {
		r.Post("/work-order-creation-workflows", creationWorkflows.handleStart)
		r.Get("/work-order-code-preview", creationWorkflows.handleCodePreview)
		r.Get("/work-order-creation-workflows/{id}", creationWorkflows.handleSnapshot)
		r.Get("/ws/work-order-creation", creationWorkflows.handleWebSocket)
		r.Post("/work-orders", handleCreateWorkOrder(pool))
		r.Post("/work-orders/{id}/compute-check", handleComputeCheck(pool))
		r.Get("/work-orders/{id}/line-readiness", handleLineReadiness(pool))
		r.Post("/work-orders/{id}/line-replan", handleLineReplan(pool))
		r.Post("/work-orders/{id}/approve", handleApproveWO(pool, allocationService))
		r.Post("/work-orders/{id}/start-execution", handleStartExecution(pool))
		r.Post("/work-orders/{id}/operations/{opId}/print-retry", handlePrintRetry(pool))
		r.Post("/work-orders/{id}/stage-materials", handleStageMaterials(pool))
		r.Post("/work-orders/{id}/reject", handleRejectWO(pool))
		r.Get("/work-orders/{id}", handleGetWOByID(pool))
		r.Get("/work-orders/{id}/operations/{opId}/resource-candidates", handleResourceCandidates(allocationService))
		r.Get("/work-orders/{id}/resource-allocation-proposals", handleResourceAllocationProposals(allocationService))
		r.Post("/work-orders/{id}/operations/{opId}/resource-allocation", handleCreateResourceAllocation(allocationService))
		r.Post("/work-orders/{id}/operations/{opId}/reallocate", handleReallocateResource(allocationService))
		r.Delete("/work-orders/{id}/operations/{opId}/resource-allocation", handleDeleteResourceAllocation(pool))
		r.Post("/work-orders/{id}/resource-allocations/revalidate", handleRevalidateResourceAllocations(allocationService))
		r.Get("/work-orders", handleListWorkOrders(pool))
		r.Group(func(kiosk chi.Router) {
			kiosk.Use(requireKioskOperator(kioskVerifier))
			kiosk.Get("/kiosk/terminals/{terminalRef}/work-orders", handleListKioskWorkOrders(pool))
			kiosk.Get("/kiosk/terminals/{terminalRef}/work-orders/{id}", handleGetKioskWorkOrder(pool))
			kiosk.Post("/kiosk/work-orders/{id}/operations/{opId}/start", handleStartOperation(pool))
			kiosk.Post("/kiosk/work-orders/{id}/operations/{opId}/confirm", handleConfirmOperation(pool, traceabilityClient))
			kiosk.Post("/kiosk/work-orders/{id}/operations/{opId}/fail", handleFailOperation(pool, failureReasonClient))
			kiosk.Post("/kiosk/work-orders/{id}/operations/{opId}/abort", handleAbortSession(pool))
			kiosk.Post("/kiosk/work-orders/{id}/operations/{opId}/retry", handleRetryOperation(pool))
		})

		// Stage B Execution Endpoints
		r.Post("/work-orders/{id}/operations/{opId}/start", handleStartOperation(pool))
		r.Post("/work-orders/{id}/operations/{opId}/confirm", handleConfirmOperation(pool, traceabilityClient))
		r.Post("/work-orders/{id}/operations/{opId}/fail", handleFailOperation(pool, failureReasonClient))
		r.Post("/work-orders/{id}/operations/{opId}/abort", handleAbortSession(pool))
		r.Post("/work-orders/{id}/operations/{opId}/retry", handleRetryOperation(pool))
		r.Get("/work-orders/{id}/operations/{opId}/consumption", handleGetConsumption(pool))
	})

	return r
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func requireKioskOperator(verifier *serviceauth.Verifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			parts := strings.Fields(r.Header.Get("Authorization"))
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				writeKioskAuthError(w, http.StatusUnauthorized, "KIOSK_BEARER_TOKEN_REQUIRED")
				return
			}
			claims, err := verifier.VerifyOperator(parts[1])
			if err != nil {
				status := http.StatusUnauthorized
				if strings.Contains(err.Error(), "role is required") {
					status = http.StatusForbidden
				}
				writeKioskAuthError(w, status, "KIOSK_TOKEN_INVALID")
				return
			}
			userID, _ := claims["sub"].(string)
			r.Header.Set("X-User-ID", userID)
			r.Header.Set("X-Role-Code", "OPERATOR")
			next.ServeHTTP(w, r)
		})
	}
}

func writeKioskAuthError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}

func handleListKioskWorkOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
		result, err := usecase.ListKioskWorkOrders(r.Context(), pool, chi.URLParam(r, "terminalRef"), page, pageSize)
		if err != nil {
			writeKioskReadError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	}
}

func handleGetKioskWorkOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		result, err := usecase.GetKioskWorkOrderDetail(r.Context(), pool, chi.URLParam(r, "terminalRef"), chi.URLParam(r, "id"))
		if err != nil {
			writeKioskReadError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	}
}

func writeKioskReadError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	code := "KIOSK_READ_MODEL_FAILED"
	switch {
	case strings.Contains(err.Error(), "KIOSK_TERMINAL_SCOPE_FORBIDDEN"):
		status, code = http.StatusForbidden, "KIOSK_TERMINAL_SCOPE_FORBIDDEN"
	case strings.Contains(err.Error(), "KIOSK_WORK_ORDER_NOT_FOUND"):
		status, code = http.StatusNotFound, "KIOSK_WORK_ORDER_NOT_FOUND"
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}

func handleStageMaterials(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		woID := chi.URLParam(r, "id")
		userID := getHeader(r, "X-User-ID", systemUserID)
		traceID := getHeader(r, "X-Trace-ID", "missing-trace")
		results, err := usecase.StageMaterialsForWorkOrder(r.Context(), pool, usecase.StageMaterialsInput{
			WOID:    woID,
			UserID:  userID,
			TraceID: traceID,
		})
		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			statusCode := http.StatusInternalServerError
			errorCode := "WMS_STAGING_REQUEST_FAILED"
			if strings.Contains(err.Error(), "WMS_INVALID_WORK_ORDER_STATE") {
				statusCode = http.StatusConflict
				errorCode = "WMS_INVALID_WORK_ORDER_STATE"
			}
			w.WriteHeader(statusCode)
			json.NewEncoder(w).Encode(map[string]string{"error": errorCode, "message": err.Error()})
			return
		}
		status := http.StatusAccepted
		for _, result := range results {
			if result.Error != "" {
				status = http.StatusInternalServerError
				break
			}
		}
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]interface{}{"wo_id": woID, "results": results})
	}
}

func handleResourceCandidates(service *usecase.AllocationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		result, err := service.Candidates(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "opId"), r.URL.Query().Get("planned_start_at"), r.URL.Query().Get("shift_id"), getHeader(r, "X-User-ID", systemUserID), getHeader(r, "X-Trace-ID", "missing-trace"))
		writeAllocationResponse(w, result, err)
	}
}

func handleResourceAllocationProposals(service *usecase.AllocationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		result, err := service.Proposals(r.Context(), chi.URLParam(r, "id"), getHeader(r, "X-User-ID", systemUserID), getHeader(r, "X-Trace-ID", "missing-trace"))
		writeAllocationResponse(w, result, err)
	}
}

func decodeAllocationInput(r *http.Request) (usecase.AllocationInput, error) {
	var input usecase.AllocationInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		return input, fmt.Errorf("invalid allocation request")
	}
	return input, nil
}

func handleCreateResourceAllocation(service *usecase.AllocationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !canMutateResourcePlanning(r) {
			writeAllocationForbidden(w)
			return
		}
		input, err := decodeAllocationInput(r)
		if err != nil {
			writeAllocationResponse(w, nil, err)
			return
		}
		result, err := service.Allocate(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "opId"), input, getHeader(r, "X-User-ID", systemUserID), getHeader(r, "X-Trace-ID", "missing-trace"), r.Header.Get("Idempotency-Key"), false)
		writeAllocationResponse(w, result, err)
	}
}

func handleReallocateResource(service *usecase.AllocationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !canMutateResourcePlanning(r) {
			writeAllocationForbidden(w)
			return
		}
		input, err := decodeAllocationInput(r)
		if err != nil {
			writeAllocationResponse(w, nil, err)
			return
		}
		result, err := service.Allocate(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "opId"), input, getHeader(r, "X-User-ID", systemUserID), getHeader(r, "X-Trace-ID", "missing-trace"), r.Header.Get("Idempotency-Key"), true)
		writeAllocationResponse(w, result, err)
	}
}

func handleDeleteResourceAllocation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !canMutateResourcePlanning(r) {
			writeAllocationForbidden(w)
			return
		}
		woID, opID := chi.URLParam(r, "id"), chi.URLParam(r, "opId")
		var status string
		err := pool.QueryRow(r.Context(), `SELECT h.status::text FROM wo_header h WHERE h.wo_id=$1`, woID).Scan(&status)
		if err != nil {
			writeAllocationResponse(w, nil, fmt.Errorf("work order not found"))
			return
		}
		if status != "Draft" && status != "PendingApproval" {
			writeAllocationResponse(w, nil, fmt.Errorf("ALLOCATION_LIFECYCLE_LOCKED"))
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			writeAllocationResponse(w, nil, err)
			return
		}
		defer tx.Rollback(r.Context())
		userID := getHeader(r, "X-User-ID", systemUserID)
		traceID := getHeader(r, "X-Trace-ID", "missing-trace")
		_, _ = tx.Exec(r.Context(), `
			INSERT INTO wo_resource_allocation_audit
				(allocation_id, wo_id, wo_operation_id, action, previous_allocation_id, new_allocation_id, actor_user_id, change_reason, validation_status, warning_codes, trace_id, wo_row_version)
			SELECT allocation_id, wo_id, wo_operation_id, 'Cancelled', allocation_id, NULL, $3, 'Allocation cancelled before lifecycle lock.', validation_status, warning_codes, $4, row_version
			FROM wo_resource_allocation
			WHERE wo_id=$1 AND wo_operation_id=$2 AND status IN ('Draft','Validated','Committed')`, woID, opID, userID, traceID)
		_, _ = tx.Exec(r.Context(), `UPDATE wo_resource_allocation SET status='Cancelled', validation_status='Invalid', row_version=row_version+1 WHERE wo_id=$1 AND wo_operation_id=$2 AND status IN ('Draft','Validated','Committed')`, woID, opID)
		_, _ = tx.Exec(r.Context(), `UPDATE wo_capacity_reservation SET status='Cancelled',updated_at=now() WHERE wo_id=$1 AND wo_operation_id=$2 AND status IN ('Tentative','Committed')`, woID, opID)
		if err := tx.Commit(r.Context()); err != nil {
			writeAllocationResponse(w, nil, err)
			return
		}
		writeAllocationResponse(w, map[string]interface{}{"wo_id": woID, "wo_operation_id": opID, "status": "Cancelled"}, nil)
	}
}

func canMutateResourcePlanning(r *http.Request) bool {
	role := strings.ToUpper(strings.TrimSpace(getHeader(r, "X-Role-Code", "OPERATOR")))
	switch role {
	case "PLANT_MANAGER", "PROD_MANAGER", "PLANNER", "EXECUTIVE":
		return true
	default:
		return false
	}
}

func writeAllocationForbidden(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "RESOURCE_ALLOCATION_FORBIDDEN", "message": "RESOURCE_ALLOCATION_FORBIDDEN"})
}

func handleRevalidateResourceAllocations(service *usecase.AllocationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		result, err := service.Revalidate(r.Context(), chi.URLParam(r, "id"), getHeader(r, "X-User-ID", systemUserID), getHeader(r, "X-Trace-ID", "missing-trace"))
		writeAllocationResponse(w, result, err)
	}
}

func writeAllocationResponse(w http.ResponseWriter, result map[string]interface{}, err error) {
	w.Header().Set("Content-Type", "application/json")
	if err == nil {
		json.NewEncoder(w).Encode(result)
		return
	}
	status := http.StatusConflict
	code := err.Error()
	if strings.Contains(code, "SQLSTATE 40001") || strings.Contains(strings.ToLower(code), "could not serialize access") {
		code = "RESOURCE_CAPACITY_CONFLICT"
	}
	if strings.Contains(code, "not found") {
		status = http.StatusNotFound
	}
	if strings.Contains(code, "DEPENDENCY") || strings.Contains(code, "circuit") {
		status = http.StatusServiceUnavailable
	}
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": code, "message": code})
}

func getHeader(r *http.Request, key, fallback string) string {
	val := r.Header.Get(key)
	if val == "" {
		return fallback
	}
	return val
}

func handleStartOperation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		woID := chi.URLParam(r, "id")
		opID := chi.URLParam(r, "opId")
		userID := getHeader(r, "X-User-ID", systemUserID)

		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		terminalRef, _ := body["terminal_ref"].(string)
		if terminalRef == "" {
			terminalRef = "KIOSK-LINE-01"
		}

		session, err := usecase.StartOperation(r.Context(), pool, usecase.StartOperationInput{
			WOID:           woID,
			WOOperationID:  opID,
			TerminalRef:    terminalRef,
			OperatorUserID: userID,
		})
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(session)
	}
}

func handleConfirmOperation(pool *pgxpool.Pool, traceabilityClient *client.TraceabilityClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		woID := chi.URLParam(r, "id")
		opID := chi.URLParam(r, "opId")
		userID := getHeader(r, "X-User-ID", systemUserID)
		roleCode := getHeader(r, "X-Role-Code", "OPERATOR")

		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		sessionID, _ := body["session_id"].(string)
		qtyGood, _ := body["qty_good"].(float64)
		qtyScrap, _ := body["qty_scrap"].(float64)

		var reasonCode *string
		if rc, ok := body["reason_code"].(string); ok && rc != "" {
			reasonCode = &rc
		}

		var scannedLabelID *string
		if lbl, ok := body["scanned_label_id"].(string); ok && lbl != "" {
			scannedLabelID = &lbl
		}

		var scannedMatCode *string
		if mat, ok := body["scanned_material_code"].(string); ok && mat != "" {
			scannedMatCode = &mat
		}

		idempAttempt, _ := body["idempotency_attempt"].(string)
		if idempAttempt == "" {
			idempAttempt = "1"
		}

		var pieces []client.PieceInput
		if pList, ok := body["pieces"].([]interface{}); ok {
			for _, item := range pList {
				if pm, ok := item.(map[string]interface{}); ok {
					q, _ := pm["quantity"].(float64)
					u, _ := pm["uom_id"].(string)
					pieces = append(pieces, client.PieceInput{Quantity: q, UOMID: u})
				}
			}
		}

		confirmation, err := usecase.ConfirmOperation(r.Context(), pool, traceabilityClient, usecase.ConfirmOperationInput{
			WOID:                woID,
			WOOperationID:       opID,
			SessionID:           sessionID,
			QtyGood:             qtyGood,
			QtyScrap:            qtyScrap,
			ReasonCode:          reasonCode,
			ScannedLabelID:      scannedLabelID,
			ScannedMaterialCode: scannedMatCode,
			Pieces:              pieces,
			OperatorUserID:      userID,
			RoleCode:            roleCode,
			IdempotencyAttempt:  idempAttempt,
		})
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			if sharedkernel.IsRetryableDependencyError(err) {
				w.WriteHeader(http.StatusServiceUnavailable)
				json.NewEncoder(w).Encode(map[string]string{"error": "DEPENDENCY_UNAVAILABLE", "message": err.Error()})
				return
			}
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		_, _ = usecase.DispatchReadyOperations(r.Context(), pool, woID, userID, getHeader(r, "X-Trace-ID", "missing-trace"))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(confirmation)
	}
}

func handleStartExecution(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		result, err := usecase.StartExecution(r.Context(), pool, usecase.StartExecutionInput{WOID: chi.URLParam(r, "id"), UserID: getHeader(r, "X-User-ID", systemUserID), TraceID: getHeader(r, "X-Trace-ID", "missing-trace")})
		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error(), "message": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(result)
	}
}

func handlePrintRetry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		woID, opID := chi.URLParam(r, "id"), chi.URLParam(r, "opId")
		userID := getHeader(r, "X-User-ID", systemUserID)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer tx.Rollback(r.Context())
		var jobID string
		if err := tx.QueryRow(r.Context(), `SELECT print_job_id FROM wo_print_job WHERE wo_id=$1 AND wo_operation_id=$2 AND status='Failed' FOR UPDATE`, woID, opID).Scan(&jobID); err != nil {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "PRINT_JOB_RETRY_NOT_ALLOWED"})
			return
		}
		if _, err := tx.Exec(r.Context(), `UPDATE wo_print_job SET status='RetryPending', last_error_code=NULL, last_error_message=NULL WHERE print_job_id=$1`, jobID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if _, err := tx.Exec(r.Context(), `UPDATE wo_operation SET status='Ready', updated_at=NOW(), row_version=row_version+1 WHERE wo_operation_id=$1 AND status='ExecutionError'`, opID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		queued, err := usecase.DispatchReadyOperations(r.Context(), pool, woID, userID, getHeader(r, "X-Trace-ID", jobID))
		if err != nil {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"print_job_id": jobID, "queued_operations": queued})
	}
}

func handleAbortSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getHeader(r, "X-User-ID", systemUserID)
		var body struct {
			SessionID   string `json:"session_id"`
			TerminalRef string `json:"terminal_ref"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeOperationCommandError(w, fmt.Errorf("INVALID_REQUEST_BODY"))
			return
		}
		idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
		if idempotencyKey == "" && body.SessionID != "" {
			// Preserve retry safety for existing kiosk clients while they adopt the header.
			idempotencyKey = "abort:" + body.SessionID
		}
		result, err := usecase.AbortOperation(r.Context(), pool, usecase.AbortOperationInput{
			WOID:           chi.URLParam(r, "id"),
			WOOperationID:  chi.URLParam(r, "opId"),
			SessionID:      body.SessionID,
			OperatorUserID: userID,
			RoleCode:       getHeader(r, "X-Role-Code", "OPERATOR"),
			TerminalRef:    body.TerminalRef,
			IdempotencyKey: idempotencyKey,
			TraceID:        getHeader(r, "X-Trace-ID", idempotencyKey),
		})
		if err != nil {
			writeOperationCommandError(w, err)
			return
		}
		writeOperationCommandResponse(w, result)
	}
}

func handleFailOperation(pool *pgxpool.Pool, failureReasonClient *client.FailureReasonClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			SessionID   string `json:"session_id"`
			ReasonCode  string `json:"reason_code"`
			ReasonText  string `json:"reason_text"`
			TerminalRef string `json:"terminal_ref"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeOperationCommandError(w, fmt.Errorf("INVALID_REQUEST_BODY"))
			return
		}
		if failureReasonClient == nil {
			writeOperationCommandError(w, fmt.Errorf("FAILURE_REASON_DEPENDENCY_UNAVAILABLE"))
			return
		}
		reason, err := failureReasonClient.Validate(r.Context(), body.ReasonCode)
		if err != nil {
			writeOperationCommandError(w, err)
			return
		}
		idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
		result, err := usecase.FailOperation(r.Context(), pool, usecase.FailOperationInput{
			WOID:                  chi.URLParam(r, "id"),
			WOOperationID:         chi.URLParam(r, "opId"),
			SessionID:             body.SessionID,
			ReasonCode:            reason.Code,
			ReasonNameI18n:        reason.Name,
			ReasonText:            body.ReasonText,
			ReasonRequiresComment: reason.RequiresComment,
			OperatorUserID:        getHeader(r, "X-User-ID", systemUserID),
			RoleCode:              getHeader(r, "X-Role-Code", "OPERATOR"),
			TerminalRef:           body.TerminalRef,
			IdempotencyKey:        idempotencyKey,
			TraceID:               getHeader(r, "X-Trace-ID", idempotencyKey),
		})
		if err != nil {
			writeOperationCommandError(w, err)
			return
		}
		writeOperationCommandResponse(w, result)
	}
}

func handleRetryOperation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			TerminalRef string `json:"terminal_ref"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeOperationCommandError(w, fmt.Errorf("INVALID_REQUEST_BODY"))
			return
		}
		idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
		result, err := usecase.RetryOperation(r.Context(), pool, usecase.RetryOperationInput{
			WOID:           chi.URLParam(r, "id"),
			WOOperationID:  chi.URLParam(r, "opId"),
			OperatorUserID: getHeader(r, "X-User-ID", systemUserID),
			RoleCode:       getHeader(r, "X-Role-Code", "OPERATOR"),
			TerminalRef:    body.TerminalRef,
			SiteID:         strings.TrimSpace(r.Header.Get("X-Site-ID")),
			IdempotencyKey: idempotencyKey,
			TraceID:        getHeader(r, "X-Trace-ID", idempotencyKey),
		})
		if err != nil {
			writeOperationCommandError(w, err)
			return
		}
		writeOperationCommandResponse(w, result)
	}
}

func writeOperationCommandResponse(w http.ResponseWriter, result *domain.OperationExecutionTransition) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(result)
}

func writeOperationCommandError(w http.ResponseWriter, err error) {
	message := err.Error()
	status := http.StatusConflict
	switch {
	case sharedkernel.IsRetryableDependencyError(err), strings.Contains(message, "DEPENDENCY_UNAVAILABLE"), strings.Contains(message, "CATALOG_INVALID_RESPONSE"):
		status = http.StatusServiceUnavailable
	case strings.Contains(message, "NOT_FOUND"):
		status = http.StatusNotFound
	case strings.Contains(message, "FORBIDDEN"), strings.Contains(message, "MISMATCH"), strings.Contains(message, "SITE_SCOPE_REQUIRED"):
		status = http.StatusForbidden
	case strings.Contains(message, "REASON_"), strings.Contains(message, "NOT_APPROVED"):
		status = http.StatusUnprocessableEntity
	case strings.Contains(message, "REQUIRED"), strings.Contains(message, "INVALID_REQUEST_BODY"), strings.Contains(message, "USER_ID_INVALID"):
		status = http.StatusBadRequest
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message, "message": message})
}

func handleGetConsumption(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		woID := chi.URLParam(r, "id")
		opID := chi.URLParam(r, "opId")

		rows, err := pool.Query(r.Context(), `
			SELECT consumption_id, component_revision_id, qty_consumed, uom, source, label_id, consumed_at
			FROM material_consumption
			WHERE wo_id = $1 AND wo_operation_id = $2
			ORDER BY consumed_at ASC
		`, woID, opID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		list := make([]map[string]interface{}, 0)
		for rows.Next() {
			var cID, compRevID, uom, source string
			var labelID *string
			var qty float64
			var consumedAt time.Time
			_ = rows.Scan(&cID, &compRevID, &qty, &uom, &source, &labelID, &consumedAt)
			list = append(list, map[string]interface{}{
				"consumption_id":        cID,
				"component_revision_id": compRevID,
				"qty_consumed":          qty,
				"uom":                   uom,
				"source":                source,
				"label_id":              labelID,
				"consumed_at":           consumedAt,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"data": list})
	}
}

func handleCreateWorkOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getHeader(r, "X-User-ID", systemUserID)
		traceID := getHeader(r, "X-Trace-ID", "missing-trace")

		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			body = make(map[string]interface{})
		}
		productionVersionID, _ := body["production_version_id"].(string)
		if productionVersionID == "" {
			productionVersionID, _ = body["productionVersionId"].(string)
		}

		itemRevID, _ := body["item_revision_id"].(string)
		if itemRevID == "" {
			itemRevID, _ = body["itemRevisionId"].(string)
		}
		itemCode, _ := body["item_code"].(string)
		if itemCode == "" {
			itemCode = "FG-WS-CM01"
		}
		itemName, _ := body["item_name"].(string)
		if itemName == "" {
			itemName = "Cao su chân máy ô tô"
		}
		quantity, _ := body["quantity"].(float64)
		if quantity <= 0 {
			quantity = 100
		}
		uomID, _ := body["uom_id"].(string)
		if uomID == "" {
			uomID = "1a2c0adc-cd7e-4cc9-a2ae-4b9053683b29"
		}
		siteID, _ := body["site_id"].(string)
		if siteID == "" {
			siteID = "9f785cbd-98aa-4b2c-98ef-287a189e760c"
		}
		shiftID, _ := body["shift_id"].(string)
		if shiftID == "" {
			shiftID, _ = body["shiftId"].(string)
		}
		dispatchMode, _ := body["dispatch_mode"].(string)
		if dispatchMode == "" {
			dispatchMode, _ = body["dispatchMode"].(string)
		}
		// Production Version is authoritative. Resolve the legacy readiness
		// inputs from it so direct API callers cannot accidentally fall back to
		// an unrelated Item Revision/Site pair.
		if productionVersionID != "" {
			var resolvedItemRevisionID, resolvedSiteID string
			if err := pool.QueryRow(r.Context(), `
				SELECT item_revision_id, site_id
				FROM rm_production_version
				WHERE master_id = $1 AND lifecycle_status = 'Released'
			`, productionVersionID).Scan(&resolvedItemRevisionID, &resolvedSiteID); err != nil {
				http.Error(w, "PRODUCTION_VERSION_NOT_FOUND", http.StatusUnprocessableEntity)
				return
			}
			itemRevID, siteID = resolvedItemRevisionID, resolvedSiteID
		}
		pStart, _ := body["planned_start_at"].(string)
		if pStart == "" {
			pStart = time.Now().UTC().Format(time.RFC3339)
		}
		pEnd, _ := body["planned_end_at"].(string)
		if pEnd == "" {
			pEnd = time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339)
		}

		// 1. Determine demand intent
		pEndTime, _ := time.Parse(time.RFC3339, pEnd)
		if _, err := usecase.DetermineDemand(domain.DemandIntent{
			ItemRevisionID:       itemRevID,
			Quantity:             quantity,
			SiteID:               siteID,
			TargetCompletionDate: pEndTime,
		}); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// 2. Readiness check
		readiness, err := usecase.CheckMasterDataReadiness(r.Context(), pool, itemRevID, siteID, productionVersionID)
		if err != nil || !readiness.Ready {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnprocessableEntity)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":                 "Master Data Prerequisite Check Failed",
				"missing_prerequisites": readiness.MissingPrerequisites,
			})
			return
		}

		// 3. Create WO
		wo, err := usecase.CreateWorkOrder(r.Context(), pool, usecase.CreateWOInput{
			ProductionVersionID: productionVersionID,
			ItemRevisionID:      itemRevID,
			ItemCode:            itemCode,
			ItemName:            itemName,
			Quantity:            quantity,
			UOMID:               uomID,
			SiteID:              siteID,
			ShiftID:             shiftID,
			PlannedStartAt:      pStart,
			PlannedEndAt:        pEnd,
			UserID:              userID,
			TraceID:             traceID,
			DispatchMode:        dispatchMode,
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(wo)
	}
}

func handleComputeCheck(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		woID := chi.URLParam(r, "id")
		res, err := usecase.ComputeAndCheck(r.Context(), pool, woID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if len(res.LaborShortages) > 0 {
			w.WriteHeader(http.StatusConflict)
		}
		json.NewEncoder(w).Encode(res)
	}
}

func handleLineReadiness(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		res, err := usecase.CurrentLineReadiness(r.Context(), pool, chi.URLParam(r, "id"))
		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error(), "message": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(res)
	}
}

func handleLineReplan(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !canMutateResourcePlanning(r) {
			writeAllocationForbidden(w)
			return
		}
		var body struct {
			Reason     string `json:"reason"`
			RowVersion int    `json:"row_version"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		res, err := usecase.ReplanWorkOrderLine(r.Context(), pool, usecase.ReplanLineInput{
			WOID:       chi.URLParam(r, "id"),
			UserID:     getHeader(r, "X-User-ID", systemUserID),
			TraceID:    getHeader(r, "X-Trace-ID", "missing-trace"),
			Reason:     body.Reason,
			RowVersion: body.RowVersion,
		})
		writeAllocationResponse(w, res, err)
	}
}

func handleApproveWO(pool *pgxpool.Pool, allocationService *usecase.AllocationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		woID := chi.URLParam(r, "id")
		userID := getHeader(r, "X-User-ID", systemUserID)
		roleCode := getHeader(r, "X-Role-Code", "OPERATOR")
		traceID := getHeader(r, "X-Trace-ID", "missing-trace")

		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		comment, _ := body["comment"].(string)
		demoPrint := usecase.DemoPrintOnApprovalEnabled() && !strings.EqualFold(strings.TrimSpace(r.Header.Get("X-MES-Approval-Policy")), "Strict")
		if !demoPrint {
			allocationCheck, allocationErr := allocationService.Revalidate(r.Context(), woID, userID, traceID)
			if allocationErr != nil {
				writeAllocationResponse(w, nil, allocationErr)
				return
			}
			if valid, ok := allocationCheck["valid"].(bool); !ok || !valid {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				json.NewEncoder(w).Encode(map[string]interface{}{"error": "WO_RESOURCE_ALLOCATION_INVALID", "message": "Every Work Order operation needs a current valid committed resource allocation before release.", "details": allocationCheck})
				return
			}
		}

		res, err := usecase.ApproveWorkOrder(r.Context(), pool, usecase.ApproveWOInput{
			WOID:                woID,
			Action:              "Approve",
			Comment:             comment,
			UserID:              userID,
			RoleCode:            roleCode,
			TraceID:             traceID,
			DemoPrintOnApproval: demoPrint,
		})
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			if sharedkernel.IsRetryableDependencyError(err) {
				w.WriteHeader(http.StatusServiceUnavailable)
				json.NewEncoder(w).Encode(map[string]string{"error": "DEPENDENCY_UNAVAILABLE", "message": err.Error()})
				return
			}
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
	}
}

func handleRejectWO(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		woID := chi.URLParam(r, "id")
		userID := getHeader(r, "X-User-ID", systemUserID)
		roleCode := getHeader(r, "X-Role-Code", "OPERATOR")
		traceID := getHeader(r, "X-Trace-ID", "missing-trace")

		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		comment, _ := body["comment"].(string)

		res, err := usecase.ApproveWorkOrder(r.Context(), pool, usecase.ApproveWOInput{
			WOID:     woID,
			Action:   "Reject",
			Comment:  comment,
			UserID:   userID,
			RoleCode: roleCode,
			TraceID:  traceID,
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
	}
}

func handleGetWOByID(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		woID := chi.URLParam(r, "id")

		var header map[string]interface{}
		rows, err := pool.Query(r.Context(), `SELECT wo_id, wo_code, production_version_id, COALESCE(production_version_code, ''), COALESCE(production_version_name_i18n, '{}'::jsonb), item_revision_id, COALESCE(item_revision_code, ''), COALESCE(item_revision_name_i18n, '{}'::jsonb), item_code, item_name, COALESCE(mbom_code, ''), COALESCE(routing_code, ''), COALESCE(planning_snapshot, '{}'::jsonb), quantity, uom_id, site_id, shift_id, planned_start_at, planned_end_at, status, dispatch_mode, created_by, created_at, row_version, COALESCE(selected_production_line_id::text, ''), COALESCE(selected_production_line_code, ''), COALESCE(selected_production_line_name_i18n, '{}'::jsonb), line_selection_mode, line_selection_status, COALESCE(line_selection_reason, ''), COALESCE(fallback_reason, ''), COALESCE(resource_hold_reason, '{}'::jsonb), COALESCE(evaluated_line_results, '[]'::jsonb), line_locked_at FROM wo_header WHERE wo_id = $1`, woID)
		if err != nil || !rows.Next() {
			http.Error(w, "Work Order not found", http.StatusNotFound)
			return
		}
		var id, code, pvID, pvCode, itemRevID, itemRevCode, itemCode, itemName, mbomCode, routingCode, uomID, siteID, status, dispatchMode, createdBy string
		var pvNameI18n, itemRevNameI18n, planningSnapshot, selectedLineName, resourceHoldReason, evaluatedLineResults []byte
		var shiftID *string
		var lineLockedAt *time.Time
		var rowVersion int
		var qty float64
		var plannedStartAt, plannedEndAt, createdAt time.Time
		var selectedLineID, selectedLineCode, lineMode, lineStatus, lineReason, fallbackReason string
		_ = rows.Scan(&id, &code, &pvID, &pvCode, &pvNameI18n, &itemRevID, &itemRevCode, &itemRevNameI18n, &itemCode, &itemName, &mbomCode, &routingCode, &planningSnapshot, &qty, &uomID, &siteID, &shiftID, &plannedStartAt, &plannedEndAt, &status, &dispatchMode, &createdBy, &createdAt, &rowVersion, &selectedLineID, &selectedLineCode, &selectedLineName, &lineMode, &lineStatus, &lineReason, &fallbackReason, &resourceHoldReason, &evaluatedLineResults, &lineLockedAt)
		rows.Close()

		header = map[string]interface{}{
			"wo_id":                              id,
			"wo_code":                            code,
			"production_version_id":              pvID,
			"production_version_code":            pvCode,
			"production_version_name_i18n":       json.RawMessage(pvNameI18n),
			"item_revision_id":                   itemRevID,
			"item_revision_code":                 itemRevCode,
			"item_revision_name_i18n":            json.RawMessage(itemRevNameI18n),
			"item_code":                          itemCode,
			"item_name":                          itemName,
			"mbom_code":                          mbomCode,
			"routing_code":                       routingCode,
			"planning_snapshot":                  json.RawMessage(planningSnapshot),
			"quantity":                           qty,
			"uom_id":                             uomID,
			"site_id":                            siteID,
			"shift_id":                           shiftID,
			"planned_start_at":                   plannedStartAt,
			"planned_end_at":                     plannedEndAt,
			"status":                             status,
			"dispatch_mode":                      dispatchMode,
			"row_version":                        rowVersion,
			"created_by":                         createdBy,
			"created_at":                         createdAt,
			"demo_print_on_approval":             usecase.DemoPrintOnApprovalEnabled(),
			"selected_production_line_id":        selectedLineID,
			"selected_production_line_code":      selectedLineCode,
			"selected_production_line_name_i18n": json.RawMessage(selectedLineName),
			"line_selection_mode":                lineMode,
			"line_selection_status":              lineStatus,
			"line_selection_reason":              lineReason,
			"fallback_reason":                    fallbackReason,
			"resource_hold_reason":               json.RawMessage(resourceHoldReason),
			"evaluated_line_results":             json.RawMessage(evaluatedLineResults),
			"line_locked_at":                     lineLockedAt,
		}

		opRows, _ := pool.Query(r.Context(), `SELECT o.wo_operation_id::text, o.sequence_no, o.operation_code, o.operation_name, o.work_center_id::text, o.status::text, o.execution_target_type, o.workstation_id::text, o.print_station_id::text, o.adapter_id, o.dispatch_event_id::text, o.operation_cycle_count::float8, o.expected_good_quantity::float8, o.base_quantity::float8, o.requires_output_label, o.units_per_label::float8, COALESCE(o.label_quantity_method, ''), COALESCE(o.copies_per_label, 1), COALESCE(o.label_count, 0), COALESCE(o.print_copies, 0), o.print_status, COALESCE(wc.code, ''), COALESCE(wc.name, '{}'::jsonb), COALESCE(o.production_line_id::text, ''), COALESCE(o.production_line_code, ''), COALESCE(o.production_line_name_i18n, '{}'::jsonb), COALESCE(o.source_routing_work_center_id::text, ''), a.allocation_id::text, a.status, a.validation_status, a.planned_start_at, a.planned_end_at, a.planned_shift_id::text, a.planned_workstation_id::text, a.planned_equipment_id::text, COALESCE(a.planned_production_line_id::text, ''), a.warning_codes FROM wo_operation o LEFT JOIN rm_work_center wc ON wc.master_id = o.work_center_id LEFT JOIN wo_resource_allocation a ON a.wo_operation_id=o.wo_operation_id AND a.status IN ('Draft','Validated','Committed') WHERE o.wo_id = $1 ORDER BY o.sequence_no`, woID)
		var ops []map[string]interface{}
		for opRows != nil && opRows.Next() {
			var opID, opCode, wcID, opStatus, wcCode, executionTarget, labelQuantityMethod, printStatus string
			var opNameJSON, wcNameJSON, opLineNameJSON []byte
			var seq, copiesPerLabel, labelCount, printCopies int
			var operationCycleCount, expectedGoodQuantity, baseQuantity, unitsPerLabel *float64
			var requiresOutputLabel bool
			var snapshotWorkstationID, printStationID, adapterID, dispatchEventID *string
			var allocationID, allocationStatus, validationStatus, shiftID, workstationID, equipmentID *string
			var opLineID, opLineCode, sourceRoutingWorkCenterID, allocationLineID string
			var plannedStart, plannedEnd *time.Time
			var warningCodes []byte
			if err := opRows.Scan(&opID, &seq, &opCode, &opNameJSON, &wcID, &opStatus, &executionTarget, &snapshotWorkstationID, &printStationID, &adapterID, &dispatchEventID, &operationCycleCount, &expectedGoodQuantity, &baseQuantity, &requiresOutputLabel, &unitsPerLabel, &labelQuantityMethod, &copiesPerLabel, &labelCount, &printCopies, &printStatus, &wcCode, &wcNameJSON, &opLineID, &opLineCode, &opLineNameJSON, &sourceRoutingWorkCenterID, &allocationID, &allocationStatus, &validationStatus, &plannedStart, &plannedEnd, &shiftID, &workstationID, &equipmentID, &allocationLineID, &warningCodes); err != nil {
				log.Printf("[WOReadModel] operation scan failed for work_order_id=%s: %v", woID, err)
				opRows.Close()
				http.Error(w, "failed to read Work Order operations", http.StatusInternalServerError)
				return
			}
			var opName map[string]string
			if err := json.Unmarshal(opNameJSON, &opName); err != nil {
				opName = map[string]string{"vi": opCode, "en": opCode, "ja": opCode, "ko": opCode}
			}
			var wcName map[string]string
			_ = json.Unmarshal(wcNameJSON, &wcName)
			var warnings interface{}
			if len(warningCodes) > 0 {
				_ = json.Unmarshal(warningCodes, &warnings)
			}
			ops = append(ops, map[string]interface{}{"wo_operation_id": opID, "sequence_no": seq, "operation_code": opCode, "operation_name": opName, "work_center_id": wcID, "work_center_code": wcCode, "work_center_name": wcName, "production_line_id": opLineID, "production_line_code": opLineCode, "production_line_name_i18n": json.RawMessage(opLineNameJSON), "source_routing_work_center_id": sourceRoutingWorkCenterID, "status": opStatus, "execution_target_type": executionTarget, "workstation_id": snapshotWorkstationID, "print_station_id": printStationID, "adapter_id": adapterID, "dispatch_event_id": dispatchEventID, "operation_cycle_count": operationCycleCount, "expected_good_quantity": expectedGoodQuantity, "base_quantity": baseQuantity, "requires_output_label": requiresOutputLabel, "units_per_label": unitsPerLabel, "label_quantity_method": labelQuantityMethod, "copies_per_label": copiesPerLabel, "label_count": labelCount, "print_copies": printCopies, "print_status": printStatus, "resource_allocation": map[string]interface{}{"allocation_id": allocationID, "status": allocationStatus, "validation_status": validationStatus, "planned_start_at": plannedStart, "planned_end_at": plannedEnd, "planned_shift_id": shiftID, "planned_workstation_id": workstationID, "planned_equipment_id": equipmentID, "planned_production_line_id": allocationLineID, "warning_codes": warnings}})
		}
		if opRows != nil {
			opRows.Close()
		}

		reqRows, _ := pool.Query(r.Context(), `SELECT r.requirement_id, r.component_item_revision_id, r.component_item_code, COALESCE(ir.name, '{}'::jsonb), r.required_qty, r.uom_id, r.backflush_flag, r.phantom_flag, r.stock_check_status, COALESCE(r.stock_check_detail, 'null'::jsonb) FROM wo_material_requirement r LEFT JOIN rm_item_revision ir ON ir.master_id = r.component_item_revision_id WHERE r.wo_id = $1`, woID)
		var reqs []map[string]interface{}
		for reqRows != nil && reqRows.Next() {
			var reqID, compRevID, compCode, reqUomID, stockStatus string
			var itemNameJSON, stockDetail []byte
			var reqQty float64
			var backflush, phantom bool
			_ = reqRows.Scan(&reqID, &compRevID, &compCode, &itemNameJSON, &reqQty, &reqUomID, &backflush, &phantom, &stockStatus, &stockDetail)
			var detail interface{}
			var itemName interface{}
			_ = json.Unmarshal(itemNameJSON, &itemName)
			if len(stockDetail) > 0 {
				_ = json.Unmarshal(stockDetail, &detail)
			}
			reqs = append(reqs, map[string]interface{}{
				"requirement_id":             reqID,
				"component_item_revision_id": compRevID,
				"component_item_code":        compCode,
				"item_name":                  itemName,
				"required_qty":               reqQty,
				"uom_id":                     reqUomID,
				"backflush_flag":             backflush,
				"phantom_flag":               phantom,
				"stock_check_status":         stockStatus,
				"stock_check_detail":         detail,
			})
		}
		if reqRows != nil {
			reqRows.Close()
		}

		logRows, _ := pool.Query(r.Context(), `SELECT log_id, action, actor_user_id, actor_role_code, comment, occurred_at FROM wo_approval_log WHERE wo_id = $1 ORDER BY occurred_at`, woID)
		var logs []map[string]interface{}
		for logRows != nil && logRows.Next() {
			var logID, action, actorID string
			var roleCode, comment *string
			var occurredAt time.Time
			_ = logRows.Scan(&logID, &action, &actorID, &roleCode, &comment, &occurredAt)
			logs = append(logs, map[string]interface{}{
				"log_id":          logID,
				"action":          action,
				"actor_user_id":   actorID,
				"actor_role_code": roleCode,
				"comment":         comment,
				"occurred_at":     occurredAt,
			})
		}
		if logRows != nil {
			logRows.Close()
		}

		printRows, _ := pool.Query(r.Context(), `
			SELECT print_job_id, job_code, wo_operation_id, status, attempt_count,
			       command_event_id, idempotency_key, selected_printer_code,
			       dispatched_at, completed_at, last_error_code, last_error_message,
			       requested_quantity, units_per_label, label_quantity_method, label_count, copies_per_label, total_copies,
			       COALESCE((SELECT NULLIF(e.payload->>'completed_count','')::int FROM wo_print_job_event e WHERE e.print_job_id=j.print_job_id AND e.event_type IN ('printer.batch.printed','printer.printed') ORDER BY e.received_at DESC LIMIT 1), CASE WHEN j.status='Completed' THEN COALESCE(j.total_copies, 0) ELSE 0 END),
			       COALESCE((SELECT jsonb_array_length(e.payload->'failed_job_ids') FROM wo_print_job_event e WHERE e.print_job_id=j.print_job_id AND e.event_type IN ('printer.batch.printed','printer.printed') ORDER BY e.received_at DESC LIMIT 1), CASE WHEN j.status='Failed' THEN COALESCE(j.total_copies, 0) ELSE 0 END)
			FROM wo_print_job j
			WHERE j.wo_id = $1
			ORDER BY created_at
		`, woID)
		var printJobs []map[string]interface{}
		for printRows != nil && printRows.Next() {
			var jobID, jobCode, operationID, status, idempotency string
			var attemptCount int
			var commandEventID, printerCode, errorCode, errorMessage, labelQuantityMethod *string
			var dispatchedAt, completedAt *time.Time
			var requestedQuantity, unitsPerLabel *float64
			var labelCount, copiesPerLabel, totalCopies *int
			var successfulCopies, failedCopies int
			_ = printRows.Scan(&jobID, &jobCode, &operationID, &status, &attemptCount, &commandEventID, &idempotency, &printerCode, &dispatchedAt, &completedAt, &errorCode, &errorMessage, &requestedQuantity, &unitsPerLabel, &labelQuantityMethod, &labelCount, &copiesPerLabel, &totalCopies, &successfulCopies, &failedCopies)
			printJobs = append(printJobs, map[string]interface{}{
				"print_job_id": jobID, "job_code": jobCode, "wo_operation_id": operationID,
				"status": status, "attempt_count": attemptCount, "command_event_id": commandEventID,
				"idempotency_key": idempotency, "selected_printer_code": printerCode, "requested_quantity": requestedQuantity, "units_per_label": unitsPerLabel, "label_quantity_method": labelQuantityMethod, "label_count": labelCount, "copies_per_label": copiesPerLabel, "total_copies": totalCopies,
				"successful_copies": successfulCopies, "failed_copies": failedCopies,
				"dispatched_at": dispatchedAt, "completed_at": completedAt,
				"last_error_code": errorCode, "last_error_message": errorMessage,
			})
		}
		if printRows != nil {
			printRows.Close()
		}

		allocationRows, _ := pool.Query(r.Context(), `SELECT a.allocation_id, o.operation_code, a.status, a.validation_status, COALESCE(a.planned_production_line_id::text, ''), a.planned_start_at, a.planned_end_at, COALESCE(a.warning_codes, '[]'::jsonb) FROM wo_resource_allocation a JOIN wo_operation o ON o.wo_operation_id = a.wo_operation_id WHERE a.wo_id = $1 ORDER BY a.created_at DESC`, woID)
		var allocationHistory []map[string]interface{}
		for allocationRows != nil && allocationRows.Next() {
			var allocationID, operationCode, allocationStatus, validationStatus, allocationLineID string
			var plannedStart, plannedEnd *time.Time
			var warningCodes []byte
			_ = allocationRows.Scan(&allocationID, &operationCode, &allocationStatus, &validationStatus, &allocationLineID, &plannedStart, &plannedEnd, &warningCodes)
			var warnings interface{}
			_ = json.Unmarshal(warningCodes, &warnings)
			allocationHistory = append(allocationHistory, map[string]interface{}{"allocation_id": allocationID, "operation_code": operationCode, "status": allocationStatus, "validation_status": validationStatus, "planned_production_line_id": allocationLineID, "planned_start_at": plannedStart, "planned_end_at": plannedEnd, "warning_codes": warnings})
		}
		if allocationRows != nil {
			allocationRows.Close()
		}
		var operationCount, validAllocationCount, activeAllocationCount, invalidAllocationCount, allocationWarningCount int
		var resourceEvaluatedAt *time.Time
		_ = pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM wo_operation WHERE wo_id=$1`, woID).Scan(&operationCount)
		_ = pool.QueryRow(r.Context(), `
			SELECT COUNT(*) FILTER (WHERE status='Committed' AND validation_status IN ('Valid','ValidWithWarnings')),
			       COUNT(*) FILTER (WHERE status IN ('Draft','Validated','Committed')),
			       COUNT(*) FILTER (WHERE status IN ('Draft','Validated','Committed') AND validation_status IN ('Invalid','Stale')),
			       COALESCE(SUM(jsonb_array_length(COALESCE(warning_codes, '[]'::jsonb))) FILTER (WHERE status IN ('Draft','Validated','Committed')), 0)::int,
			       MAX(allocated_at) FILTER (WHERE status IN ('Draft','Validated','Committed'))
			FROM wo_resource_allocation WHERE wo_id=$1
		`, woID).Scan(&validAllocationCount, &activeAllocationCount, &invalidAllocationCount, &allocationWarningCount, &resourceEvaluatedAt)
		resourceEvaluationDimensions := buildResourceEvaluationDimensions(operationCount, activeAllocationCount, validAllocationCount, invalidAllocationCount, allocationWarningCount, resourceEvaluatedAt)
		gateBlockers := []string{}
		if lineStatus != "READY" {
			gateBlockers = append(gateBlockers, "WO_LINE_NOT_READY")
		}
		if operationCount != validAllocationCount {
			gateBlockers = append(gateBlockers, "WO_OPERATION_ALLOCATION_MISSING")
		}
		approvalEligible := status == "Draft" && len(gateBlockers) == 0
		executionEligible := status == "Released" && len(gateBlockers) == 0
		allocationState := "NOT_STARTED"
		capacityState := "DEFERRED"
		if activeAllocationCount > 0 {
			allocationState = "IN_PROGRESS"
			capacityState = "NOT_EVALUATED"
		}
		if operationCount > 0 && validAllocationCount == operationCount {
			allocationState = "READY"
			capacityState = "READY"
		}
		gateSummary := map[string]interface{}{"approval_state": "Pending", "execution_state": "NotStarted", "line_selection_status": lineStatus, "resource_allocation_state": allocationState, "capacity_state": capacityState, "operation_count": operationCount, "active_allocation_count": activeAllocationCount, "valid_allocation_count": validAllocationCount, "approval_eligible": approvalEligible, "execution_eligible": executionEligible, "blockers": gateBlockers}
		if status == "Approved" || status == "Released" || status == "InProgress" || status == "Completed" || status == "Closed" {
			gateSummary["approval_state"] = "Approved"
		}
		if status == "InProgress" {
			gateSummary["execution_state"] = "InProgress"
		} else if status == "Completed" || status == "Closed" {
			gateSummary["execution_state"] = status
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"header":                         header,
			"operations":                     ops,
			"material_requirements":          reqs,
			"approval_logs":                  logs,
			"print_jobs":                     printJobs,
			"allocation_history":             allocationHistory,
			"resource_evaluation_dimensions": resourceEvaluationDimensions,
			"gate_summary":                   gateSummary,
		})
	}
}

func buildResourceEvaluationDimensions(operationCount, activeCount, validCount, invalidCount, warningCount int, evaluatedAt *time.Time) []map[string]interface{} {
	status := "DEFERRED"
	reason := "RESOURCE_ALLOCATION_NOT_STARTED"
	blocking := false
	resultEvaluatedAt := interface{}(nil)
	if operationCount == 0 {
		status = "NOT_APPLICABLE"
		reason = "WORK_ORDER_HAS_NO_RESOURCE_OPERATIONS"
	} else if validCount == operationCount {
		status = "READY"
		reason = "RESOURCE_ALLOCATION_VALIDATED"
		resultEvaluatedAt = evaluatedAt
	} else if invalidCount > 0 {
		status = "BLOCKED"
		reason = "RESOURCE_ALLOCATION_INVALID"
		blocking = true
		resultEvaluatedAt = evaluatedAt
	} else if activeCount > 0 {
		status = "NOT_EVALUATED"
		reason = "RESOURCE_ALLOCATION_INCOMPLETE"
		blocking = true
		resultEvaluatedAt = evaluatedAt
	}

	details := []map[string]interface{}{{
		"operation_count": operationCount, "active_allocation_count": activeCount,
		"valid_allocation_count": validCount, "invalid_allocation_count": invalidCount,
		"warning_count": warningCount,
	}}
	dimensions := make([]map[string]interface{}, 0, 5)
	for _, code := range []string{"workstations", "machine_requirements", "equipment_units", "assignments", "worker_skill_labor"} {
		dimensions = append(dimensions, map[string]interface{}{
			"dimension_code": code, "key": code, "status": status, "blocking": blocking,
			"evaluation_stage": "RESOURCE_ALLOCATION", "reason_code": reason,
			"localized_message_key": "woDetail.dimensionReason." + reason,
			"details":               details, "evaluated_at": resultEvaluatedAt,
			"source": "MES_EXECUTION_RESOURCE_ALLOCATION",
		})
	}
	return dimensions
}

func handleListWorkOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitStr := r.URL.Query().Get("limit")
		limit := 100
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 500 {
			limit = l
		}

		where := []string{"1=1"}
		args := []interface{}{}
		add := func(clause string, value interface{}) {
			args = append(args, value)
			where = append(where, fmt.Sprintf(clause, len(args)))
		}
		if value := strings.TrimSpace(r.URL.Query().Get("search")); value != "" {
			args = append(args, value)
			n := len(args)
			where = append(where, fmt.Sprintf("(wo_code ILIKE '%%' || $%d || '%%' OR item_code ILIKE '%%' || $%d || '%%' OR item_name ILIKE '%%' || $%d || '%%')", n, n, n))
		}
		if value := strings.TrimSpace(r.URL.Query().Get("status")); value != "" && value != "ALL" {
			add("status = $%d", value)
		}
		if value := strings.TrimSpace(r.URL.Query().Get("selected_line")); value != "" {
			add("selected_production_line_code = $%d", value)
		}
		if value := strings.TrimSpace(r.URL.Query().Get("line_selection_status")); value != "" && value != "ALL" {
			add("line_selection_status = $%d", value)
		}
		if value := strings.TrimSpace(r.URL.Query().Get("hold")); value == "true" {
			where = append(where, "line_selection_status = 'RESOURCE_HOLD'")
		} else if value == "false" {
			where = append(where, "line_selection_status <> 'RESOURCE_HOLD'")
		}
		if value := strings.TrimSpace(r.URL.Query().Get("fallback_used")); value == "true" {
			where = append(where, "NULLIF(fallback_reason, '') IS NOT NULL")
		} else if value == "false" {
			where = append(where, "NULLIF(fallback_reason, '') IS NULL")
		}
		if value := strings.TrimSpace(r.URL.Query().Get("production_version")); value != "" {
			add("production_version_code = $%d", value)
		}
		if value := strings.TrimSpace(r.URL.Query().Get("site")); value != "" {
			add("site_id::text = $%d", value)
		}
		if value := strings.TrimSpace(r.URL.Query().Get("date_from")); value != "" {
			add("planned_start_at >= $%d::timestamptz", value)
		}
		if value := strings.TrimSpace(r.URL.Query().Get("date_to")); value != "" {
			add("planned_start_at < ($%d::date + INTERVAL '1 day')", value)
		}
		args = append(args, limit)
		query := fmt.Sprintf(`SELECT wo_id, wo_code, item_code, item_name, quantity, uom_id, site_id, production_version_id, COALESCE(production_version_code, ''), planned_start_at, planned_end_at, status, dispatch_mode, created_at, COALESCE(selected_production_line_code, ''), COALESCE(selected_production_line_name_i18n, '{}'::jsonb), line_selection_mode, line_selection_status, COALESCE(line_selection_reason, ''), COALESCE(fallback_reason, ''), COALESCE(resource_hold_reason, '{}'::jsonb), COALESCE(evaluated_line_results, '[]'::jsonb), line_locked_at FROM wo_header WHERE %s ORDER BY planned_start_at ASC, created_at DESC LIMIT $%d`, strings.Join(where, " AND "), len(args))
		rows, err := pool.Query(r.Context(), query, args...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var data []map[string]interface{}
		for rows.Next() {
			var id, code, itemCode, itemName, uomID, siteID, pvID, pvCode, status, dispatchMode, lineCode, lineMode, lineStatus, lineReason, fallbackReason string
			var lineName, holdReason, evaluated []byte
			var qty float64
			var plannedStart, plannedEnd, createdAt time.Time
			var lineLockedAt *time.Time
			_ = rows.Scan(&id, &code, &itemCode, &itemName, &qty, &uomID, &siteID, &pvID, &pvCode, &plannedStart, &plannedEnd, &status, &dispatchMode, &createdAt, &lineCode, &lineName, &lineMode, &lineStatus, &lineReason, &fallbackReason, &holdReason, &evaluated, &lineLockedAt)
			var evaluations []map[string]interface{}
			_ = json.Unmarshal(evaluated, &evaluations)
			primary, backup := map[string]interface{}{}, map[string]interface{}{}
			for _, evaluation := range evaluations {
				if role, _ := evaluation["selection_role"].(string); role == "PRIMARY" {
					primary = evaluation
				} else if role == "BACKUP" {
					backup = evaluation
				}
			}
			approvalState := "Pending"
			if status == "Approved" || status == "Released" || status == "InProgress" || status == "Completed" || status == "Closed" {
				approvalState = "Approved"
			}
			executionState := "NotStarted"
			if status == "InProgress" {
				executionState = "InProgress"
			} else if status == "Completed" || status == "Closed" {
				executionState = status
			}
			data = append(data, map[string]interface{}{
				"wo_id": id, "wo_code": code, "item_code": itemCode, "item_name": itemName, "quantity": qty, "uom_id": uomID,
				"site_id": siteID, "production_version_id": pvID, "production_version_code": pvCode, "planned_start_at": plannedStart, "planned_end_at": plannedEnd,
				"status": status, "dispatch_mode": dispatchMode, "created_at": createdAt, "selected_production_line_code": lineCode, "selected_production_line_name_i18n": json.RawMessage(lineName),
				"line_selection_mode": lineMode, "line_selection_status": lineStatus, "line_selection_reason": lineReason, "fallback_reason": fallbackReason,
				"resource_hold_reason": json.RawMessage(holdReason), "primary_evaluation": primary, "backup_evaluation": backup, "line_locked_at": lineLockedAt,
				"approval_state":  approvalState,
				"execution_state": executionState,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"data": data})
	}
}
