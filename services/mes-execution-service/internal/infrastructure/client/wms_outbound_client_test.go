package client

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

func TestWMSOutboundClientBreakerTripsWithoutRetryStorm(t *testing.T) {
	var calls int32
	c := NewWMSOutboundClient("http://wms-outbound-service:3090")
	c.http = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		atomic.AddInt32(&calls, 1)
		return &http.Response{
			StatusCode: http.StatusInternalServerError,
			Status:     "500 Internal Server Error",
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"error":"downstream down"}`)),
			Request:    req,
		}, nil
	})}

	input := MaterialRequestInput{
		ItemRevisionID: "11111111-1111-1111-1111-111111111111",
		WorkCenterRef:  "22222222-2222-2222-2222-222222222222",
		RequiredQty:    1,
		WOID:           "33333333-3333-3333-3333-333333333333",
	}

	for i := 0; i < 5; i++ {
		_, _ = c.RequestMaterial(context.Background(), input, "user", "trace")
	}

	if got := atomic.LoadInt32(&calls); got != 4 {
		t.Fatalf("expected breaker to stop the fifth downstream call after 4 failed requests, got %d calls", got)
	}
}
