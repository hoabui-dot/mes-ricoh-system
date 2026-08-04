package usecase

import (
	"testing"
	"time"
)

func TestAggregateLineEvaluationRequiresMandatoryEvidence(t *testing.T) {
	dimensions := []lineEvaluationDimension{
		{DimensionCode: "eligibility", Status: "READY"},
		{DimensionCode: "work_centers", Status: "READY"},
		{DimensionCode: "capability", Status: "READY"},
		{DimensionCode: "production_standard", Status: "READY"},
		{DimensionCode: "calendar_shift", Status: "READY"},
		{DimensionCode: "capacity", Status: "UNKNOWN"},
		{DimensionCode: "workstations", Status: "DEFERRED"},
	}
	if got := aggregateLineEvaluation(dimensions); got != "Blocked" {
		t.Fatalf("UNKNOWN mandatory dimension must block READY, got %s", got)
	}
	dimensions[5].Status = "NOT_EVALUATED"
	if got := aggregateLineEvaluation(dimensions); got != "Blocked" {
		t.Fatalf("NOT_EVALUATED mandatory dimension must block READY, got %s", got)
	}
	dimensions = dimensions[:5]
	if got := aggregateLineEvaluation(dimensions); got != "Blocked" {
		t.Fatalf("missing mandatory dimension must block READY, got %s", got)
	}
}

func TestAggregateLineEvaluationAllowsExplicitDeferredAndWarningOnlyDimensions(t *testing.T) {
	dimensions := []lineEvaluationDimension{
		{DimensionCode: "eligibility", Status: "READY"},
		{DimensionCode: "work_centers", Status: "READY"},
		{DimensionCode: "capability", Status: "READY"},
		{DimensionCode: "production_standard", Status: "READY"},
		{DimensionCode: "calendar_shift", Status: "READY"},
		{DimensionCode: "capacity", Status: "NOT_APPLICABLE", ReasonCode: "NO_COARSE_CAPACITY_CONSTRAINT"},
		{DimensionCode: "workstations", Status: "DEFERRED"},
		{DimensionCode: "worker_skill_labor", Status: "WARNING"},
	}
	if got := aggregateLineEvaluation(dimensions); got != "Ready" {
		t.Fatalf("explicit non-selection-stage dimensions may coexist with READY, got %s", got)
	}
}

func TestBuildLineEvaluationExplainsDeferredAndBlockedStages(t *testing.T) {
	line := lineEligibility{LineID: "line-1", Code: "LINE-1", Role: "PRIMARY", Priority: 1}
	blockers := []map[string]interface{}{{"code": "LINE_PRODUCTION_STANDARD_MISSING", "operation_code": "PACKING"}}
	evaluation := buildLineEvaluation(line, blockers, "", time.Date(2026, time.August, 4, 8, 0, 0, 0, time.UTC))
	if evaluation["status"] != "Blocked" {
		t.Fatalf("expected blocked line, got %v", evaluation["status"])
	}
	dimensions := evaluation["dimensions"].([]lineEvaluationDimension)
	statuses := map[string]string{}
	for _, dimension := range dimensions {
		statuses[dimension.DimensionCode] = dimension.Status
		if dimension.Status == "DEFERRED" && dimension.EvaluationStage != "RESOURCE_ALLOCATION" {
			t.Fatalf("deferred dimension %s has no later stage", dimension.DimensionCode)
		}
	}
	if statuses["production_standard"] != "BLOCKED" || statuses["calendar_shift"] != "NOT_EVALUATED" || statuses["final_result"] != "BLOCKED" {
		t.Fatalf("unexpected blocked aggregation: %#v", statuses)
	}
	selectionReason := dimensions[len(dimensions)-1]
	if selectionReason.DimensionCode != "selection_reason" || selectionReason.Status != "NOT_APPLICABLE" || selectionReason.ReasonCode != "LINE_NOT_SELECTED_BLOCKED" {
		t.Fatalf("not-applicable selection reason must explain why it is not applicable: %#v", selectionReason)
	}
}
