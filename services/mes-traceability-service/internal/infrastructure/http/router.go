package http

import (
	"encoding/json"
	"net/http"

	"github.com/mom-platform/mes-traceability-service/internal/application/usecase"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func NewRouter(pool *pgxpool.Pool) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "UP", "service": "mes-traceability-service"})
	})

	r.Handle("/metrics", promhttp.Handler())

	resolveUC := usecase.NewResolvePolicyUseCase(pool)
	issueUC := usecase.NewIssueLabelUseCase(pool)
	splitUC := usecase.NewSplitLabelUseCase(pool)
	consumeUC := usecase.NewConsumeLabelUseCase(pool)
	genealogyUC := usecase.NewGetGenealogyUseCase(pool)

	r.Route("/api/mes/traceability", func(r chi.Router) {
		r.Get("/analytics/overview", handleTraceAnalyticsOverview(pool))
		r.Get("/analytics/labels", handleTraceAnalyticsLabels(pool))
		r.Get("/analytics/genealogy", handleTraceAnalyticsGenealogy(pool))
		r.Post("/policies/resolve", func(w http.ResponseWriter, r *http.Request) {
			var in usecase.ResolvePolicyInput
			if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			out, err := resolveUC.Execute(r.Context(), in)
			if err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(out)
		})

		r.Post("/labels/issue", func(w http.ResponseWriter, r *http.Request) {
			var in usecase.IssueLabelInput
			if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			in.UserID = r.Header.Get("X-User-ID")
			lbl, err := issueUC.Execute(r.Context(), in)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(lbl)
		})

		r.Post("/labels/split", func(w http.ResponseWriter, r *http.Request) {
			var in usecase.SplitLabelInput
			if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			in.UserID = r.Header.Get("X-User-ID")
			out, err := splitUC.Execute(r.Context(), in)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(out)
		})

		r.Post("/labels/consume", func(w http.ResponseWriter, r *http.Request) {
			var in usecase.ConsumeLabelInput
			if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			in.UserID = r.Header.Get("X-User-ID")
			if err := consumeUC.Execute(r.Context(), in); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"message": "Label consumed successfully"})
		})

		r.Get("/labels/{id}/genealogy", func(w http.ResponseWriter, r *http.Request) {
			idStr := chi.URLParam(r, "id")
			lblID, err := uuid.Parse(idStr)
			if err != nil {
				http.Error(w, "invalid label id", http.StatusBadRequest)
				return
			}
			out, err := genealogyUC.Execute(r.Context(), lblID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(out)
		})
	})

	return r
}
