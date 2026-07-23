package http

import (
	"bytes"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
	"github.com/mom-platform/wms-outbound-service/internal/application/usecase"
)

func NewRouter(pool *pgxpool.Pool, inventoryURL string) http.Handler {
	r := chi.NewRouter()
	service := usecase.Service{Pool: pool, InventoryURL: inventoryURL}
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "wms-outbound-service"})
	})
	r.Route("/api/wms/outbound", func(r chi.Router) {
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
				'request_id', request_id,
				'wo_id', wo_id,
				'work_center_ref', work_center_ref,
				'item_revision_id', item_revision_id,
				'required_qty', required_qty,
				'already_staged_qty', already_staged_qty,
				'shortfall_qty', shortfall_qty,
				'available_qty', available_qty,
				'transferred_qty', transferred_qty,
				'status', status,
				'detail', detail,
				'created_at', created_at
			) FROM material_request WHERE request_id = $1`, chi.URLParam(r, "id")).Scan(&raw)
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
