package persistence

import (
	"encoding/json"

	"github.com/nd/mes-platform/modules/production/domain/entity"
	"github.com/nd/mes-platform/modules/production/infrastructure/model"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Model → Entity ───────────────────────────────────────────────────────────

func modelToProductionOrder(m *model.ProductionOrderModel) *entity.ProductionOrder {
	var opType *string
	if m.OperationType != nil {
		opType = m.OperationType
	}
	var st *string
	if m.Station != nil {
		st = m.Station
	}
	o := &entity.ProductionOrder{
		OrderNumber:       m.OrderNumber,
		Customer:          m.Customer,
		Product:           m.Product,
		ProductRevision:   m.ProductRevision,
		WorkflowID:        m.WorkflowID,
		Quantity:          m.Quantity,
		Priority:          m.Priority,
		Status:            entity.OrderStatus(m.Status),
		ApprovalStatus:    m.ApprovalStatus,
		ProductionStatus:  m.ProductionStatus,
		OperationType:     opType,
		Station:           st,
		GatewayOrderID:    m.GatewayOrderID,
		DueDate:           m.DueDate,
		Notes:             m.Notes,
		QuantityCompleted: m.QuantityCompleted,
		QuantityRunning:   m.QuantityRunning,
		QuantityFailed:    m.QuantityFailed,
		QuantityCancelled: m.QuantityCancelled,
		ScrapQuantity:     m.ScrapQuantity,
	}
	o.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return o
}

func modelToRouting(m *model.RoutingModel) *entity.Routing {
	ops := make([]entity.Operation, len(m.Operations))
	for i, opM := range m.Operations {
		ops[i] = modelToOperation(opM)
	}
	r := &entity.Routing{
		Name:        m.Name,
		Description: m.Description,
		Operations:  ops,
	}
	r.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return r
}

func modelToOperation(m model.OperationModel) entity.Operation {
	var skills []string
	_ = json.Unmarshal([]byte(m.RequiredSkillsJSON), &skills)
	if skills == nil {
		skills = []string{}
	}
	return entity.Operation{
		ID:               m.ID,
		RoutingID:        m.RoutingID,
		Sequence:         m.Sequence,
		Name:             m.Name,
		MachineType:      m.MachineType,
		EstimatedMinutes: m.EstimatedMinutes,
		MinOperators:     m.MinOperators,
		MaxOperators:     m.MaxOperators,
		RequiredSkills:   skills,
		CreatedAt:        m.CreatedAt,
		UpdatedAt:        m.UpdatedAt,
	}
}

func modelToWorkOrder(m *model.WorkOrderModel) *entity.WorkOrder {
	ops := make([]entity.WorkOrderOperation, len(m.Operations))
	for i, op := range m.Operations {
		ops[i] = *modelToWorkOrderOperation(&op)
	}
	wo := &entity.WorkOrder{
		ProductionOrderID: m.ProductionOrderID,
		RoutingID:         m.RoutingID,
		Sequence:          m.Sequence,
		Status:            entity.WorkOrderStatus(m.Status),
		StartedAt:         m.StartedAt,
		CompletedAt:       m.CompletedAt,
		DispatchPlanID:    m.DispatchPlanID,
		SerialNumber:      m.SerialNumber,
		Barcode:           m.Barcode,
		QRCode:            m.QRCode,
		CurrentStep:       m.CurrentStep,
		CurrentAttempt:    m.CurrentAttempt,
		AssignedStation:   m.AssignedStation,
		AssignedTeam:      m.AssignedTeam,
		TraceID:           m.TraceID,
		RetryHistory:      m.RetryHistory,
		GatewayJobID:      m.GatewayJobID,
		CurrentOperation:  m.CurrentOperation,
		WorkflowProgress:  m.WorkflowProgress,
		Operations:        ops,
	}
	wo.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return wo
}

// ─── Entity → Model ───────────────────────────────────────────────────────────

func productionOrderToModel(e *entity.ProductionOrder) *model.ProductionOrderModel {
	return &model.ProductionOrderModel{
		ID:                e.ID,
		OrderNumber:       e.OrderNumber,
		Customer:          e.Customer,
		Product:           e.Product,
		ProductRevision:   e.ProductRevision,
		WorkflowID:        e.WorkflowID,
		Quantity:          e.Quantity,
		Priority:          e.Priority,
		Status:            string(e.Status),
		ApprovalStatus:    e.ApprovalStatus,
		ProductionStatus:  e.ProductionStatus,
		OperationType:     e.OperationType,
		Station:           e.Station,
		GatewayOrderID:    e.GatewayOrderID,
		DueDate:           e.DueDate,
		Notes:             e.Notes,
		QuantityCompleted: e.QuantityCompleted,
		QuantityRunning:   e.QuantityRunning,
		QuantityFailed:    e.QuantityFailed,
		QuantityCancelled: e.QuantityCancelled,
		ScrapQuantity:     e.ScrapQuantity,
		CreatedAt:         e.CreatedAt,
		UpdatedAt:         e.UpdatedAt,
	}
}

func modelToProductionOrderEvent(m *model.ProductionOrderEventModel) *entity.ProductionOrderEvent {
	return &entity.ProductionOrderEvent{
		ID:                m.ID,
		ProductionOrderID: m.ProductionOrderID,
		EventType:         m.EventType,
		Status:            m.Status,
		Message:           m.Message,
		OccurredAt:        m.OccurredAt,
	}
}

func productionOrderEventToModel(e *entity.ProductionOrderEvent) *model.ProductionOrderEventModel {
	return &model.ProductionOrderEventModel{
		ID:                e.ID,
		ProductionOrderID: e.ProductionOrderID,
		EventType:         e.EventType,
		Status:            e.Status,
		Message:           e.Message,
		OccurredAt:        e.OccurredAt,
	}
}

func routingToModel(e *entity.Routing) *model.RoutingModel {
	ops := make([]model.OperationModel, len(e.Operations))
	for i, op := range e.Operations {
		ops[i] = operationToModel(op)
	}
	return &model.RoutingModel{
		ID:          e.ID,
		Name:        e.Name,
		Description: e.Description,
		CreatedAt:   e.CreatedAt,
		UpdatedAt:   e.UpdatedAt,
		Operations:  ops,
	}
}

func operationToModel(e entity.Operation) model.OperationModel {
	skills := e.RequiredSkills
	if skills == nil {
		skills = []string{}
	}
	skillsJSON, _ := json.Marshal(skills)
	return model.OperationModel{
		ID:                 e.ID,
		RoutingID:          e.RoutingID,
		Sequence:           e.Sequence,
		Name:               e.Name,
		MachineType:        e.MachineType,
		EstimatedMinutes:   e.EstimatedMinutes,
		MinOperators:       e.MinOperators,
		MaxOperators:       e.MaxOperators,
		RequiredSkillsJSON: string(skillsJSON),
		CreatedAt:          e.CreatedAt,
		UpdatedAt:          e.UpdatedAt,
	}
}

func workOrderToModel(e *entity.WorkOrder) *model.WorkOrderModel {
	ops := make([]model.WorkOrderOperationModel, len(e.Operations))
	for i, op := range e.Operations {
		ops[i] = *workOrderOperationToModel(&op)
	}
	return &model.WorkOrderModel{
		ID:                e.ID,
		ProductionOrderID: e.ProductionOrderID,
		RoutingID:         e.RoutingID,
		Sequence:          e.Sequence,
		Status:            string(e.Status),
		StartedAt:         e.StartedAt,
		CompletedAt:       e.CompletedAt,
		DispatchPlanID:    e.DispatchPlanID,
		SerialNumber:      e.SerialNumber,
		Barcode:           e.Barcode,
		QRCode:            e.QRCode,
		CurrentStep:       e.CurrentStep,
		CurrentAttempt:    e.CurrentAttempt,
		AssignedStation:   e.AssignedStation,
		AssignedTeam:      e.AssignedTeam,
		TraceID:           e.TraceID,
		RetryHistory:      e.RetryHistory,
		GatewayJobID:      e.GatewayJobID,
		CurrentOperation:  e.CurrentOperation,
		WorkflowProgress:  e.WorkflowProgress,
		Operations:        ops,
		CreatedAt:         e.CreatedAt,
		UpdatedAt:         e.UpdatedAt,
	}
}

func workOrderOperationToModel(e *entity.WorkOrderOperation) *model.WorkOrderOperationModel {
	return &model.WorkOrderOperationModel{
		ID:                   e.ID,
		WorkOrderID:          e.WorkOrderID,
		Sequence:             e.Sequence,
		OperationName:        e.OperationName,
		OperationType:        e.OperationType,
		Status:               e.Status,
		EstimatedDuration:    e.EstimatedDuration,
		RetryLimit:           e.RetryLimit,
		IsRequired:           e.IsRequired,
		RequiresStation:      e.RequiresStation,
		DefaultStationType:   e.DefaultStationType,
		QualityCheckRequired: e.QualityCheckRequired,
		IsFinalOperation:     e.IsFinalOperation,
		StartedAt:            e.StartedAt,
		CompletedAt:          e.CompletedAt,
		AssignedStation:      e.AssignedStation,
		AssignedTeam:         e.AssignedTeam,
		Duration:             e.Duration,
		RetryCount:           e.RetryCount,
		Telemetry:            e.Telemetry,
		Result:               e.Result,
		Comments:             e.Comments,
		CreatedAt:            e.CreatedAt,
		UpdatedAt:            e.UpdatedAt,
	}
}

func modelToWorkOrderOperation(m *model.WorkOrderOperationModel) *entity.WorkOrderOperation {
	return &entity.WorkOrderOperation{
		ID:                   m.ID,
		WorkOrderID:          m.WorkOrderID,
		Sequence:             m.Sequence,
		OperationName:        m.OperationName,
		OperationType:        m.OperationType,
		Status:               m.Status,
		EstimatedDuration:    m.EstimatedDuration,
		RetryLimit:           m.RetryLimit,
		IsRequired:           m.IsRequired,
		RequiresStation:      m.RequiresStation,
		DefaultStationType:   m.DefaultStationType,
		QualityCheckRequired: m.QualityCheckRequired,
		IsFinalOperation:     m.IsFinalOperation,
		StartedAt:            m.StartedAt,
		CompletedAt:          m.CompletedAt,
		AssignedStation:      m.AssignedStation,
		AssignedTeam:         m.AssignedTeam,
		Duration:             m.Duration,
		RetryCount:           m.RetryCount,
		Telemetry:            m.Telemetry,
		Result:               m.Result,
		Comments:             m.Comments,
		CreatedAt:            m.CreatedAt,
		UpdatedAt:            m.UpdatedAt,
	}
}

func modelToDispatchPlan(m *model.DispatchPlanModel) *entity.DispatchPlan {
	dp := &entity.DispatchPlan{
		ProductionOrderID: m.ProductionOrderID,
		Quantity:          m.Quantity,
		Station:           m.Station,
		ExecutionTeam:     m.ExecutionTeam,
		DispatchStrategy:  m.DispatchStrategy,
		BatchSize:         m.BatchSize,
		Status:            entity.DispatchPlanStatus(m.Status),
		GeneratedCount:    m.GeneratedCount,
	}
	dp.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return dp
}

func dispatchPlanToModel(e *entity.DispatchPlan) *model.DispatchPlanModel {
	return &model.DispatchPlanModel{
		ID:                e.ID,
		ProductionOrderID: e.ProductionOrderID,
		Quantity:          e.Quantity,
		Station:           e.Station,
		ExecutionTeam:     e.ExecutionTeam,
		DispatchStrategy:  e.DispatchStrategy,
		BatchSize:         e.BatchSize,
		Status:            string(e.Status),
		GeneratedCount:    e.GeneratedCount,
		CreatedAt:         e.CreatedAt,
		UpdatedAt:         e.UpdatedAt,
	}
}

func modelToWorkOrderTimeline(m *model.WorkOrderTimelineModel) *entity.WorkOrderTimeline {
	return &entity.WorkOrderTimeline{
		ID:          m.ID,
		WorkOrderID: m.WorkOrderID,
		Stage:       m.Stage,
		Status:      m.Status,
		Detail:      m.Detail,
		OccurredAt:  m.OccurredAt,
	}
}

func workOrderTimelineToModel(e *entity.WorkOrderTimeline) *model.WorkOrderTimelineModel {
	return &model.WorkOrderTimelineModel{
		ID:          e.ID,
		WorkOrderID: e.WorkOrderID,
		Stage:       e.Stage,
		Status:      e.Status,
		Detail:      e.Detail,
		OccurredAt:  e.OccurredAt,
	}
}
