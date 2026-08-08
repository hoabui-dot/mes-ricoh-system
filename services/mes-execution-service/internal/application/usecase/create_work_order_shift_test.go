package usecase

import "testing"

func TestPlanningShiftIDsPreservesBackendOrderAndRemovesInvalidDuplicates(t *testing.T) {
	payload := map[string]interface{}{
		"data": map[string]interface{}{
			"candidates": []interface{}{
				map[string]interface{}{"shift_id": "shift-primary"},
				map[string]interface{}{"shift_id": ""},
				map[string]interface{}{"shift_id": "shift-primary"},
				map[string]interface{}{"shift_id": "shift-backup"},
			},
		},
	}
	actual := planningShiftIDs(payload)
	if len(actual) != 2 || actual[0] != "shift-primary" || actual[1] != "shift-backup" {
		t.Fatalf("unexpected shift resolution order: %v", actual)
	}
}
