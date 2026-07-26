// Package jwt provides JWT access token generation, refresh token management,
// and claims validation for the MES Platform.
package jwt

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Config holds JWT configuration values.
type Config struct {
	Secret              string
	AccessExpiryMinutes int
	RefreshExpiryDays   int
	Issuer              string
	Audience            string
}

// Claims represents the custom JWT payload for MES Platform tokens.
type Claims struct {
	UserID   uuid.UUID `json:"user_id"`
	Username string    `json:"username"`
	Email    string    `json:"email"`
	jwtlib.RegisteredClaims
}

// TokenPair holds an access token and its corresponding refresh token.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
}

// Manager handles token creation and validation. Inject this — never use globals.
type Manager struct {
	cfg Config
}

// NewManager creates a new JWT Manager from config.
func NewManager(cfg Config) (*Manager, error) {
	if len(cfg.Secret) < 32 {
		return nil, errors.New("jwt: secret must be at least 32 characters")
	}
	if cfg.AccessExpiryMinutes <= 0 {
		cfg.AccessExpiryMinutes = 15
	}
	if cfg.RefreshExpiryDays <= 0 {
		cfg.RefreshExpiryDays = 30
	}
	return &Manager{cfg: cfg}, nil
}

// GenerateTokenPair creates a new access + refresh token pair for the given user.
func (m *Manager) GenerateTokenPair(userID uuid.UUID, username, email string) (*TokenPair, error) {
	now := time.Now().UTC()
	expiresAt := now.Add(time.Duration(m.cfg.AccessExpiryMinutes) * time.Minute)

	claims := Claims{
		UserID:   userID,
		Username: username,
		Email:    email,
		RegisteredClaims: jwtlib.RegisteredClaims{
			Issuer:    m.cfg.Issuer,
			Audience:  jwtlib.ClaimStrings{m.cfg.Audience},
			Subject:   userID.String(),
			IssuedAt:  jwtlib.NewNumericDate(now),
			ExpiresAt: jwtlib.NewNumericDate(expiresAt),
			ID:        uuid.NewString(),
		},
	}

	token := jwtlib.NewWithClaims(jwtlib.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(m.cfg.Secret))
	if err != nil {
		return nil, fmt.Errorf("jwt: sign access token: %w", err)
	}

	refreshToken, err := generateSecureToken(64)
	if err != nil {
		return nil, fmt.Errorf("jwt: generate refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  signed,
		RefreshToken: refreshToken,
		ExpiresAt:    expiresAt,
	}, nil
}

// ValidateClaims parses and validates an access token string.
// Returns the extracted Claims on success.
func (m *Manager) ValidateClaims(tokenStr string) (*Claims, error) {
	token, err := jwtlib.ParseWithClaims(tokenStr, &Claims{}, func(t *jwtlib.Token) (any, error) {
		if _, ok := t.Method.(*jwtlib.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("jwt: unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(m.cfg.Secret), nil
	}, jwtlib.WithValidMethods([]string{"HS256"}),
		jwtlib.WithIssuedAt(),
		jwtlib.WithIssuer(m.cfg.Issuer),
		jwtlib.WithAudience(m.cfg.Audience),
	)
	if err != nil {
		return nil, fmt.Errorf("jwt: invalid token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("jwt: invalid claims")
	}

	return claims, nil
}

// RefreshExpiryDuration returns the configured refresh token lifetime as a Duration.
func (m *Manager) RefreshExpiryDuration() time.Duration {
	return time.Duration(m.cfg.RefreshExpiryDays) * 24 * time.Hour
}

// generateSecureToken creates a cryptographically secure random hex token.
func generateSecureToken(byteLen int) (string, error) {
	b := make([]byte, byteLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
