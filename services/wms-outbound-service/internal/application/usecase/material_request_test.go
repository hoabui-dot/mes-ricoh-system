package usecase

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestInventoryBreakerStopsBalanceRetryStorm(t *testing.T) {
	var calls int32
	service := Service{
		InventoryURL: "http://wms-inventory-service:3070",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			atomic.AddInt32(&calls, 1)
			return &http.Response{
				StatusCode: http.StatusInternalServerError,
				Status:     "500 Internal Server Error",
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(`{"error":"inventory unavailable"}`)),
				Request:    req,
			}, nil
		})},
	}
	for i := 0; i < 5; i++ {
		_, _ = service.fetchBalances(context.Background(), "11111111-1111-1111-1111-111111111111")
	}

	if got := atomic.LoadInt32(&calls); got != 4 {
		t.Fatalf("expected breaker to stop the fifth inventory call after 4 failed requests, got %d calls", got)
	}
}
