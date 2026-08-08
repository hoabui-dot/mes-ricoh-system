package usecase

import (
	"context"
	"fmt"
	"testing"
	"time"
)

type fakeLinePlanner struct {
	responses map[string]map[string]interface{}
	calls     int
}

func (f *fakeLinePlanner) Readiness(_ context.Context, body map[string]interface{}, _ map[string]string) (map[string]interface{}, error) {
	f.calls++
	return f.responses[asString(body["routing_operation_id"])], nil
}

func (f *fakeLinePlanner) ShiftCandidates(_ context.Context, _ map[string]interface{}, _ map[string]string) (map[string]interface{}, error) {
	return map[string]interface{}{"data": map[string]interface{}{"candidates": []interface{}{map[string]interface{}{"shift_id": "shift-1"}}}}, nil
}

type fakeCapacityInspector struct{ blocked map[string][]string }

func (f fakeCapacityInspector) BlockingReasons(_ context.Context, candidate map[string]interface{}, _, _ time.Time) ([]string, error) {
	return f.blocked[feasibilityCandidateID(candidate)], nil
}

func readinessCandidate(id string, reasons ...string) map[string]interface{} {
	errors := make([]interface{}, 0, len(reasons))
	for _, reason := range reasons {
		errors = append(errors, map[string]interface{}{"code": reason})
	}
	status := "Ready"
	if len(reasons) > 0 {
		status = "Blocked"
	}
	return map[string]interface{}{"assignment": map[string]interface{}{"id": id}, "readiness": status, "blocking_errors": errors, "calculation": map[string]interface{}{"estimated_duration_min": float64(10)}}
}

func feasibilityInput(operationIDs ...string) lineFeasibilityInput {
	operations := make([]lineFeasibilityOperation, 0, len(operationIDs))
	for index, id := range operationIDs {
		operations = append(operations, lineFeasibilityOperation{RoutingOperationID: id, OperationID: fmt.Sprintf("op-%d", index), OperationCode: id, OperationName: id, WorkCenterID: "wc-1", Mandatory: true})
	}
	return lineFeasibilityInput{Line: lineEligibility{LineID: "line-1", Code: "LINE-1", Role: "PRIMARY", Priority: 1}, ProductRevisionID: "rev-1", SiteID: "site-1", ShiftID: "shift-1", Quantity: 100, PlannedStart: time.Date(2026, 8, 7, 0, 0, 0, 0, time.UTC), Operations: operations}
}

func TestLineFeasibilityOneFailedCandidateDoesNotBlockReadyAlternative(t *testing.T) {
	planner := &fakeLinePlanner{responses: map[string]map[string]interface{}{"rop-1": {"candidates": []interface{}{readinessCandidate("ra-bad", "WORKSTATION_INACTIVE"), readinessCandidate("ra-ready")}}}}
	line, err := newLineFeasibilityEvaluator(planner, nil).Evaluate(context.Background(), feasibilityInput("rop-1"))
	if err != nil || line.Status != lineReadinessReady || line.Operations[0].FeasibleCandidates != 1 || line.Operations[0].TotalCandidates != 2 {
		t.Fatalf("ready alternative must keep operation feasible: %#v %v", line, err)
	}
}

func TestLineFeasibilityEveryMandatoryOperationMustBeFeasible(t *testing.T) {
	planner := &fakeLinePlanner{responses: map[string]map[string]interface{}{
		"rop-1": {"candidates": []interface{}{readinessCandidate("ra-1")}},
		"rop-2": {"candidates": []interface{}{readinessCandidate("ra-2", "MACHINE_UNIT_UNAVAILABLE")}},
	}}
	line, err := newLineFeasibilityEvaluator(planner, nil).Evaluate(context.Background(), feasibilityInput("rop-1", "rop-2"))
	if err != nil || line.Status != lineReadinessBlocked || line.Operations[1].Status != lineReadinessBlocked {
		t.Fatalf("one blocked mandatory operation must block line: %#v %v", line, err)
	}
}

func TestLineFeasibilityApprovedExclusionReasons(t *testing.T) {
	cases := []string{"WORKSTATION_INACTIVE", "MACHINE_UNIT_UNAVAILABLE", "RESOURCE_ASSIGNMENT_EXPIRED", "CAPABILITY_MISMATCH", "CALENDAR_UNAVAILABLE"}
	for _, reason := range cases {
		t.Run(reason, func(t *testing.T) {
			planner := &fakeLinePlanner{responses: map[string]map[string]interface{}{"rop-1": {"candidates": []interface{}{readinessCandidate("ra-1", reason)}}}}
			line, err := newLineFeasibilityEvaluator(planner, nil).Evaluate(context.Background(), feasibilityInput("rop-1"))
			if err != nil || line.Status != lineReadinessBlocked || line.Operations[0].ExcludedReasons[reason] != 1 {
				t.Fatalf("reason missing: %#v %v", line, err)
			}
		})
	}
}

func TestLineFeasibilityCapacityAndReservationConflictBlockCandidate(t *testing.T) {
	for _, reason := range []string{"RESOURCE_CAPACITY_EXHAUSTED", "RESOURCE_RESERVATION_CONFLICT"} {
		planner := &fakeLinePlanner{responses: map[string]map[string]interface{}{"rop-1": {"candidates": []interface{}{readinessCandidate("ra-1")}}}}
		line, err := newLineFeasibilityEvaluator(planner, fakeCapacityInspector{blocked: map[string][]string{"ra-1": {reason}}}).Evaluate(context.Background(), feasibilityInput("rop-1"))
		if err != nil || line.Status != lineReadinessBlocked || line.Operations[0].ExcludedReasons[reason] != 1 {
			t.Fatalf("capacity reason missing: %#v %v", line, err)
		}
	}
}

func TestLineFeasibilityOutsideScopeIsNeverConsidered(t *testing.T) {
	planner := &fakeLinePlanner{responses: map[string]map[string]interface{}{"rop-1": {"candidates": []interface{}{readinessCandidate("in-scope")}, "blocking_errors": []interface{}{map[string]interface{}{"code": "OUTSIDE_LINE_SCOPE_EXCLUDED"}}}}}
	line, err := newLineFeasibilityEvaluator(planner, nil).Evaluate(context.Background(), feasibilityInput("rop-1"))
	if err != nil || line.Operations[0].TotalCandidates != 1 || line.Operations[0].CandidateIDs[0] != "in-scope" {
		t.Fatalf("out-of-scope resource was considered: %#v %v", line, err)
	}
}

func TestLineFeasibilityProbeHasNoMutationSurface(t *testing.T) {
	planner := &fakeLinePlanner{responses: map[string]map[string]interface{}{"rop-1": {"candidates": []interface{}{readinessCandidate("ra-1")}}}}
	_, err := newLineFeasibilityEvaluator(planner, nil).Evaluate(context.Background(), feasibilityInput("rop-1"))
	if err != nil || planner.calls != 1 {
		t.Fatalf("read-only readiness probe was not used exactly once: %v calls=%d", err, planner.calls)
	}
}
