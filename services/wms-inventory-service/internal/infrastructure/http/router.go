package http

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/wms-inventory-service/internal/application/usecase"
)

func NewRouter(pool *pgxpool.Pool) http.Handler {
	r := chi.NewRouter()
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "wms-inventory-service"})
	})
	r.Route("/api/wms/inventory", func(r chi.Router) {
		r.Get("/balances", func(w http.ResponseWriter, r *http.Request) {
			rows, err := usecase.ListBalances(r.Context(), pool, r.URL.Query().Get("item_revision_id"), r.URL.Query().Get("location_id"))
			writeJSON(w, rows, err, http.StatusOK)
		})
		r.Get("/movements", func(w http.ResponseWriter, r *http.Request) {
			limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
			if err != nil {
				limit = 50
			}
			rows, err := usecase.ListMovements(r.Context(), pool, r.URL.Query().Get("location_id"), r.URL.Query().Get("lot_id"), limit)
			writeJSON(w, rows, err, http.StatusOK)
		})
		r.Post("/movements/receipt", func(w http.ResponseWriter, r *http.Request) {
			var in usecase.ReceiptInput
			if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			in.CreatedBy = r.Header.Get("X-User-ID")
			lotID, err := usecase.CreateReceipt(r.Context(), pool, in)
			writeJSON(w, map[string]string{"lot_id": lotID}, err, http.StatusCreated)
		})
		r.Post("/movements/transfer-to-staging", func(w http.ResponseWriter, r *http.Request) {
			var in usecase.TransferInput
			if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			in.CreatedBy = r.Header.Get("X-User-ID")
			out, err := usecase.TransferToStaging(r.Context(), pool, in)
			writeJSON(w, out, err, http.StatusCreated)
		})
	})
	return r
}

func writeJSON(w http.ResponseWriter, body any, err error, successStatus int) {
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		status := http.StatusBadRequest
		code := "INVALID_INVENTORY_REQUEST"
		if strings.Contains(err.Error(), "INSUFFICIENT_STOCK") {
			status = http.StatusConflict
			code = "INSUFFICIENT_STOCK"
		}
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]string{"error": code, "message": err.Error()})
		return
	}
	w.WriteHeader(successStatus)
	json.NewEncoder(w).Encode(body)
}
