package entity

import (
	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Production Order Events ──────────────────────────────────────────────────

type ProductionOrderCreatedEvent struct {
	domain.BaseDomainEvent
	OrderID     uuid.UUID `json:"order_id"`
	OrderNumber string    `json:"order_number"`
	ProductName string    `json:"product_name"`
	Quantity    int       `json:"quantity"`
}

func NewProductionOrderCreatedEvent(id uuid.UUID, orderNumber, productName string, qty int) ProductionOrderCreatedEvent {
	return ProductionOrderCreatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.production.ProductionOrderCreated"),
		OrderID:         id,
		OrderNumber:     orderNumber,
		ProductName:     productName,
		Quantity:        qty,
	}
}

type ProductionOrderReleasedEvent struct {
	domain.BaseDomainEvent
	OrderID     uuid.UUID `json:"order_id"`
	OrderNumber string    `json:"order_number"`
}

func NewProductionOrderReleasedEvent(id uuid.UUID, orderNumber string) ProductionOrderReleasedEvent {
	return ProductionOrderReleasedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.production.ProductionOrderReleased"),
		OrderID:         id,
		OrderNumber:     orderNumber,
	}
}

type ProductionOrderCompletedEvent struct {
	domain.BaseDomainEvent
	OrderID     uuid.UUID `json:"order_id"`
	OrderNumber string    `json:"order_number"`
}

func NewProductionOrderCompletedEvent(id uuid.UUID, orderNumber string) ProductionOrderCompletedEvent {
	return ProductionOrderCompletedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.production.ProductionOrderCompleted"),
		OrderID:         id,
		OrderNumber:     orderNumber,
	}
}

type ProductionOrderCancelledEvent struct {
	domain.BaseDomainEvent
	OrderID     uuid.UUID `json:"order_id"`
	OrderNumber string    `json:"order_number"`
}

func NewProductionOrderCancelledEvent(id uuid.UUID, orderNumber string) ProductionOrderCancelledEvent {
	return ProductionOrderCancelledEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.production.ProductionOrderCancelled"),
		OrderID:         id,
		OrderNumber:     orderNumber,
	}
}

// ─── Work Order Events ────────────────────────────────────────────────────────

type WorkOrderCreatedEvent struct {
	domain.BaseDomainEvent
	WorkOrderID       uuid.UUID `json:"work_order_id"`
	ProductionOrderID uuid.UUID `json:"production_order_id"`
	RoutingID         uuid.UUID `json:"routing_id"`
	Sequence          int       `json:"sequence"`
}

func NewWorkOrderCreatedEvent(id, productionOrderID, routingID uuid.UUID, seq int) WorkOrderCreatedEvent {
	return WorkOrderCreatedEvent{
		BaseDomainEvent:   domain.NewBaseDomainEvent("mes.production.WorkOrderCreated"),
		WorkOrderID:       id,
		ProductionOrderID: productionOrderID,
		RoutingID:         routingID,
		Sequence:          seq,
	}
}

type WorkOrderStartedEvent struct {
	domain.BaseDomainEvent
	WorkOrderID       uuid.UUID `json:"work_order_id"`
	ProductionOrderID uuid.UUID `json:"production_order_id"`
}

func NewWorkOrderStartedEvent(id, productionOrderID uuid.UUID) WorkOrderStartedEvent {
	return WorkOrderStartedEvent{
		BaseDomainEvent:   domain.NewBaseDomainEvent("mes.production.WorkOrderStarted"),
		WorkOrderID:       id,
		ProductionOrderID: productionOrderID,
	}
}

type WorkOrderCompletedEvent struct {
	domain.BaseDomainEvent
	WorkOrderID       uuid.UUID `json:"work_order_id"`
	ProductionOrderID uuid.UUID `json:"production_order_id"`
}

func NewWorkOrderCompletedEvent(id, productionOrderID uuid.UUID) WorkOrderCompletedEvent {
	return WorkOrderCompletedEvent{
		BaseDomainEvent:   domain.NewBaseDomainEvent("mes.production.WorkOrderCompleted"),
		WorkOrderID:       id,
		ProductionOrderID: productionOrderID,
	}
}
