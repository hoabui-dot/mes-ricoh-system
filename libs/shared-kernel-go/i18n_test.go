package sharedkernel

import (
	"encoding/json"
	"testing"
)

func TestResolveLocalizedText(t *testing.T) {
	value := LocalizedText{"vi": "Sản phẩm", "en": "Item"}

	if got := ResolveLocalizedText(value, LocaleEN, DefaultLocale); got != "Item" {
		t.Fatalf("expected Item, got %q", got)
	}
	if got := ResolveLocalizedText(value, LocaleJA, DefaultLocale); got != "Sản phẩm" {
		t.Fatalf("expected Vietnamese fallback, got %q", got)
	}
}

func TestLocalizedTextJSONRoundTrip(t *testing.T) {
	raw := []byte(`{"vi":"Sản phẩm","en":"Item","ja":"品目","ko":"품목"}`)
	var value LocalizedText
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var roundTrip LocalizedText
	if err := json.Unmarshal(encoded, &roundTrip); err != nil {
		t.Fatalf("round-trip unmarshal: %v", err)
	}
	for key, expected := range value {
		if roundTrip[key] != expected {
			t.Fatalf("key %s: expected %q, got %q", key, expected, roundTrip[key])
		}
	}
}
