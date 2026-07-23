package client

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
)

func TestTraceabilityClientBreakerTripsWithoutRetryStorm(t *testing.T) {
	var calls int32
	c := NewTraceabilityClient("http://mes-traceability-service:3040")
	c.client = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		atomic.AddInt32(&calls, 1)
		return &http.Response{
			StatusCode: http.StatusInternalServerError,
			Status:     "500 Internal Server Error",
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"error":"traceability unavailable"}`)),
			Request:    req,
		}, nil
	})}

	req := IssueLabelReq{
		ItemRevisionID:     "11111111-1111-1111-1111-111111111111",
		OperationCode:      "OP-MIX",
		Quantity:           1,
		UOMID:              "PCS",
		SiteID:             "22222222-2222-2222-2222-222222222222",
		CreatedByOperation: "OP-MIX",
	}

	for i := 0; i < 5; i++ {
		_, _ = c.IssueLabel(context.Background(), req, "user", "OPERATOR")
	}

	if got := atomic.LoadInt32(&calls); got != 4 {
		t.Fatalf("expected breaker to stop the fifth downstream call after 4 failed requests, got %d calls", got)
	}
}
