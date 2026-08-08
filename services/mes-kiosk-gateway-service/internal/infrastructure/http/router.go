package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/application"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/domain"
	ws "github.com/mom-platform/mes-kiosk-gateway-service/internal/websocket"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

func NewRouter(pool *pgxpool.Pool, authService *application.AuthService, hub *ws.Hub) http.Handler {
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
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "mes-kiosk-gateway-service"})
	})

	r.Get("/metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte("# HELP mes_kiosk_gateway_service_up Service health\n# TYPE mes_kiosk_gateway_service_up gauge\nmes_kiosk_gateway_service_up 1\n"))
	})

	r.Route("/api/mes/kiosk-gateway", func(r chi.Router) {
		r.Get("/ws", hub.HandleWebSocket)

		r.Post("/terminals/{id}/login", handleTerminalLogin(authService))
		r.Post("/terminals/{id}/sso", handleTerminalSSOLogin(authService))
		r.Post("/terminals/{id}/logout", handleTerminalLogout(authService, hub))
		r.Get("/terminals/{id}/status", handleGetTerminalStatus(pool))
		r.Get("/terminals", handleListTerminals(pool))
	})

	return r
}

func handleTerminalSSOLogin(authService *application.AuthService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Fields(strings.TrimSpace(r.Header.Get("Authorization")))
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "KIOSK_SSO_REQUIRED"})
			return
		}

		resp, err := authService.LoginTerminalSSO(r.Context(), chi.URLParam(r, "id"), parts[1])
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "KIOSK_SSO_REJECTED", "message": err.Error()})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

func handleTerminalLogin(authService *application.AuthService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		terminalID := chi.URLParam(r, "id")

		var body domain.LoginInput
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid login body", http.StatusBadRequest)
			return
		}

		if body.EmployeeID == "" || body.PIN == "" {
			http.Error(w, "employee_id and pin are required", http.StatusBadRequest)
			return
		}

		resp, err := authService.LoginTerminal(r.Context(), terminalID, body)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			if sharedkernel.IsRetryableDependencyError(err) {
				w.WriteHeader(http.StatusServiceUnavailable)
				json.NewEncoder(w).Encode(map[string]string{"error": "KEYCLOAK_UNAVAILABLE", "message": err.Error()})
				return
			}
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func handleTerminalLogout(authService *application.AuthService, hub *ws.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		terminalID := chi.URLParam(r, "id")
		claims, err := authenticateOperator(r, authService)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "KIOSK_AUTH_REQUIRED"})
			return
		}
		userID, _ := claims["sub"].(string)

		realTerminalID, err := authService.LogoutTerminal(r.Context(), terminalID, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		hub.DisconnectTerminal(realTerminalID)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "logged out successfully"})
	}
}

func authenticateOperator(r *http.Request, authService *application.AuthService) (map[string]interface{}, error) {
	authorization := strings.TrimSpace(r.Header.Get("Authorization"))
	parts := strings.Fields(authorization)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return nil, fmt.Errorf("bearer token required")
	}
	claims, err := authService.ValidateOperatorToken(parts[1])
	if err != nil {
		return nil, err
	}
	return map[string]interface{}(claims), nil
}

func handleGetTerminalStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		terminalID := chi.URLParam(r, "id")

		var t domain.Terminal
		err := pool.QueryRow(r.Context(), `
			SELECT terminal_id, terminal_code, site_id, work_center_id, status, last_seen_at, created_at, updated_at
			FROM terminal WHERE terminal_id = $1 OR terminal_code = $1
		`, terminalID).Scan(&t.TerminalID, &t.TerminalCode, &t.SiteID, &t.WorkCenterID, &t.Status, &t.LastSeenAt, &t.CreatedAt, &t.UpdatedAt)

		if err != nil {
			http.Error(w, "terminal not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(t)
	}
}

func handleListTerminals(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := pool.Query(r.Context(), `
			SELECT terminal_id, terminal_code, site_id, work_center_id, status, last_seen_at, created_at, updated_at
			FROM terminal ORDER BY terminal_code ASC
		`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var list []domain.Terminal
		for rows.Next() {
			var t domain.Terminal
			_ = rows.Scan(&t.TerminalID, &t.TerminalCode, &t.SiteID, &t.WorkCenterID, &t.Status, &t.LastSeenAt, &t.CreatedAt, &t.UpdatedAt)
			list = append(list, t)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"data": list})
	}
}
