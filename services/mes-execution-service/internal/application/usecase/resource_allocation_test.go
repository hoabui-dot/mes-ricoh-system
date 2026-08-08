package usecase

import "testing"

func TestAsStringNilPointerIsEmpty(t *testing.T) {
	var value *string
	if got := asString(value); got != "" {
		t.Fatalf("expected nil string pointer to be empty, got %q", got)
	}
}

func TestAsStringPointerUsesValue(t *testing.T) {
	value := "shift-1"
	if got := asString(&value); got != value {
		t.Fatalf("expected %q, got %q", value, got)
	}
}

func TestProposalCandidateReadyRejectsCapacityConflict(t *testing.T) {
	candidate := map[string]interface{}{
		"readiness":          "Ready",
		"blocking_errors":    []interface{}{},
		"capacity_conflicts": []interface{}{map[string]interface{}{"code": "RESOURCE_CAPACITY_CONFLICT"}},
	}
	if proposalCandidateReady(candidate) {
		t.Fatal("candidate with an active capacity conflict must not be proposal-ready")
	}
}
