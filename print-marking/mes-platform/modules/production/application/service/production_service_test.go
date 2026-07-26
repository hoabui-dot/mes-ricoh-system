package service_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/production/application/dto"
	"github.com/nd/mes-platform/modules/production/application/service"
	"github.com/nd/mes-platform/modules/production/domain/entity"
	"github.com/nd/mes-platform/modules/production/domain/repository"
	"github.com/nd/mes-platform/modules/production/infrastructure/model"
	"github.com/nd/mes-platform/modules/production/infrastructure/persistence"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/outbox"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type MockOutboxRepository struct {
	Events []*outbox.Event
}

func (m *MockOutboxRepository) Save(_ context.Context, event *outbox.Event) error {
	m.Events = append(m.Events, event)
	return nil
}

type MockGatewayClient struct {
	SendFunc func(ctx context.Context, order *entity.ProductionOrder) (string, error)
}

func (m *MockGatewayClient) SendProductionOrder(ctx context.Context, order *entity.ProductionOrder) (string, error) {
	if m.SendFunc != nil {
		return m.SendFunc(ctx, order)
	}
	return "mock-gateway-order-id", nil
}

func (m *MockGatewayClient) SendWorkOrder(ctx context.Context, req any) (string, error) {
	return "mock-gateway-job-id", nil
}

func (m *MockGatewayClient) GetWorkOrderDetail(ctx context.Context, jobNo string) (map[string]interface{}, error) {
	return map[string]interface{}{"status": "COMPLETED"}, nil
}

func setupProductionSvc(t *testing.T) (*gorm.DB, *MockOutboxRepository, *service.ProductionService) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	err = db.AutoMigrate(
		&model.ProductionOrderModel{},
		&model.ProductionOrderEventModel{},
		&model.RoutingModel{},
		&model.OperationModel{},
		&model.WorkOrderModel{},
		&model.OutboxEventModel{},
		&model.DispatchPlanModel{},
		&model.WorkOrderTimelineModel{},
		&model.ProductionWorkflowModel{},
		&model.WorkflowOperationModel{},
		&model.WorkOrderOperationModel{},
	)
	require.NoError(t, err)

	orderRepo := persistence.NewGormProductionOrderRepository(db)
	workRepo := persistence.NewGormWorkOrderRepository(db)
	routingRepo := persistence.NewGormRoutingRepository(db)
	eventRepo := persistence.NewGormProductionOrderEventRepository(db)
	planRepo := persistence.NewGormDispatchPlanRepository(db)
	timelineRepo := persistence.NewGormWorkOrderTimelineRepository(db)
	workflowRepo := persistence.NewGormWorkflowRepository(db)
	outboxRepo := &MockOutboxRepository{}
	log := logger.NewNop()
	gatewayCli := &MockGatewayClient{}

	svc := service.NewProductionService(orderRepo, workRepo, routingRepo, eventRepo, outboxRepo, gatewayCli, planRepo, timelineRepo, workflowRepo, log)
	return db, outboxRepo, svc
}

func createTestWorkflow(t *testing.T, db *gorm.DB) string {
	workflowID := uuid.New()
	wf := model.ProductionWorkflowModel{
		ID:            workflowID,
		WorkflowCode:  "WF-TEST",
		WorkflowName:  "Test Workflow",
		ProductFamily: "Bearing Seal",
		Version:       1,
		Status:        "published",
		Operations: []model.WorkflowOperationModel{
			{
				ID:                   uuid.New(),
				WorkflowID:           workflowID,
				Sequence:             10,
				OperationName:        "Mixing",
				OperationType:        "MIX",
				EstimatedDuration:    60,
				RetryLimit:           3,
				IsRequired:           true,
				RequiresStation:      true,
				DefaultStationType:   "MIXING_STATION",
				QualityCheckRequired: false,
				MetadataJSON:         "{}",
				RequiredSkillsJSON:   "[]",
			},
			{
				ID:                   uuid.New(),
				WorkflowID:           workflowID,
				Sequence:             20,
				OperationName:        "Marking",
				OperationType:        "MARK",
				EstimatedDuration:    30,
				RetryLimit:           2,
				IsRequired:           true,
				RequiresStation:      true,
				DefaultStationType:   "MARK_STATION",
				QualityCheckRequired: true,
				MetadataJSON:         "{}",
				RequiredSkillsJSON:   "[]",
			},
		},
	}
	err := db.Create(&wf).Error
	require.NoError(t, err)
	return workflowID.String()
}

// ─── Production Order Tests ───────────────────────────────────────────────────

func TestProductionService_CreateProductionOrder(t *testing.T) {
	db, outboxRepo, svc := setupProductionSvc(t)
	wfID := createTestWorkflow(t, db)

	dueDate := "2026-08-01"
	order, err := svc.CreateProductionOrder(context.Background(), dto.CreateProductionOrderRequest{
		OrderNumber:     "PO-2026-001",
		Customer:        "Won Seal Customer",
		Product:         "Wedding Invitation Cards",
		ProductRevision: "A",
		WorkflowID:      &wfID,
		Quantity:        500,
		Priority:        80,
		DueDate:         &dueDate,
		Notes:           "High priority customer",
	})
	require.NoError(t, err)
	assert.Equal(t, "PO-2026-001", order.OrderNumber)
	assert.Equal(t, "draft", order.Status)
	assert.Equal(t, 80, order.Priority)

	// Outbox event published
	assert.Len(t, outboxRepo.Events, 1)
	assert.Equal(t, "mes.production.ProductionOrderCreated", outboxRepo.Events[0].EventName)

	// Conflict on duplicate order number
	_, err = svc.CreateProductionOrder(context.Background(), dto.CreateProductionOrderRequest{
		OrderNumber:     "PO-2026-001",
		Customer:        "Duplicate",
		Product:         "Duplicate",
		ProductRevision: "A",
		WorkflowID:      &wfID,
		Quantity:        1,
		Priority:        1,
	})
	assert.ErrorIs(t, err, service.ErrConflict)
}

func TestProductionService_OrderLifecycle(t *testing.T) {
	db, outboxRepo, svc := setupProductionSvc(t)
	wfID := createTestWorkflow(t, db)

	order, err := svc.CreateProductionOrder(context.Background(), dto.CreateProductionOrderRequest{
		OrderNumber:     "PO-LIFE-001",
		Customer:        "Won Seal Customer",
		Product:         "Brochures",
		ProductRevision: "A",
		WorkflowID:      &wfID,
		Quantity:        1000,
		Priority:        50,
	})
	require.NoError(t, err)
	outboxRepo.Events = nil

	// Release
	err = svc.ReleaseProductionOrder(context.Background(), order.ID)
	require.NoError(t, err)
	assert.Len(t, outboxRepo.Events, 1)
	assert.Equal(t, "mes.production.ProductionOrderReleased", outboxRepo.Events[0].EventName)

	// Verify status
	got, err := svc.GetProductionOrder(context.Background(), order.ID)
	require.NoError(t, err)
	assert.Equal(t, "released", got.Status)

	outboxRepo.Events = nil

	// Cancel
	err = svc.CancelProductionOrder(context.Background(), order.ID)
	require.NoError(t, err)
	assert.Len(t, outboxRepo.Events, 1)
	assert.Equal(t, "mes.production.ProductionOrderCancelled", outboxRepo.Events[0].EventName)
}

// ─── Work Order Tests ─────────────────────────────────────────────────────────

func TestProductionService_WorkOrder_Lifecycle(t *testing.T) {
	db, outboxRepo, svc := setupProductionSvc(t)
	wfID := createTestWorkflow(t, db)

	// Create & release production order
	order, err := svc.CreateProductionOrder(context.Background(), dto.CreateProductionOrderRequest{
		OrderNumber:     "PO-WO-001",
		Customer:        "Won Seal Customer",
		Product:         "Flyers",
		ProductRevision: "A",
		WorkflowID:      &wfID,
		Quantity:        5,
		Priority:        60,
	})
	require.NoError(t, err)
	require.NoError(t, svc.ReleaseProductionOrder(context.Background(), order.ID))
	outboxRepo.Events = nil

	// Wait for asynchronous generation
	workOrders, err := waitForWorkOrders(svc, order.ID, 5)
	require.NoError(t, err)
	assert.Len(t, workOrders, 5)

	wo := workOrders[0]
	assert.Equal(t, "pending", wo.Status)

	// Start work order
	err = svc.StartWorkOrder(context.Background(), wo.ID)
	require.NoError(t, err)

	// Complete work order
	err = svc.CompleteWorkOrder(context.Background(), wo.ID)
	require.NoError(t, err)

	// Verify final state
	got, err := svc.GetWorkOrder(context.Background(), wo.ID)
	require.NoError(t, err)
	assert.Equal(t, "completed", got.Status)
	assert.NotNil(t, got.StartedAt)
	assert.NotNil(t, got.CompletedAt)
}

func TestProductionService_WorkOrder_DraftOrderBlocked(t *testing.T) {
	db, _, svc := setupProductionSvc(t)
	wfID := createTestWorkflow(t, db)

	order, err := svc.CreateProductionOrder(context.Background(), dto.CreateProductionOrderRequest{
		OrderNumber:     "PO-BLOCKED",
		Customer:        "Won Seal Customer",
		Product:         "Test",
		ProductRevision: "A",
		WorkflowID:      &wfID,
		Quantity:        1,
		Priority:        1,
	})
	require.NoError(t, err)

	// No work orders generated on draft orders
	list, _, err := svc.ListWorkOrders(context.Background(), repository.WorkOrderFilter{
		ProductionOrderID: &order.ID,
	})
	require.NoError(t, err)
	assert.Len(t, list, 0)
}

func TestProductionService_ListWorkOrders_ByProductionOrder(t *testing.T) {
	db, _, svc := setupProductionSvc(t)
	wfID := createTestWorkflow(t, db)

	order, _ := svc.CreateProductionOrder(context.Background(), dto.CreateProductionOrderRequest{
		OrderNumber:     "PO-LIST-001",
		Customer:        "Won Seal Customer",
		Product:         "Test",
		ProductRevision: "A",
		WorkflowID:      &wfID,
		Quantity:        3,
		Priority:        50,
	})
	svc.ReleaseProductionOrder(context.Background(), order.ID)

	// Wait for asynchronous generation
	list, err := waitForWorkOrders(svc, order.ID, 3)
	require.NoError(t, err)
	assert.Len(t, list, 3)

	// Verify ordered by sequence
	assert.Equal(t, 1, list[0].Sequence)
	assert.Equal(t, 2, list[1].Sequence)
	assert.Equal(t, 3, list[2].Sequence)
}

func waitForWorkOrders(svc *service.ProductionService, orderID uuid.UUID, expected int) ([]*dto.WorkOrderDTO, error) {
	deadline := time.Now().Add(1000 * time.Millisecond)
	for time.Now().Before(deadline) {
		list, _, err := svc.ListWorkOrders(context.Background(), repository.WorkOrderFilter{
			ProductionOrderID: &orderID,
		})
		if err == nil && len(list) == expected {
			return list, nil
		}
		time.Sleep(10 * time.Millisecond)
	}
	return nil, fmt.Errorf("timeout waiting for work orders")
}
