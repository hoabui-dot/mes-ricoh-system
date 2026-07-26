package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
	"github.com/mom-platform/wms-outbound-service/internal/application/usecase"
	"github.com/mom-platform/wms-outbound-service/internal/realtime"
)

func NewRouter(pool *pgxpool.Pool, inventoryURL string, hub *realtime.Hub) http.Handler {
	r := chi.NewRouter()
	service := usecase.Service{Pool: pool, InventoryURL: inventoryURL}
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "wms-outbound-service"})
	})
	r.Get("/metrics", func(w http.ResponseWriter, _ *http.Request) {
		attempts, replays, shortages := usecase.MaterialRequestMetrics()
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		_, _ = w.Write([]byte("# TYPE wms_material_requests_attempts_total counter\nwms_material_requests_attempts_total " + strconv.FormatUint(attempts, 10) + "\n# TYPE wms_material_requests_idempotent_replays_total counter\nwms_material_requests_idempotent_replays_total " + strconv.FormatUint(replays, 10) + "\n# TYPE wms_material_requests_shortage_total counter\nwms_material_requests_shortage_total " + strconv.FormatUint(shortages, 10) + "\n"))
	})
	if hub != nil {
		r.Get("/api/wms/outbound/realtime/ws", hub.HandleWebSocket)
	}
	r.Route("/api/wms/outbound", func(r chi.Router) {
		r.Get("/material-requests", func(w http.ResponseWriter, r *http.Request) {
			limit := 100
			if value := r.URL.Query().Get("limit"); value != "" {
				if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 && parsed <= 500 {
					limit = parsed
				}
			}
			rows, err := pool.Query(r.Context(), `SELECT m.request_id::text, m.request_code, m.source_system, m.wo_id::text, COALESCE(m.work_order_code, '') AS work_order_code, COALESCE(m.work_order_name, '') AS work_order_name, m.work_center_ref::text, COALESCE(m.work_center_code, '') AS work_center_code, COALESCE(m.work_center_name, '') AS work_center_name, m.item_revision_id::text, COALESCE(NULLIF(m.item_code, ''), ir.item_code, '') AS item_code, COALESCE(NULLIF(m.item_name, ''), ir.item_name->>'vi', '') AS item_name, COALESCE(m.uom_code, '') AS uom_code, m.required_qty::float8, m.already_staged_qty::float8, m.shortfall_qty::float8, m.available_qty::float8, m.transferred_qty::float8, m.status, m.detail, m.created_at, m.updated_at FROM material_request m LEFT JOIN rm_item_revision ir ON ir.item_revision_id = m.item_revision_id ORDER BY m.created_at DESC LIMIT $1`, limit)
			w.Header().Set("Content-Type", "application/json")
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{"error": "WMS_MATERIAL_REQUEST_QUERY_FAILED"})
				return
			}
			defer rows.Close()
			data := make([]map[string]any, 0)
			for rows.Next() {
				var requestID, requestCode, source, woID, workOrderCode, workOrderName, workCenter, workCenterCode, workCenterName, itemRevision, itemCode, itemName, uomCode, status string
				var required, staged, shortfall, available, transferred float64
				var detail []byte
				var createdAt, updatedAt time.Time
				if err := rows.Scan(&requestID, &requestCode, &source, &woID, &workOrderCode, &workOrderName, &workCenter, &workCenterCode, &workCenterName, &itemRevision, &itemCode, &itemName, &uomCode, &required, &staged, &shortfall, &available, &transferred, &status, &detail, &createdAt, &updatedAt); err != nil {
					continue
				}
				var parsedDetail any
				_ = json.Unmarshal(detail, &parsedDetail)
				data = append(data, map[string]any{"request_id": requestID, "request_code": requestCode, "source_system": source, "wo_id": woID, "work_order_code": workOrderCode, "work_order_name": workOrderName, "work_center_ref": workCenter, "work_center_code": workCenterCode, "work_center_name": workCenterName, "item_revision_id": itemRevision, "item_code": itemCode, "item_name": itemName, "uom_code": uomCode, "required_qty": required, "already_staged_qty": staged, "shortfall_qty": shortfall, "available_qty": available, "transferred_qty": transferred, "status": status, "detail": parsedDetail, "created_at": createdAt, "updated_at": updatedAt})
			}
			json.NewEncoder(w).Encode(map[string]any{"data": data})
		})
		r.Post("/material-requests", func(w http.ResponseWriter, r *http.Request) {
			var in usecase.RequestInput
			if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			in.CreatedBy = r.Header.Get("X-User-ID")
			in.TraceID = r.Header.Get("X-Trace-ID")
			out, err := service.RequestMaterialForWorkCenter(r.Context(), in)
			w.Header().Set("Content-Type", "application/json")
			if err != nil {
				if sharedkernel.IsRetryableDependencyError(err) {
					w.WriteHeader(http.StatusServiceUnavailable)
					json.NewEncoder(w).Encode(map[string]string{"error": "INVENTORY_SERVICE_UNAVAILABLE", "message": err.Error()})
					return
				}
				w.WriteHeader(http.StatusUnprocessableEntity)
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}
			status := http.StatusCreated
			if out.Status == "Shortage" {
				status = http.StatusConflict
			}
			w.WriteHeader(status)
			json.NewEncoder(w).Encode(out)
		})
		r.Get("/material-requests/{id}", func(w http.ResponseWriter, r *http.Request) {
			var raw []byte
			err := pool.QueryRow(r.Context(), `SELECT jsonb_build_object(
				'request_id', m.request_id,
				'request_code', m.request_code,
				'source_system', m.source_system,
				'work_center_code', m.work_center_code,
				'work_center_name', m.work_center_name,
				'item_code', COALESCE(NULLIF(m.item_code, ''), ir.item_code, ''),
				'item_name', COALESCE(NULLIF(m.item_name, ''), ir.item_name->>'vi', ''),
				'staging_location_id', COALESCE((SELECT location_id::text FROM rm_storage_location WHERE staging_for_work_center_ref = m.work_center_ref AND location_purpose = 'WorkCenterStaging' LIMIT 1), ''),
				'work_order_code', m.work_order_code,
				'work_order_name', m.work_order_name,
				'uom_code', m.uom_code,
				'wo_id', m.wo_id,
				'work_center_ref', m.work_center_ref,
				'item_revision_id', m.item_revision_id,
				'required_qty', m.required_qty,
				'already_staged_qty', m.already_staged_qty,
				'shortfall_qty', m.shortfall_qty,
				'available_qty', m.available_qty,
				'transferred_qty', m.transferred_qty,
				'status', m.status,
				'detail', m.detail,
				'created_at', m.created_at,
				'updated_at', m.updated_at
			) FROM material_request m LEFT JOIN rm_item_revision ir ON ir.item_revision_id = m.item_revision_id WHERE m.request_id = $1`, chi.URLParam(r, "id")).Scan(&raw)
			w.Header().Set("Content-Type", "application/json")
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{"error": "Not Found"})
				return
			}
			_, _ = bytes.NewReader(raw).WriteTo(w)
		})
	})
	return r
}
