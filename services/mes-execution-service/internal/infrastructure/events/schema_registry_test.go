package events

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestRegisterEventSchemasContinuesAfterRejectedSubject(t *testing.T) {
	var mu sync.Mutex
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		requests++
		current := requests
		mu.Unlock()
		if current == 1 {
			w.WriteHeader(http.StatusConflict)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	if err := RegisterEventSchemas(server.URL); err == nil {
		t.Fatal("expected aggregate registration warning")
	}
	mu.Lock()
	defer mu.Unlock()
	if requests != len(executionEventTypes) {
		t.Fatalf("registered %d of %d event schemas", requests, len(executionEventTypes))
	}
}
