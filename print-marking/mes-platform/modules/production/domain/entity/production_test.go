package entity_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/production/domain/entity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── Operation Tests ──────────────────────────────────────────────────────────

func TestUnit_NewOperation_Success(t *testing.T) {
	rid := uuid.New()
	op, err := entity.NewOperation(rid, 1, "Plate Making", "Offset Press", 60, 1, 3, []string{"LO1", "ZP1"})
	require.NoError(t, err)
	assert.Equal(t, 1, op.Sequence)
	assert.Equal(t, "Plate Making", op.Name)
	assert.Equal(t, 60, op.EstimatedMinutes)
	assert.Equal(t, 1, op.MinOperators)
	assert.Equal(t, 3, op.MaxOperators)
	assert.Equal(t, []string{"LO1", "ZP1"}, op.RequiredSkills)
}

func TestUnit_NewOperation_Validation(t *testing.T) {
	rid := uuid.New()

	_, err := entity.NewOperation(rid, 0, "Bad Seq", "", 30, 1, 1, nil)
	assert.ErrorContains(t, err, "sequence must be greater than 0")

	_, err = entity.NewOperation(rid, 1, "", "", 30, 1, 1, nil)
	assert.ErrorContains(t, err, "name is required")

	_, err = entity.NewOperation(rid, 1, "Op", "", -5, 1, 1, nil)
	assert.ErrorContains(t, err, "cannot be negative")

	_, err = entity.NewOperation(rid, 1, "Op", "", 30, 0, 1, nil)
	assert.ErrorContains(t, err, "min_operators must be at least 1")

	_, err = entity.NewOperation(rid, 1, "Op", "", 30, 3, 2, nil)
	assert.ErrorContains(t, err, "max_operators")
}

// ─── Routing Tests ────────────────────────────────────────────────────────────

func TestUnit_NewRouting_Success(t *testing.T) {
	rid := uuid.New()
	ops := []entity.Operation{
		mustOp(rid, 1, "Plate Making", 60, 1, 2),
		mustOp(rid, 2, "Printing", 90, 2, 4),
		mustOp(rid, 3, "Finishing", 30, 1, 2),
	}
	r, err := entity.NewRouting("Standard Offset", "Standard offset print process", ops)
	require.NoError(t, err)
	assert.Equal(t, "Standard Offset", r.Name)
	assert.Equal(t, 3, len(r.Operations))
	assert.Equal(t, 180, r.TotalEstimatedMinutes())
}

func TestUnit_NewRouting_Validation(t *testing.T) {
	_, err := entity.NewRouting("", "desc", []entity.Operation{mustOp(uuid.New(), 1, "Op", 30, 1, 1)})
	assert.ErrorContains(t, err, "name is required")

	_, err = entity.NewRouting("Name", "desc", []entity.Operation{})
	assert.ErrorContains(t, err, "at least one operation")

	// Duplicate sequence
	rid := uuid.New()
	ops := []entity.Operation{
		mustOp(rid, 1, "Op1", 30, 1, 1),
		mustOp(rid, 1, "Op2", 30, 1, 1), // same sequence
	}
	_, err = entity.NewRouting("Dup", "", ops)
	assert.ErrorContains(t, err, "duplicate operation sequence")
}

// ─── Production Order Tests ───────────────────────────────────────────────────

func TestUnit_NewProductionOrder_Success(t *testing.T) {
	due := time.Now().Add(24 * time.Hour)
	wfID := uuid.New()
	po, err := entity.NewProductionOrder("PO-001", "Won Seal Customer", "Offset Print Job", "A", &wfID, 500, 80, &due, "Rush order")
	require.NoError(t, err)
	assert.Equal(t, "PO-001", po.OrderNumber)
	assert.Equal(t, entity.OrderStatusDraft, po.Status)
	assert.Equal(t, 80, po.Priority)

	events := po.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.production.ProductionOrderCreated", events[0].EventName())
}

func TestUnit_ProductionOrder_Validation(t *testing.T) {
	wfID := uuid.New()
	_, err := entity.NewProductionOrder("", "Won Seal Customer", "Product", "A", &wfID, 1, 50, nil, "")
	assert.ErrorContains(t, err, "order number is required")

	_, err = entity.NewProductionOrder("PO-X", "Won Seal Customer", "", "A", &wfID, 1, 50, nil, "")
	assert.ErrorContains(t, err, "product is required")

	_, err = entity.NewProductionOrder("PO-X", "Won Seal Customer", "Product", "A", &wfID, 0, 50, nil, "")
	assert.ErrorContains(t, err, "quantity must be greater than 0")

	_, err = entity.NewProductionOrder("PO-X", "Won Seal Customer", "Product", "A", &wfID, 1, 0, nil, "")
	assert.ErrorContains(t, err, "priority must be between 1 and 100")

	_, err = entity.NewProductionOrder("PO-X", "Won Seal Customer", "Product", "A", &wfID, 1, 101, nil, "")
	assert.ErrorContains(t, err, "priority must be between 1 and 100")
}

func TestUnit_ProductionOrder_StatusLifecycle(t *testing.T) {
	wfID := uuid.New()
	po, _ := entity.NewProductionOrder("PO-001", "Won Seal Customer", "Print Job", "A", &wfID, 100, 50, nil, "")
	po.PullEvents() // clear creation event

	// draft → released
	err := po.Release()
	require.NoError(t, err)
	assert.Equal(t, entity.OrderStatusReleased, po.Status)
	events := po.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.production.ProductionOrderReleased", events[0].EventName())

	// released → in_progress
	err = po.Start()
	require.NoError(t, err)
	assert.Equal(t, entity.OrderStatusInProgress, po.Status)

	// in_progress → completed
	err = po.Complete()
	require.NoError(t, err)
	assert.Equal(t, entity.OrderStatusCompleted, po.Status)
	events = po.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.production.ProductionOrderCompleted", events[0].EventName())

	// Cannot release completed order
	err = po.Release()
	assert.ErrorContains(t, err, "draft order")
}

func TestUnit_ProductionOrder_Cancel(t *testing.T) {
	wfID := uuid.New()
	po, _ := entity.NewProductionOrder("PO-002", "Won Seal Customer", "Print Job", "A", &wfID, 100, 50, nil, "")
	po.PullEvents()

	err := po.Cancel()
	require.NoError(t, err)
	assert.Equal(t, entity.OrderStatusCancelled, po.Status)

	events := po.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.production.ProductionOrderCancelled", events[0].EventName())

	// Cannot cancel again
	err = po.Cancel()
	assert.Error(t, err)
}

// ─── Work Order Tests ─────────────────────────────────────────────────────────

func TestUnit_NewWorkOrder_Success(t *testing.T) {
	poID := uuid.New()
	rID := uuid.New()

	wo, err := entity.NewWorkOrder(poID, rID, 1)
	require.NoError(t, err)
	assert.Equal(t, entity.WorkOrderStatusPending, wo.Status)
	assert.Nil(t, wo.StartedAt)
	assert.Nil(t, wo.CompletedAt)

	events := wo.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.production.WorkOrderCreated", events[0].EventName())
}

func TestUnit_WorkOrder_Lifecycle(t *testing.T) {
	wo, _ := entity.NewWorkOrder(uuid.New(), uuid.New(), 1)
	wo.PullEvents()

	err := wo.Start()
	require.NoError(t, err)
	assert.Equal(t, entity.WorkOrderStatusInProgress, wo.Status)
	assert.NotNil(t, wo.StartedAt)
	events := wo.PullEvents()
	assert.Equal(t, "mes.production.WorkOrderStarted", events[0].EventName())

	err = wo.Complete()
	require.NoError(t, err)
	assert.Equal(t, entity.WorkOrderStatusCompleted, wo.Status)
	assert.NotNil(t, wo.CompletedAt)
	events = wo.PullEvents()
	assert.Equal(t, "mes.production.WorkOrderCompleted", events[0].EventName())

	// Cannot start completed work order
	err = wo.Start()
	assert.Error(t, err)
}

func TestUnit_WorkOrder_Cancel(t *testing.T) {
	wo, _ := entity.NewWorkOrder(uuid.New(), uuid.New(), 2)
	wo.PullEvents()

	err := wo.Cancel()
	require.NoError(t, err)
	assert.Equal(t, entity.WorkOrderStatusCancelled, wo.Status)

	// Cannot cancel again
	err = wo.Cancel()
	assert.Error(t, err)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func mustOp(routingID uuid.UUID, seq int, name string, estMins, minOps, maxOps int) entity.Operation {
	op, err := entity.NewOperation(routingID, seq, name, "Machine", estMins, minOps, maxOps, nil)
	if err != nil {
		panic(err)
	}
	return *op
}
