package application

import (
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"

	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
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
