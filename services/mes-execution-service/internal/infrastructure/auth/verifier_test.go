package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestVerifierEnforcesKioskTokenTrustBoundary(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	kid := "phase06-execution"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"keys": []map[string]string{{
			"kid": kid, "kty": "RSA",
			"n": base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(privateKey.PublicKey.E)).Bytes()),
		}}})
	}))
	defer server.Close()
	issuer := server.URL + "/realms/wonsealtech"
	verifier := NewVerifier(server.URL, "wonsealtech", "mes-client", []string{issuer})

	base := jwt.MapClaims{
		"iss": issuer, "sub": "operator-phase06", "azp": "mes-client",
		"exp":          time.Now().Add(time.Minute).Unix(),
		"realm_access": map[string]interface{}{"roles": []interface{}{"OPERATOR"}},
	}
	sign := func(claims jwt.MapClaims, key *rsa.PrivateKey) string {
		t.Helper()
		token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
		token.Header["kid"] = kid
		value, signErr := token.SignedString(key)
		if signErr != nil {
			t.Fatal(signErr)
		}
		return value
	}
	clone := func() jwt.MapClaims {
		result := jwt.MapClaims{}
		for key, value := range base {
			result[key] = value
		}
		return result
	}

	claims, err := verifier.VerifyOperator(sign(clone(), privateKey))
	if err != nil || claims["sub"] != "operator-phase06" {
		t.Fatalf("valid operator token rejected: claims=%v err=%v", claims, err)
	}
	tests := []struct {
		name   string
		mutate func(jwt.MapClaims)
		key    *rsa.PrivateKey
	}{
		{name: "invalid signature", mutate: func(jwt.MapClaims) {}, key: otherKey},
		{name: "wrong issuer", mutate: func(c jwt.MapClaims) { c["iss"] = "https://untrusted.invalid" }, key: privateKey},
		{name: "wrong audience", mutate: func(c jwt.MapClaims) { c["azp"] = "other-client" }, key: privateKey},
		{name: "expired", mutate: func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Minute).Unix() }, key: privateKey},
		{name: "missing operator role", mutate: func(c jwt.MapClaims) { c["realm_access"] = map[string]interface{}{"roles": []interface{}{"PLANNER"}} }, key: privateKey},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := clone()
			test.mutate(candidate)
			if _, verifyErr := verifier.VerifyOperator(sign(candidate, test.key)); verifyErr == nil {
				t.Fatal("expected token rejection")
			}
		})
	}
}
