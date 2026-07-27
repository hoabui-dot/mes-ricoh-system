package usecase

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestResolvePrintStationRequiresReadyBinding(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ready":false,"code":"PRINT_STATION_RUNTIME_NOT_READY","data":null}`))
	}))
	defer server.Close()
	previous := os.Getenv("MASTER_DATA_SERVICE_URL")
	defer os.Setenv("MASTER_DATA_SERVICE_URL", previous)
	os.Setenv("MASTER_DATA_SERVICE_URL", server.URL)
	workstation := "ws-1"
	if _, _, err := resolvePrintStation(context.Background(), &workstation); err == nil || err.Error() != "PRINT_STATION_RUNTIME_NOT_READY" {
		t.Fatalf("expected readiness error, got %v", err)
	}
}

func TestResolvePrintStationReturnsBindingIdentity(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ready":true,"data":{"print_station_id":"station-1","print_station_code":"PRINT-STATION-01"}}`))
	}))
	defer server.Close()
	previous := os.Getenv("MASTER_DATA_SERVICE_URL")
	defer os.Setenv("MASTER_DATA_SERVICE_URL", previous)
	os.Setenv("MASTER_DATA_SERVICE_URL", server.URL)
	workstation := "ws-1"
	code, id, err := resolvePrintStation(context.Background(), &workstation)
	if err != nil || code != "PRINT-STATION-01" || id != "station-1" {
		t.Fatalf("unexpected binding: code=%q id=%q err=%v", code, id, err)
	}
}
