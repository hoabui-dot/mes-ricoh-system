package application

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestValidateTokenVerifiesSignatureExpiryIssuerAndClient(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	kid := "phase02-key"
	var issuer string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		exponent := big.NewInt(int64(privateKey.PublicKey.E)).Bytes()
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"keys": []map[string]string{{
			"kid": kid, "kty": "RSA", "alg": "RS256",
			"n": base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(exponent),
		}}})
	}))
	defer server.Close()
	issuer = server.URL + "/realms/wonsealtech"
	service := NewAuthService(nil, server.URL, "wonsealtech", "mes-client")

	sign := func(claims jwt.MapClaims, key *rsa.PrivateKey) string {
		t.Helper()
		token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
		token.Header["kid"] = kid
		value, err := token.SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	validClaims := jwt.MapClaims{
		"iss": issuer, "sub": "operator-phase02", "azp": "mes-client",
		"exp": time.Now().Add(time.Minute).Unix(), "iat": time.Now().Unix(),
	}
	if claims, err := service.ValidateToken(sign(validClaims, privateKey)); err != nil || claims["sub"] != "operator-phase02" {
		t.Fatalf("valid signed token rejected: claims=%v err=%v", claims, err)
	}

	tests := []struct {
		name   string
		claims jwt.MapClaims
		key    *rsa.PrivateKey
	}{
		{name: "expired", claims: jwt.MapClaims{"iss": issuer, "sub": "operator", "azp": "mes-client", "exp": time.Now().Add(-time.Minute).Unix()}, key: privateKey},
		{name: "wrong issuer", claims: jwt.MapClaims{"iss": "https://untrusted.invalid", "sub": "operator", "azp": "mes-client", "exp": time.Now().Add(time.Minute).Unix()}, key: privateKey},
		{name: "wrong client", claims: jwt.MapClaims{"iss": issuer, "sub": "operator", "azp": "other-client", "exp": time.Now().Add(time.Minute).Unix()}, key: privateKey},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := service.ValidateToken(sign(test.claims, test.key)); err == nil {
				t.Fatal("expected token rejection")
			}
		})
	}
	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ValidateToken(sign(validClaims, otherKey)); err == nil {
		t.Fatal("expected invalid signature rejection")
	}
}

func TestKeycloakLoginBreakerTripsWithoutRetryStorm(t *testing.T) {
	oldClient := keycloakLoginClient
	oldBreaker := keycloakLoginBreaker
	defer func() {
		keycloakLoginClient = oldClient
		keycloakLoginBreaker = oldBreaker
	}()

	var calls int32
	keycloakLoginClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		atomic.AddInt32(&calls, 1)
		return &http.Response{
			StatusCode: http.StatusInternalServerError,
			Status:     "500 Internal Server Error",
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"error":"keycloak unavailable"}`)),
			Request:    req,
		}, nil
	})}
	keycloakLoginBreaker = sharedkernel.NewCircuitBreaker(sharedkernel.CircuitBreakerConfig{
		Name:       "KioskKeycloakLoginTest",
		Dependency: "platform-keycloak",
	})

	for i := 0; i < 5; i++ {
		req, err := http.NewRequest(http.MethodPost, "http://platform-keycloak:8080/token", strings.NewReader("grant_type=password"))
		if err != nil {
			t.Fatal(err)
		}
		_, _ = requestKeycloakToken(req)
	}

	if got := atomic.LoadInt32(&calls); got != 4 {
		t.Fatalf("expected breaker to stop the fifth Keycloak call after 4 failed requests, got %d calls", got)
	}
}
