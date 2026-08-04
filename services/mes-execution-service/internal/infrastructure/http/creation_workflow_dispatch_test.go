package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseCreationWorkflowRequestPreservesDemoDispatchMode(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/mes/execution/work-order-creation-workflows", strings.NewReader(`{
		"production_version_id":"pv-phase07",
		"quantity":2,
		"shift_id":"shift-phase07",
		"target_date":"2026-08-03",
		"dispatch_mode":"demo_shared_kiosk"
	}`))
	parsed, err := parseCreationWorkflowRequest(context.Background(), nil, request, "user-phase07", "phase07-success")
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Input.DispatchMode != "DEMO_SHARED_KIOSK" || parsed.Payload["dispatch_mode"] != "DEMO_SHARED_KIOSK" {
		t.Fatalf("dispatch mode was not preserved: input=%q payload=%v", parsed.Input.DispatchMode, parsed.Payload["dispatch_mode"])
	}
}

func TestParseCreationWorkflowRequestRejectsUnknownDispatchMode(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/mes/execution/work-order-creation-workflows", strings.NewReader(`{
		"production_version_id":"pv-phase07",
		"quantity":2,
		"shift_id":"shift-phase07",
		"dispatch_mode":"broadcast_everywhere"
	}`))
	if _, err := parseCreationWorkflowRequest(context.Background(), nil, request, "user-phase07", "phase07-invalid"); err == nil || err.Error() != "WORK_ORDER_DISPATCH_MODE_INVALID" {
		t.Fatalf("expected WORK_ORDER_DISPATCH_MODE_INVALID, got %v", err)
	}
}
