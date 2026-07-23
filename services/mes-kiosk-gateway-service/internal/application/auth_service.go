package application

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/domain"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type AuthService struct {
	pool        *pgxpool.Pool
	keycloakURL string
	realm       string
	clientID    string
}

var keycloakLoginClient = &http.Client{Timeout: 5 * time.Second}

var keycloakLoginBreaker = sharedkernel.NewCircuitBreaker(sharedkernel.CircuitBreakerConfig{
	Name:       "KioskKeycloakLogin",
	Dependency: "platform-keycloak",
})

func NewAuthService(pool *pgxpool.Pool, keycloakURL, realm, clientID string) *AuthService {
	if keycloakURL == "" {
		keycloakURL = "http://platform-keycloak:8080"
	}
	if realm == "" {
		realm = "wonsealtech"
	}
	if clientID == "" {
		clientID = "mes-client"
	}
	return &AuthService{
		pool:        pool,
		keycloakURL: strings.TrimRight(keycloakURL, "/"),
		realm:       realm,
		clientID:    clientID,
	}
}

func (s *AuthService) LoginTerminal(ctx context.Context, terminalID string, input domain.LoginInput) (*domain.TokenResponse, error) {
	// Verify terminal exists by terminal_id OR terminal_code
	var realTerminalID string
	err := s.pool.QueryRow(ctx, `SELECT terminal_id FROM terminal WHERE terminal_id::text = $1 OR terminal_code = $1`, terminalID).Scan(&realTerminalID)
	if err != nil {
		return nil, fmt.Errorf("terminal %s not found", terminalID)
	}

	tokenEndpoint := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token", s.keycloakURL, s.realm)

	data := url.Values{}
	data.Set("grant_type", "password")
	data.Set("client_id", s.clientID)
	data.Set("username", input.EmployeeID)
	data.Set("password", input.PIN)

	req, err := http.NewRequestWithContext(ctx, "POST", tokenEndpoint, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create auth request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := requestKeycloakToken(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		errMsg, _ := errResp["error_description"].(string)
		if errMsg == "" {
			errMsg, _ = errResp["error"].(string)
		}
		if errMsg == "" {
			errMsg = fmt.Sprintf("keycloak login failed with status %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("authentication failed: %s", errMsg)
	}

	var tokenResp domain.TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("failed to decode token response: %w", err)
	}

	// Parse claims to get UserID and Username
	claims, _ := s.ValidateToken(tokenResp.AccessToken)
	if claims != nil {
		tokenResp.UserID, _ = claims["sub"].(string)
		tokenResp.Username, _ = claims["preferred_username"].(string)
	}
	if tokenResp.UserID == "" {
		tokenResp.UserID = input.EmployeeID
	}

	// Create terminal_session record
	sessionID := uuid.New().String()
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO terminal_session (session_id, terminal_id, operator_user_id, logged_in_at, status)
		VALUES ($1, $2, $3, $4, 'ACTIVE')
	`, sessionID, realTerminalID, tokenResp.UserID, time.Now().UTC())

	return &tokenResp, nil
}

func requestKeycloakToken(req *http.Request) (*http.Response, error) {
	result, err := keycloakLoginBreaker.Execute(func() (interface{}, error) {
		resp, err := keycloakLoginClient.Do(req)
		if err != nil {
			return nil, sharedkernel.NewRetryableDependencyError("platform-keycloak", err)
		}
		if resp.StatusCode >= http.StatusInternalServerError {
			defer resp.Body.Close()
			return nil, sharedkernel.NewRetryableDependencyError("platform-keycloak", fmt.Errorf("keycloak login failed with status %d", resp.StatusCode))
		}
		return resp, nil
	})
	if err != nil {
		if sharedkernel.IsCircuitBreakerOpen(err) {
			return nil, sharedkernel.NewRetryableDependencyError("platform-keycloak", err)
		}
		return nil, err
	}
	return result.(*http.Response), nil
}

func (s *AuthService) ValidateToken(tokenStr string) (jwt.MapClaims, error) {
	if tokenStr == "" {
		return nil, fmt.Errorf("empty token")
	}

	// Unverified parsing for claims extraction in dev/MVP boundary
	parser := jwt.NewParser()
	token, _, err := parser.ParseUnverified(tokenStr, jwt.MapClaims{})
	if err != nil {
		return nil, fmt.Errorf("invalid jwt format: %w", err)
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}

	// Check expiration
	if exp, ok := claims["exp"].(float64); ok {
		if time.Now().Unix() > int64(exp) {
			return nil, fmt.Errorf("token expired")
		}
	}

	return claims, nil
}

func (s *AuthService) LogoutTerminal(ctx context.Context, terminalID, userID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE terminal_session
		SET status = 'CLOSED', logged_out_at = NOW()
		WHERE terminal_id = $1 AND operator_user_id = $2 AND status = 'ACTIVE'
	`, terminalID, userID)
	return err
}
