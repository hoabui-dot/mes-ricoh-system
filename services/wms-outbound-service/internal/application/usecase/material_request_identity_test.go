package usecase

import "testing"

func TestMaterialRequestIdentityIsCanonical(t *testing.T) {
	base := RequestInput{WOID: "wo", WorkCenterRef: "wc", ItemRevisionID: "item", RequiredQty: 101.5}
	if materialRequestIdentity(base) != "wo:wc:item:101.500000" {
		t.Fatalf("unexpected canonical identity: %s", materialRequestIdentity(base))
	}
	otherCenter := base
	otherCenter.WorkCenterRef = "wc-2"
	if materialRequestIdentity(base) == materialRequestIdentity(otherCenter) {
		t.Fatal("different work centers must not share an idempotency identity")
	}
	otherQuantity := base
	otherQuantity.RequiredQty = 101.501
	if materialRequestIdentity(base) == materialRequestIdentity(otherQuantity) {
		t.Fatal("different quantities must not share an idempotency identity")
	}
}
