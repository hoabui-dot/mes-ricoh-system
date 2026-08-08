package usecase

import "sort"

type lineReadinessStatus string

const (
	lineReadinessReady   lineReadinessStatus = "READY"
	lineReadinessBlocked lineReadinessStatus = "BLOCKED"
)

type lineSelectionContractStatus string

const (
	lineSelectionContractReady        lineSelectionContractStatus = "READY"
	lineSelectionContractResourceHold lineSelectionContractStatus = "RESOURCE_HOLD"
)

type lineDimensionPolicy string

const (
	lineDimensionStructuralBlocking lineDimensionPolicy = "STRUCTURAL_BLOCKING"
	lineDimensionRuntimeBlocking    lineDimensionPolicy = "RUNTIME_BLOCKING"
	lineDimensionWarningOnly        lineDimensionPolicy = "WARNING_ONLY"
	lineDimensionDeferred           lineDimensionPolicy = "DEFERRED_TO_EXACT_ALLOCATION"
	lineDimensionNotApplicable      lineDimensionPolicy = "NOT_APPLICABLE"
)

var twoLineDimensionPolicy = map[string]lineDimensionPolicy{
	"eligibility":          lineDimensionStructuralBlocking,
	"work_centers":         lineDimensionStructuralBlocking,
	"workstations":         lineDimensionRuntimeBlocking,
	"assignments":          lineDimensionRuntimeBlocking,
	"equipment_units":      lineDimensionRuntimeBlocking,
	"machine_status":       lineDimensionRuntimeBlocking,
	"capability":           lineDimensionStructuralBlocking,
	"machine_requirements": lineDimensionRuntimeBlocking,
	"calendar_shift":       lineDimensionRuntimeBlocking,
	"production_standard":  lineDimensionStructuralBlocking,
	"capacity":             lineDimensionRuntimeBlocking,
	"reservation_conflict": lineDimensionRuntimeBlocking,
	"worker_skill_labor":   lineDimensionDeferred,
}

type operationLineReadinessContract struct {
	RoutingOperationID string              `json:"routing_operation_id"`
	OperationID        string              `json:"operation_id"`
	OperationCode      string              `json:"operation_code"`
	OperationName      string              `json:"operation_name,omitempty"`
	WorkCenterID       string              `json:"work_center_id"`
	Mandatory          bool                `json:"mandatory"`
	TotalCandidates    int                 `json:"total_candidate_count"`
	FeasibleCandidates int                 `json:"feasible_candidate_count"`
	CandidateIDs       []string            `json:"candidate_ids,omitempty"`
	ExcludedReasons    map[string]int      `json:"excluded_candidate_reasons,omitempty"`
	BlockerCodes       []string            `json:"blocker_codes,omitempty"`
	Status             lineReadinessStatus `json:"status"`
}

type productionLineReadinessContract struct {
	LineID          string                           `json:"production_line_id"`
	LineCode        string                           `json:"production_line_code"`
	LineName        map[string]string                `json:"production_line_name_i18n,omitempty"`
	Role            string                           `json:"selection_role"`
	Priority        int                              `json:"priority"`
	Operations      []operationLineReadinessContract `json:"operations"`
	BlockerCodes    []string                         `json:"blocker_codes,omitempty"`
	Status          lineReadinessStatus              `json:"status"`
	SelectionReason string                           `json:"selection_reason"`
}

type lineSelectionContractResult struct {
	Status         lineSelectionContractStatus       `json:"status"`
	SelectedLineID string                            `json:"selected_production_line_id,omitempty"`
	SelectedRole   string                            `json:"selected_role,omitempty"`
	ReasonCode     string                            `json:"reason_code"`
	FallbackReason string                            `json:"fallback_reason,omitempty"`
	EvaluatedLines []productionLineReadinessContract `json:"evaluated_lines"`
}

// evaluateTwoLineContract is the side-effect-free whole-WO decision contract.
// Callers must provide candidate evidence scoped to each line.
func evaluateTwoLineContract(lines []productionLineReadinessContract) lineSelectionContractResult {
	ordered := append([]productionLineReadinessContract(nil), lines...)
	sort.SliceStable(ordered, func(i, j int) bool {
		iRole, jRole := lineRoleOrder(ordered[i].Role), lineRoleOrder(ordered[j].Role)
		if iRole != jRole {
			return iRole < jRole
		}
		if ordered[i].Priority != ordered[j].Priority {
			return ordered[i].Priority < ordered[j].Priority
		}
		if ordered[i].LineCode != ordered[j].LineCode {
			return ordered[i].LineCode < ordered[j].LineCode
		}
		return ordered[i].LineID < ordered[j].LineID
	})

	evaluated := make([]productionLineReadinessContract, 0, len(ordered))
	primaryBlocked := false
	for _, line := range ordered {
		line.Status = lineReadinessReady
		line.BlockerCodes = nil
		for index := range line.Operations {
			operation := &line.Operations[index]
			operation.Status = lineReadinessReady
			if operation.Mandatory && operation.FeasibleCandidates < 1 {
				operation.Status = lineReadinessBlocked
				line.Status = lineReadinessBlocked
				if len(operation.BlockerCodes) == 0 {
					operation.BlockerCodes = []string{"LINE_OPERATION_FEASIBLE_CANDIDATE_MISSING"}
				}
				line.BlockerCodes = appendUniqueStrings(line.BlockerCodes, operation.BlockerCodes...)
			}
		}

		if line.Status == lineReadinessReady {
			line.SelectionReason = "PRIMARY_LINE_READY"
			fallbackReason := ""
			if line.Role != "PRIMARY" {
				line.SelectionReason = "BACKUP_LINE_READY"
				if primaryBlocked {
					fallbackReason = "PRIMARY_LINE_BLOCKED"
				}
			}
			evaluated = append(evaluated, line)
			return lineSelectionContractResult{
				Status: lineSelectionContractReady, SelectedLineID: line.LineID,
				SelectedRole: line.Role, ReasonCode: line.SelectionReason,
				FallbackReason: fallbackReason, EvaluatedLines: evaluated,
			}
		}
		line.SelectionReason = "LINE_NOT_SELECTED_BLOCKED"
		if line.Role == "PRIMARY" {
			primaryBlocked = true
		}
		evaluated = append(evaluated, line)
	}

	reason := "NO_COMPLETE_FEASIBLE_LINE"
	if len(ordered) == 0 {
		reason = "NO_RELEASED_EFFECTIVE_LINE_ELIGIBILITY"
	}
	return lineSelectionContractResult{
		Status:         lineSelectionContractResourceHold,
		ReasonCode:     reason,
		EvaluatedLines: evaluated,
	}
}

func lineRoleOrder(role string) int {
	if role == "PRIMARY" {
		return 0
	}
	return 1
}

func appendUniqueStrings(values []string, additions ...string) []string {
	seen := make(map[string]struct{}, len(values)+len(additions))
	for _, value := range values {
		seen[value] = struct{}{}
	}
	for _, value := range additions {
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		values = append(values, value)
	}
	return values
}
