package http

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/application/usecase"
	"github.com/mom-platform/mes-execution-service/internal/domain"
	"github.com/mom-platform/mes-execution-service/internal/infrastructure/client"
)

const systemUserID = "00000000-0000-0000-0000-000000000001"

func NewRouter(pool *pgxpool.Pool, traceabilityClient *client.TraceabilityClient) http.Handler {
	r := chi.NewRouter()

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Authorization, X-User-ID, X-Role-Code, X-Trace-ID")
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
		r.Post("/work-orders", handleCreateWorkOrder(pool))
		r.Post("/work-orders/{id}/compute-check", handleComputeCheck(pool))
		r.Post("/work-orders/{id}/approve", handleApproveWO(pool))
		r.Post("/work-orders/{id}/reject", handleRejectWO(pool))
		r.Get("/work-orders/{id}", handleGetWOByID(pool))
		r.Get("/work-orders", handleListWorkOrders(pool))

		// Stage B Execution Endpoints
		r.Post("/work-orders/{id}/operations/{opId}/start", handleStartOperation(pool))
		r.Post("/work-orders/{id}/operations/{opId}/confirm", handleConfirmOperation(pool, traceabilityClient))
		r.Post("/work-orders/{id}/operations/{opId}/abort", handleAbortSession(pool))
		r.Get("/work-orders/{id}/operations/{opId}/consumption", handleGetConsumption(pool))
	})

	return r
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
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(confirmation)
	}
}

func handleAbortSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getHeader(r, "X-User-ID", systemUserID)
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		sessionID, _ := body["session_id"].(string)

		if err := usecase.AbortSession(r.Context(), pool, usecase.AbortSessionInput{
			SessionID:      sessionID,
			OperatorUserID: userID,
		}); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Session aborted successfully"})
	}
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
		readiness, err := usecase.CheckMasterDataReadiness(r.Context(), pool, itemRevID, siteID)
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
			ItemRevisionID: itemRevID,
			ItemCode:       itemCode,
			ItemName:       itemName,
			Quantity:       quantity,
			UOMID:          uomID,
			SiteID:         siteID,
			PlannedStartAt: pStart,
			PlannedEndAt:   pEnd,
			UserID:         userID,
			TraceID:        traceID,
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
		json.NewEncoder(w).Encode(res)
	}
}

func handleApproveWO(pool *pgxpool.Pool) http.HandlerFunc {
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
			Action:   "Approve",
			Comment:  comment,
			UserID:   userID,
			RoleCode: roleCode,
			TraceID:  traceID,
		})
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
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
		rows, err := pool.Query(r.Context(), `SELECT wo_id, wo_code, production_version_id, item_revision_id, item_code, item_name, quantity, uom_id, site_id, status, created_by, created_at FROM wo_header WHERE wo_id = $1`, woID)
		if err != nil || !rows.Next() {
			http.Error(w, "Work Order not found", http.StatusNotFound)
			return
		}
		var id, code, pvID, itemRevID, itemCode, itemName, uomID, siteID, status, createdBy string
		var qty float64
		var createdAt time.Time
		_ = rows.Scan(&id, &code, &pvID, &itemRevID, &itemCode, &itemName, &qty, &uomID, &siteID, &status, &createdBy, &createdAt)
		rows.Close()

		header = map[string]interface{}{
			"wo_id":                 id,
			"wo_code":               code,
			"production_version_id": pvID,
			"item_revision_id":      itemRevID,
			"item_code":             itemCode,
			"item_name":             itemName,
			"quantity":              qty,
			"uom_id":                uomID,
			"site_id":               siteID,
			"status":                status,
			"created_by":            createdBy,
			"created_at":            createdAt,
		}

		opRows, _ := pool.Query(r.Context(), `SELECT wo_operation_id, sequence_no, operation_code, work_center_id, status FROM wo_operation WHERE wo_id = $1 ORDER BY sequence_no`, woID)
		var ops []map[string]interface{}
		for opRows != nil && opRows.Next() {
			var opID, opCode, wcID, opStatus string
			var seq int
			_ = opRows.Scan(&opID, &seq, &opCode, &wcID, &opStatus)
			ops = append(ops, map[string]interface{}{"wo_operation_id": opID, "sequence_no": seq, "operation_code": opCode, "work_center_id": wcID, "status": opStatus})
		}
		if opRows != nil {
			opRows.Close()
		}

		reqRows, _ := pool.Query(r.Context(), `SELECT requirement_id, component_item_revision_id, component_item_code, required_qty, uom_id, backflush_flag, phantom_flag, stock_check_status FROM wo_material_requirement WHERE wo_id = $1`, woID)
		var reqs []map[string]interface{}
		for reqRows != nil && reqRows.Next() {
			var reqID, compRevID, compCode, reqUomID, stockStatus string
			var reqQty float64
			var backflush, phantom bool
			_ = reqRows.Scan(&reqID, &compRevID, &compCode, &reqQty, &reqUomID, &backflush, &phantom, &stockStatus)
			reqs = append(reqs, map[string]interface{}{
				"requirement_id":             reqID,
				"component_item_revision_id": compRevID,
				"component_item_code":        compCode,
				"required_qty":               reqQty,
				"uom_id":                     reqUomID,
				"backflush_flag":             backflush,
				"phantom_flag":               phantom,
				"stock_check_status":         stockStatus,
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

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"header":                header,
			"operations":            ops,
			"material_requirements": reqs,
			"approval_logs":         logs,
		})
	}
}

func handleListWorkOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitStr := r.URL.Query().Get("limit")
		limit := 100
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 500 {
			limit = l
		}

		rows, err := pool.Query(r.Context(), `SELECT wo_id, wo_code, item_code, quantity, status, created_at FROM wo_header ORDER BY created_at DESC LIMIT $1`, limit)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var data []map[string]interface{}
		for rows.Next() {
			var id, code, itemCode, status string
			var qty float64
			var createdAt time.Time
			_ = rows.Scan(&id, &code, &itemCode, &qty, &status, &createdAt)
			data = append(data, map[string]interface{}{
				"wo_id":      id,
				"wo_code":    code,
				"item_code":  itemCode,
				"quantity":   qty,
				"status":     status,
				"created_at": createdAt,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"data": data})
	}
}
