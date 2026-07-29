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
