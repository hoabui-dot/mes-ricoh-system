package sharedkernel

import "testing"

func TestPartitionKeyFromPayloadPrefersAggregateID(t *testing.T) {
	if got := partitionKeyFromPayload([]byte(`{"aggregate_id":"aggregate-1","payload":{"aggregate_id":"payload-1"}}`), "event-1"); got != "aggregate-1" { t.Fatalf("got %q", got) }
}

func TestPartitionKeyFromPayloadFallsBackToPayloadAggregate(t *testing.T) {
	if got := partitionKeyFromPayload([]byte(`{"payload":{"aggregate_id":"payload-1"}}`), "event-1"); got != "payload-1" { t.Fatalf("got %q", got) }
}

func TestPartitionKeyFromPayloadFallsBackToEventID(t *testing.T) {
	if got := partitionKeyFromPayload([]byte(`{"payload":{}}`), "event-1"); got != "event-1" { t.Fatalf("got %q", got) }
}
