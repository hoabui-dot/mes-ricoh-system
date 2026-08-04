package application

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
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
	issuers     []string
	jwksMu      sync.RWMutex
	jwks        map[string]*rsa.PublicKey
	jwksExpiry  time.Time
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
	issuers := []string{fmt.Sprintf("%s/realms/%s", strings.TrimRight(keycloakURL, "/"), realm)}
	if configured := strings.TrimSpace(os.Getenv("KEYCLOAK_ISSUERS")); configured != "" {
		issuers = nil
		for _, issuer := range strings.Split(configured, ",") {
			if issuer = strings.TrimSpace(issuer); issuer != "" {
				issuers = append(issuers, strings.TrimRight(issuer, "/"))
			}
		}
	}
	return &AuthService{
		pool:        pool,
		keycloakURL: strings.TrimRight(keycloakURL, "/"),
		realm:       realm,
		clientID:    clientID,
		issuers:     issuers,
		jwks:        make(map[string]*rsa.PublicKey),
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

	claims, err := s.ValidateOperatorToken(tokenResp.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("identity token rejected: %w", err)
	}
	tokenResp.UserID, _ = claims["sub"].(string)
	tokenResp.Username, _ = claims["preferred_username"].(string)

	sessionID := uuid.New().String()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin terminal session: %w", err)
	}
	defer tx.Rollback(ctx)
	if err := tx.QueryRow(ctx, `SELECT terminal_id::text FROM terminal WHERE terminal_id=$1 FOR UPDATE`, realTerminalID).Scan(&realTerminalID); err != nil {
		return nil, fmt.Errorf("lock terminal session: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE terminal_session SET status='CLOSED', logged_out_at=COALESCE(logged_out_at,NOW())
		WHERE terminal_id=$1 AND status='ACTIVE'
	`, realTerminalID); err != nil {
		return nil, fmt.Errorf("close previous terminal session: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO terminal_session (session_id, terminal_id, operator_user_id, logged_in_at, status)
		VALUES ($1, $2, $3, NOW(), 'ACTIVE')
	`, sessionID, realTerminalID, tokenResp.UserID); err != nil {
		return nil, fmt.Errorf("create terminal session: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit terminal session: %w", err)
	}
	tokenResp.TerminalSessionID = sessionID

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
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method %s", token.Method.Alg())
		}
		kid, _ := token.Header["kid"].(string)
		if kid == "" {
			return nil, fmt.Errorf("token kid is missing")
		}
		return s.signingKey(kid)
	}, jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil {
		return nil, fmt.Errorf("token validation failed: %w", err)
	}
	if !token.Valid {
		return nil, fmt.Errorf("token is invalid")
	}
	issuer, err := claims.GetIssuer()
	if err != nil || !s.isTrustedIssuer(issuer) {
		return nil, fmt.Errorf("token issuer is not trusted")
	}
	clientMatch := false
	if azp, _ := claims["azp"].(string); azp == s.clientID {
		clientMatch = true
	}
	if audiences, err := claims.GetAudience(); err == nil {
		for _, audience := range audiences {
			if audience == s.clientID {
				clientMatch = true
				break
			}
		}
	}
	if !clientMatch {
		return nil, fmt.Errorf("token was not issued for client %s", s.clientID)
	}
	if subject, err := claims.GetSubject(); err != nil || subject == "" {
		return nil, fmt.Errorf("token subject is missing")
	}
	return claims, nil
}

func (s *AuthService) isTrustedIssuer(issuer string) bool {
	for _, trusted := range s.issuers {
		if issuer == trusted {
			return true
		}
	}
	return false
}

func (s *AuthService) ValidateOperatorToken(tokenStr string) (jwt.MapClaims, error) {
	claims, err := s.ValidateToken(tokenStr)
	if err != nil {
		return nil, err
	}
	realmAccess, _ := claims["realm_access"].(map[string]interface{})
	roles, _ := realmAccess["roles"].([]interface{})
	for _, role := range roles {
		if value, _ := role.(string); value == "OPERATOR" {
			return claims, nil
		}
	}
	return nil, fmt.Errorf("operator role is required")
}

func (s *AuthService) HasActiveTerminalSession(ctx context.Context, terminalID, userID string) bool {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM terminal_session ts
			JOIN terminal t ON t.terminal_id=ts.terminal_id
			WHERE (t.terminal_id::text=$1 OR t.terminal_code=$1)
			  AND ts.operator_user_id=$2 AND ts.status='ACTIVE'
		)
	`, terminalID, userID).Scan(&exists)
	return err == nil && exists
}

func (s *AuthService) signingKey(kid string) (*rsa.PublicKey, error) {
	s.jwksMu.RLock()
	key := s.jwks[kid]
	fresh := time.Now().Before(s.jwksExpiry)
	s.jwksMu.RUnlock()
	if key != nil && fresh {
		return key, nil
	}
	if err := s.refreshSigningKeys(); err != nil {
		return nil, err
	}
	s.jwksMu.RLock()
	defer s.jwksMu.RUnlock()
	key = s.jwks[kid]
	if key == nil {
		return nil, fmt.Errorf("no signing key for kid %s", kid)
	}
	return key, nil
}

func (s *AuthService) refreshSigningKeys() error {
	s.jwksMu.Lock()
	defer s.jwksMu.Unlock()
	endpoint := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/certs", s.keycloakURL, s.realm)
	request, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	response, err := keycloakLoginClient.Do(request)
	if err != nil {
		return fmt.Errorf("jwks request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks request returned status %d", response.StatusCode)
	}
	var document struct {
		Keys []struct {
			KID string `json:"kid"`
			KTY string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1024*1024)).Decode(&document); err != nil {
		return fmt.Errorf("invalid jwks document: %w", err)
	}
	keys := make(map[string]*rsa.PublicKey)
	for _, item := range document.Keys {
		if item.KTY != "RSA" || item.KID == "" {
			continue
		}
		nBytes, err := base64.RawURLEncoding.DecodeString(item.N)
		if err != nil {
			continue
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(item.E)
		if err != nil || len(eBytes) == 0 {
			continue
		}
		exponent := 0
		for _, value := range eBytes {
			exponent = exponent<<8 + int(value)
		}
		if exponent > 0 {
			keys[item.KID] = &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: exponent}
		}
	}
	if len(keys) == 0 {
		return fmt.Errorf("jwks document contains no usable RSA key")
	}
	s.jwks = keys
	s.jwksExpiry = time.Now().Add(5 * time.Minute)
	return nil
}

func (s *AuthService) LogoutTerminal(ctx context.Context, terminalID, userID string) (string, error) {
	var realTerminalID string
	if err := s.pool.QueryRow(ctx, `SELECT terminal_id::text FROM terminal WHERE terminal_id::text=$1 OR terminal_code=$1`, terminalID).Scan(&realTerminalID); err != nil {
		return "", fmt.Errorf("terminal %s not found", terminalID)
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE terminal_session
		SET status = 'CLOSED', logged_out_at = NOW()
		WHERE terminal_id = $1 AND operator_user_id = $2 AND status = 'ACTIVE'
	`, realTerminalID, userID)
	return realTerminalID, err
}
