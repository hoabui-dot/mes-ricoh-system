package http

import (
	"testing"
	"time"
)

func TestBuildResourceEvaluationDimensionsTracksAllocationLifecycle(t *testing.T) {
	now := time.Date(2026, time.August, 4, 8, 0, 0, 0, time.UTC)
	tests := []struct {
		name                        string
		operations, active, valid   int
		invalid, warnings           int
		wantStatus, wantReason      string
		wantBlocking, wantEvaluated bool
	}{
		{name: "not started", operations: 4, wantStatus: "DEFERRED", wantReason: "RESOURCE_ALLOCATION_NOT_STARTED"},
		{name: "partial", operations: 4, active: 2, valid: 2, wantStatus: "NOT_EVALUATED", wantReason: "RESOURCE_ALLOCATION_INCOMPLETE", wantBlocking: true, wantEvaluated: true},
		{name: "ready", operations: 4, active: 4, valid: 4, wantStatus: "READY", wantReason: "RESOURCE_ALLOCATION_VALIDATED", wantEvaluated: true},
		{name: "invalid", operations: 4, active: 4, valid: 3, invalid: 1, wantStatus: "BLOCKED", wantReason: "RESOURCE_ALLOCATION_INVALID", wantBlocking: true, wantEvaluated: true},
		{name: "not applicable", wantStatus: "NOT_APPLICABLE", wantReason: "WORK_ORDER_HAS_NO_RESOURCE_OPERATIONS"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			dimensions := buildResourceEvaluationDimensions(test.operations, test.active, test.valid, test.invalid, test.warnings, &now)
			if len(dimensions) != 5 {
				t.Fatalf("expected five resource dimensions, got %d", len(dimensions))
			}
			for _, dimension := range dimensions {
				if dimension["status"] != test.wantStatus || dimension["reason_code"] != test.wantReason || dimension["blocking"] != test.wantBlocking {
					t.Fatalf("unexpected dimension state: %#v", dimension)
				}
				if (dimension["evaluated_at"] != nil) != test.wantEvaluated {
					t.Fatalf("unexpected evaluated_at for %s: %#v", test.name, dimension["evaluated_at"])
				}
			}
		})
	}
}
