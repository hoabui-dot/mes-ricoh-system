//go:build integration

package events

import (
	"context"
	"sync"
	"testing"

	"github.com/mom-platform/mes-kiosk-gateway-service/internal/testsupport"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type relayCall struct {
	targetType, target, eventID, eventType string
}

type recordingRelay struct {
	mu    sync.Mutex
	calls []relayCall
}

func (r *recordingRelay) BroadcastToTerminalCode(_ context.Context, target, eventID, eventType string, _ interface{}) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls = append(r.calls, relayCall{"terminal", target, eventID, eventType})
	return nil
}

func (r *recordingRelay) BroadcastToWorkCenters(_ context.Context, targets []string, eventID, eventType string, _ interface{}) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, target := range targets {
		r.calls = append(r.calls, relayCall{"work_center", target, eventID, eventType})
	}
	return nil
}

func TestExecutionConsumerRoutingCoverageAndIdempotency(t *testing.T) {
	pool := testsupport.IsolatedPool(t)
	relay := &recordingRelay{}
	consumer := NewExecutionConsumer(nil, pool, relay)
	ctx := context.Background()

	demoDispatch := sharedkernel.CreateEventEnvelope("MES.Execution.OperationDispatchQueued.v1", "test", "", map[string]interface{}{
		"wo_id": "wo-demo", "dispatch_mode": "DEMO_SHARED_KIOSK", "execution_target_type": "MANUAL",
	})
	if err := consumer.processEvent(ctx, demoDispatch); err != nil {
		t.Fatal(err)
	}
	if len(relay.calls) != 1 || relay.calls[0].targetType != "terminal" || relay.calls[0].target != "KIOSK-DEMO-01" {
		t.Fatalf("demo dispatch escaped shared kiosk route: %+v", relay.calls)
	}
	if err := consumer.processEvent(ctx, demoDispatch); err != nil {
		t.Fatal(err)
	}
	if len(relay.calls) != 1 {
		t.Fatalf("duplicate event produced another relay: %+v", relay.calls)
	}

	normal := sharedkernel.CreateEventEnvelope("MES.Execution.OperationStarted.v1", "test", "", map[string]interface{}{
		"wo_id": "wo-production", "dispatch_mode": "WORK_CENTER", "work_center_id": "40000000-0000-0000-0000-000000000003",
	})
	if err := consumer.processEvent(ctx, normal); err != nil {
		t.Fatal(err)
	}
	if len(relay.calls) != 2 || relay.calls[1].targetType != "work_center" || relay.calls[1].target != "40000000-0000-0000-0000-000000000003" {
		t.Fatalf("production routing changed: %+v", relay.calls)
	}

	printDispatch := sharedkernel.CreateEventEnvelope("MES.Execution.OperationDispatchQueued.v1", "test", "", map[string]interface{}{
		"wo_id": "wo-demo", "dispatch_mode": "DEMO_SHARED_KIOSK", "execution_target_type": "PRINT_STATION",
	})
	if err := consumer.processEvent(ctx, printDispatch); err != nil {
		t.Fatal(err)
	}
	if len(relay.calls) != 2 {
		t.Fatalf("print dispatch was relayed as a manual card: %+v", relay.calls)
	}

	relayTypes := []string{
		"MES.Execution.OperationStarted.v1", "MES.Execution.OperationFinished.v1",
		"MES.Execution.OperationFailed.v1", "MES.Execution.OperationAborted.v1",
		"MES.Execution.WOStatusChanged.v1", "MES.Execution.WOCompleted.v1",
	}
	for _, eventType := range relayTypes {
		envelope := sharedkernel.CreateEventEnvelope(eventType, "test", "", map[string]interface{}{
			"wo_id": "wo-demo", "dispatch_mode": "DEMO_SHARED_KIOSK",
		})
		if err := consumer.processEvent(ctx, envelope); err != nil {
			t.Fatalf("%s relay failed: %v", eventType, err)
		}
	}
	if len(relay.calls) != 2+len(relayTypes) {
		t.Fatalf("event relay coverage mismatch: got %d calls", len(relay.calls))
	}
}
