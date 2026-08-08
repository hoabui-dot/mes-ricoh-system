package usecase

import "testing"

func contractLine(id, role string, priority int, candidateCounts ...int) productionLineReadinessContract {
	operations := make([]operationLineReadinessContract, 0, len(candidateCounts))
	for index, count := range candidateCounts {
		operations = append(operations, operationLineReadinessContract{
			RoutingOperationID: string(rune('A' + index)),
			OperationCode:      string(rune('A' + index)),
			Mandatory:          true,
			FeasibleCandidates: count,
		})
	}
	return productionLineReadinessContract{LineID: id, LineCode: id, Role: role, Priority: priority, Operations: operations}
}

func TestTwoLineContractOneFeasibleCandidateIsEnough(t *testing.T) {
	result := evaluateTwoLineContract([]productionLineReadinessContract{contractLine("LINE-1", "PRIMARY", 1, 1, 2, 1)})
	if result.Status != lineSelectionContractReady || result.SelectedLineID != "LINE-1" {
		t.Fatalf("one candidate for every mandatory operation must select the line: %#v", result)
	}
}

func TestTwoLineContractZeroCandidatesBlocksOperationAndLine(t *testing.T) {
	result := evaluateTwoLineContract([]productionLineReadinessContract{contractLine("LINE-1", "PRIMARY", 1, 1, 0, 2)})
	if result.Status != lineSelectionContractResourceHold {
		t.Fatalf("zero candidates must block the line: %#v", result)
	}
	operation := result.EvaluatedLines[0].Operations[1]
	if operation.Status != lineReadinessBlocked || len(operation.BlockerCodes) != 1 || result.EvaluatedLines[0].Status != lineReadinessBlocked {
		t.Fatalf("blocked evidence is incomplete: %#v", result.EvaluatedLines[0])
	}
}

func TestTwoLineContractBlockedMandatoryOperationBlocksOtherwiseReadyLine(t *testing.T) {
	line := contractLine("LINE-1", "PRIMARY", 1, 3, 0, 4)
	line.Operations[1].BlockerCodes = []string{"MACHINE_REQUIREMENT_NOT_SATISFIED"}
	result := evaluateTwoLineContract([]productionLineReadinessContract{line})
	if result.EvaluatedLines[0].Status != lineReadinessBlocked || result.EvaluatedLines[0].BlockerCodes[0] != "MACHINE_REQUIREMENT_NOT_SATISFIED" {
		t.Fatalf("one blocked mandatory operation must block the complete line: %#v", result)
	}
}

func TestTwoLineContractPrimaryBlockedEvaluatesAndSelectsBackup(t *testing.T) {
	result := evaluateTwoLineContract([]productionLineReadinessContract{
		contractLine("LINE-2", "BACKUP", 2, 1, 1),
		contractLine("LINE-1", "PRIMARY", 1, 1, 0),
	})
	if result.Status != lineSelectionContractReady || result.SelectedLineID != "LINE-2" || result.FallbackReason != "PRIMARY_LINE_BLOCKED" {
		t.Fatalf("blocked Primary must fall back to feasible Backup: %#v", result)
	}
	if len(result.EvaluatedLines) != 2 || result.EvaluatedLines[0].LineID != "LINE-1" {
		t.Fatalf("line ordering or evaluation evidence is not deterministic: %#v", result.EvaluatedLines)
	}
}

func TestTwoLineContractNoFeasibleLineProducesResourceHold(t *testing.T) {
	result := evaluateTwoLineContract([]productionLineReadinessContract{
		contractLine("LINE-1", "PRIMARY", 1, 0),
		contractLine("LINE-2", "BACKUP", 2, 0),
	})
	if result.Status != lineSelectionContractResourceHold || result.ReasonCode != "NO_COMPLETE_FEASIBLE_LINE" || result.SelectedLineID != "" {
		t.Fatalf("all blocked lines must produce RESOURCE_HOLD: %#v", result)
	}
}

func TestTwoLineDimensionPolicyIsExplicitForRequiredDimensions(t *testing.T) {
	required := []string{"eligibility", "work_centers", "workstations", "assignments", "equipment_units", "machine_status", "capability", "machine_requirements", "calendar_shift", "production_standard", "capacity", "reservation_conflict", "worker_skill_labor"}
	for _, dimension := range required {
		if _, exists := twoLineDimensionPolicy[dimension]; !exists {
			t.Fatalf("dimension %s has no explicit policy", dimension)
		}
	}
}
