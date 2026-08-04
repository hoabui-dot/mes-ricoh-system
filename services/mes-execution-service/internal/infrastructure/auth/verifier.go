package auth

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Verifier struct {
	keycloakURL string
	realm       string
	clientID    string
	issuers     map[string]struct{}
	client      *http.Client
	mu          sync.RWMutex
	keys        map[string]*rsa.PublicKey
	expiresAt   time.Time
}

func NewVerifier(keycloakURL, realm, clientID string, trustedIssuers []string) *Verifier {
	issuerSet := make(map[string]struct{}, len(trustedIssuers))
	for _, issuer := range trustedIssuers {
		if issuer = strings.TrimSpace(issuer); issuer != "" {
			issuerSet[strings.TrimRight(issuer, "/")] = struct{}{}
		}
	}
	return &Verifier{
		keycloakURL: strings.TrimRight(keycloakURL, "/"), realm: realm, clientID: clientID,
		issuers: issuerSet, client: &http.Client{Timeout: 5 * time.Second}, keys: make(map[string]*rsa.PublicKey),
	}
}

func (v *Verifier) VerifyOperator(tokenString string) (jwt.MapClaims, error) {
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method")
		}
		kid, _ := token.Header["kid"].(string)
		if kid == "" {
			return nil, fmt.Errorf("token kid is missing")
		}
		return v.signingKey(kid)
	}, jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("token validation failed: %w", err)
	}
	issuer, err := claims.GetIssuer()
	if err != nil {
		return nil, fmt.Errorf("token issuer is missing")
	}
	if _, trusted := v.issuers[issuer]; !trusted {
		return nil, fmt.Errorf("token issuer is not trusted")
	}
	clientMatch := claims["azp"] == v.clientID
	if audiences, audienceErr := claims.GetAudience(); audienceErr == nil {
		for _, audience := range audiences {
			clientMatch = clientMatch || audience == v.clientID
		}
	}
	if !clientMatch {
		return nil, fmt.Errorf("token was not issued for client %s", v.clientID)
	}
	if subject, subjectErr := claims.GetSubject(); subjectErr != nil || subject == "" {
		return nil, fmt.Errorf("token subject is missing")
	}
	if !hasRole(claims, "OPERATOR") {
		return nil, fmt.Errorf("operator role is required")
	}
	return claims, nil
}

func hasRole(claims jwt.MapClaims, expected string) bool {
	realmAccess, _ := claims["realm_access"].(map[string]interface{})
	roles, _ := realmAccess["roles"].([]interface{})
	for _, role := range roles {
		if value, _ := role.(string); value == expected {
			return true
		}
	}
	return false
}

func (v *Verifier) signingKey(kid string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	key, fresh := v.keys[kid], time.Now().Before(v.expiresAt)
	v.mu.RUnlock()
	if key != nil && fresh {
		return key, nil
	}
	if err := v.refreshKeys(); err != nil {
		return nil, err
	}
	v.mu.RLock()
	defer v.mu.RUnlock()
	if key = v.keys[kid]; key == nil {
		return nil, fmt.Errorf("no signing key for kid %s", kid)
	}
	return key, nil
}

func (v *Verifier) refreshKeys() error {
	v.mu.Lock()
	defer v.mu.Unlock()
	response, err := v.client.Get(fmt.Sprintf("%s/realms/%s/protocol/openid-connect/certs", v.keycloakURL, v.realm))
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
		if item.KID == "" || item.KTY != "RSA" {
			continue
		}
		n, nErr := base64.RawURLEncoding.DecodeString(item.N)
		e, eErr := base64.RawURLEncoding.DecodeString(item.E)
		if nErr != nil || eErr != nil || len(e) == 0 {
			continue
		}
		exponent := 0
		for _, value := range e {
			exponent = exponent<<8 + int(value)
		}
		if exponent > 0 {
			keys[item.KID] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: exponent}
		}
	}
	if len(keys) == 0 {
		return fmt.Errorf("jwks document contains no usable RSA key")
	}
	v.keys, v.expiresAt = keys, time.Now().Add(5*time.Minute)
	return nil
}
