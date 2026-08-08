package usecase

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

type LineResourceReadinessClient interface {
	Readiness(context.Context, map[string]interface{}, map[string]string) (map[string]interface{}, error)
	ShiftCandidates(context.Context, map[string]interface{}, map[string]string) (map[string]interface{}, error)
}

type lineCapacityInspector interface {
	BlockingReasons(context.Context, map[string]interface{}, time.Time, time.Time) ([]string, error)
}

type lineFeasibilityOperation struct {
	RoutingOperationID string
	OperationID        string
	OperationCode      string
	OperationName      string
	WorkCenterID       string
	Mandatory          bool
}

type lineFeasibilityInput struct {
	Line              lineEligibility
	ProductRevisionID string
	SiteID            string
	ShiftID           string
	Quantity          float64
	PlannedStart      time.Time
	Operations        []lineFeasibilityOperation
	UserID            string
	TraceID           string
}

type lineFeasibilityEvaluator struct {
	planner  LineResourceReadinessClient
	capacity lineCapacityInspector
}

func newLineFeasibilityEvaluator(planner LineResourceReadinessClient, capacity lineCapacityInspector) *lineFeasibilityEvaluator {
	return &lineFeasibilityEvaluator{planner: planner, capacity: capacity}
}

type lineCapacityQuery interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

type postgresLineCapacityInspector struct{ query lineCapacityQuery }

func newPostgresLineCapacityInspector(query lineCapacityQuery) postgresLineCapacityInspector {
	return postgresLineCapacityInspector{query: query}
}

func (i postgresLineCapacityInspector) BlockingReasons(ctx context.Context, candidate map[string]interface{}, start, end time.Time) ([]string, error) {
	reasons := []string{}
	for _, resource := range []struct{ resourceType, id string }{
		{"Workstation", asString(nested(candidate, "workstation")["id"])},
		{"Equipment", asString(nested(candidate, "equipment")["id"])},
	} {
		if resource.id == "" {
			continue
		}
		var count int
		if err := i.query.QueryRow(ctx, `SELECT COUNT(*) FROM wo_capacity_reservation WHERE resource_type=$1 AND resource_id=$2 AND status IN ('Tentative','Committed') AND start_at < $4 AND end_at > $3`, resource.resourceType, resource.id, start, end).Scan(&count); err != nil {
			return nil, err
		}
		if count > 0 {
			reasons = appendUniqueStrings(reasons, "RESOURCE_RESERVATION_CONFLICT")
		}
	}
	return reasons, nil
}

// Evaluate is a read-only probe. It never creates allocations, reservations,
// Work Order mutations, or events.
func (e *lineFeasibilityEvaluator) Evaluate(ctx context.Context, input lineFeasibilityInput) (productionLineReadinessContract, error) {
	line := productionLineReadinessContract{
		LineID: input.Line.LineID, LineCode: input.Line.Code, Role: input.Line.Role,
		Priority: input.Line.Priority, Operations: make([]operationLineReadinessContract, 0, len(input.Operations)),
		Status: lineReadinessReady,
	}
	cursor := input.PlannedStart
	for _, operation := range input.Operations {
		request := map[string]interface{}{
			"site_id": input.SiteID, "product_revision_id": input.ProductRevisionID,
			"routing_operation_id": operation.RoutingOperationID, "work_center_id": operation.WorkCenterID,
			"production_line_id": input.Line.LineID, "quantity": input.Quantity,
			"planned_date": cursor.UTC().Format("2006-01-02"), "shift_id": input.ShiftID,
		}
		payload, err := e.planner.Readiness(ctx, request, map[string]string{"X-User-ID": input.UserID, "X-Trace-ID": input.TraceID})
		if err != nil {
			return productionLineReadinessContract{}, fmt.Errorf("LINE_FEASIBILITY_READINESS_FAILED: %w", err)
		}
		evidence, duration, err := e.evaluateOperation(ctx, payload, operation, cursor)
		if err != nil {
			return productionLineReadinessContract{}, err
		}
		line.Operations = append(line.Operations, evidence)
		if evidence.Mandatory && evidence.FeasibleCandidates == 0 {
			line.Status = lineReadinessBlocked
			line.BlockerCodes = appendUniqueStrings(line.BlockerCodes, evidence.BlockerCodes...)
		}
		if duration < time.Minute {
			duration = time.Minute
		}
		cursor = cursor.Add(duration)
	}
	if line.Status == lineReadinessReady {
		line.SelectionReason = "LINE_COMPLETE_FEASIBILITY_READY"
	} else {
		line.SelectionReason = "LINE_COMPLETE_FEASIBILITY_BLOCKED"
	}
	return line, nil
}

func (e *lineFeasibilityEvaluator) evaluateOperation(ctx context.Context, payload map[string]interface{}, operation lineFeasibilityOperation, start time.Time) (operationLineReadinessContract, time.Duration, error) {
	evidence := operationLineReadinessContract{
		RoutingOperationID: operation.RoutingOperationID, OperationID: operation.OperationID,
		OperationCode: operation.OperationCode, OperationName: operation.OperationName,
		WorkCenterID: operation.WorkCenterID, Mandatory: operation.Mandatory,
		Status: lineReadinessBlocked, ExcludedReasons: map[string]int{},
	}
	candidates := mapSlice(payload["candidates"])
	evidence.TotalCandidates = len(candidates)
	maxDuration := time.Minute
	for _, candidate := range candidates {
		duration := candidateDuration(candidate)
		if duration > maxDuration {
			maxDuration = duration
		}
		reasons := candidateBlockingReasonCodes(candidate)
		if len(reasons) == 0 && e.capacity != nil {
			capacityReasons, err := e.capacity.BlockingReasons(ctx, candidate, start, start.Add(duration))
			if err != nil {
				return evidence, 0, fmt.Errorf("LINE_FEASIBILITY_CAPACITY_FAILED: %w", err)
			}
			reasons = append(reasons, capacityReasons...)
		}
		if len(reasons) == 0 && proposalCandidateReady(candidate) {
			evidence.FeasibleCandidates++
			evidence.CandidateIDs = append(evidence.CandidateIDs, feasibilityCandidateID(candidate))
			continue
		}
		if len(reasons) == 0 {
			reasons = []string{"RESOURCE_READY_CANDIDATE_MISSING"}
		}
		for _, reason := range reasons {
			evidence.ExcludedReasons[reason]++
		}
	}
	if evidence.FeasibleCandidates > 0 {
		evidence.Status = lineReadinessReady
		evidence.BlockerCodes = nil
	} else {
		for _, errorItem := range mapSlice(payload["blocking_errors"]) {
			if code := asString(errorItem["code"]); code != "" {
				evidence.ExcludedReasons[code]++
			}
		}
		keys := make([]string, 0, len(evidence.ExcludedReasons))
		for code := range evidence.ExcludedReasons {
			keys = append(keys, code)
		}
		sort.Strings(keys)
		evidence.BlockerCodes = append(keys, "LINE_OPERATION_FEASIBLE_CANDIDATE_MISSING")
	}
	return evidence, maxDuration, nil
}

func mapSlice(value interface{}) []map[string]interface{} {
	result := []map[string]interface{}{}
	switch items := value.(type) {
	case []interface{}:
		for _, item := range items {
			if row, ok := item.(map[string]interface{}); ok {
				result = append(result, row)
			}
		}
	case []map[string]interface{}:
		result = append(result, items...)
	}
	return result
}

func candidateBlockingReasonCodes(candidate map[string]interface{}) []string {
	reasons := []string{}
	for _, key := range []string{"blocking_errors", "capacity_conflicts"} {
		for _, item := range mapSlice(candidate[key]) {
			if code := asString(item["code"]); code != "" {
				reasons = appendUniqueStrings(reasons, code)
			}
		}
	}
	return reasons
}

func feasibilityCandidateID(candidate map[string]interface{}) string {
	for _, key := range []string{"assignment", "workstation", "equipment", "machine_unit"} {
		if id := asString(nested(candidate, key)["id"]); id != "" {
			return id
		}
	}
	return asString(candidate["id"])
}

func candidateDuration(candidate map[string]interface{}) time.Duration {
	minutes := asFloat(candidate["estimated_duration_min"])
	if minutes <= 0 {
		minutes = asFloat(nested(candidate, "calculation")["estimated_duration_min"])
	}
	if minutes < 1 {
		minutes = 1
	}
	return time.Duration(minutes * float64(time.Minute))
}
