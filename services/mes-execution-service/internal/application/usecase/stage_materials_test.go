package usecase

import "testing"

func TestAggregateStageDemandsGroupsOnlySameItemAndWorkCenter(t *testing.T) {
	demands, order := aggregateStageDemands([]stageRequirement{
		{requirementID: "r1", itemRevisionID: "item-a", workCenterID: "wc-1", quantity: 2},
		{requirementID: "r2", itemRevisionID: "item-a", workCenterID: "wc-1", quantity: 3},
		{requirementID: "r3", itemRevisionID: "item-a", workCenterID: "wc-2", quantity: 4},
		{requirementID: "r4", itemRevisionID: "item-b", workCenterID: "wc-1", quantity: 5},
	})
	if len(order) != 3 {
		t.Fatalf("expected three logical WMS demands, got %d", len(order))
	}
	if got := demands["item-a:wc-1"]; got.quantity != 5 || len(got.requirementIDs) != 2 {
		t.Fatalf("expected duplicate MBOM lines to aggregate to qty 5 and two requirement IDs, got %#v", got)
	}
	if demands["item-a:wc-2"].quantity != 4 || demands["item-b:wc-1"].quantity != 5 {
		t.Fatalf("different item/work-center combinations must remain separate: %#v", demands)
	}
}
