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

func TestCalculateLabelQuantity(t *testing.T) {
	tests := []struct {
		name     string
		quantity float64
		base     float64
		want     int
		wantErr  bool
	}{
		{name: "two labels", quantity: 2, base: 1, want: 2},
		{name: "rounds up partial cycle", quantity: 5, base: 2, want: 3},
		{name: "zero base", quantity: 2, base: 0, wantErr: true},
		{name: "negative quantity", quantity: -1, base: 1, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calculateLabelQuantity(tt.quantity, tt.base)
			if (err != nil) != tt.wantErr || got != tt.want {
				t.Fatalf("calculateLabelQuantity(%v, %v) = (%d, %v), want (%d, error=%v)", tt.quantity, tt.base, got, err, tt.want, tt.wantErr)
			}
		})
	}
}
