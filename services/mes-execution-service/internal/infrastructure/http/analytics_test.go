package http

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestParseAnalyticsRangeDefaultsToBoundedWindow(t *testing.T) {
	rangeWindow, err := parseAnalyticsRange(httptest.NewRequest("GET", "/analytics/overview", nil))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !rangeWindow.from.Before(rangeWindow.to) {
		t.Fatal("expected increasing range")
	}
	if rangeWindow.to.Sub(rangeWindow.from) > 31*24*time.Hour {
		t.Fatalf("range is not bounded: %s", rangeWindow.to.Sub(rangeWindow.from))
	}
}

func TestParseAnalyticsRangeRejectsInvalidAndUnboundedRequests(t *testing.T) {
	for _, target := range []string{
		"/analytics/overview?date_from=2026-08-10&date_to=2026-08-09",
		"/analytics/overview?date_from=2026-01-01&date_to=2027-01-02",
		"/analytics/overview?date_from=bad-date",
	} {
		if _, err := parseAnalyticsRange(httptest.NewRequest("GET", target, nil)); err == nil {
			t.Fatalf("expected rejection for %s", target)
		}
	}
}

func TestAnalyticsRatioZeroDenominator(t *testing.T) {
	if got := ratio(3, 0); got != 0 {
		t.Fatalf("expected zero ratio, got %v", got)
	}
	if got := ratio(1, 4); got != 0.25 {
		t.Fatalf("expected 0.25, got %v", got)
	}
}
