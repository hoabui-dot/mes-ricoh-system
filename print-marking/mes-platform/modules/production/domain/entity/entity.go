package entity

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Production Order Status ──────────────────────────────────────────────────

type OrderStatus string

const (
	OrderStatusDraft         OrderStatus = "draft"
	OrderStatusReleased      OrderStatus = "released"
	OrderStatusSentToGateway OrderStatus = "sent_to_gateway"
	OrderStatusAccepted      OrderStatus = "accepted"
	OrderStatusInProgress    OrderStatus = "in_progress"
	OrderStatusCompleted     OrderStatus = "completed"
	OrderStatusClosed        OrderStatus = "closed"
	OrderStatusFailed        OrderStatus = "failed"
	OrderStatusCancelled     OrderStatus = "cancelled"
)

// ─── Work Order Status ────────────────────────────────────────────────────────

type WorkOrderStatus string

const (
	WorkOrderStatusPending        WorkOrderStatus = "pending"
	WorkOrderStatusInProgress     WorkOrderStatus = "in_progress"
	WorkOrderStatusQueued         WorkOrderStatus = "queued"
	WorkOrderStatusDispatched     WorkOrderStatus = "dispatched"
	WorkOrderStatusAccepted       WorkOrderStatus = "accepted"
	WorkOrderStatusPrinting       WorkOrderStatus = "printing"
	WorkOrderStatusPrintCompleted WorkOrderStatus = "print_completed"
	WorkOrderStatusLaserRunning   WorkOrderStatus = "laser_running"
	WorkOrderStatusLaserCompleted WorkOrderStatus = "laser_completed"
	WorkOrderStatusVisionRunning  WorkOrderStatus = "vision_running"
	WorkOrderStatusVisionPassed   WorkOrderStatus = "vision_passed"
	WorkOrderStatusVisionFailed   WorkOrderStatus = "vision_failed"
	WorkOrderStatusRetry          WorkOrderStatus = "retry"
	WorkOrderStatusRejected       WorkOrderStatus = "rejected"
	WorkOrderStatusCompleted      WorkOrderStatus = "completed"
	WorkOrderStatusCancelled      WorkOrderStatus = "cancelled"
	WorkOrderStatusPaused         WorkOrderStatus = "paused"
)

// ─── Operation (Value Object) ─────────────────────────────────────────────────

// Operation is a step within a Routing. It is a Value Object owned by Routing.
type Operation struct {
	ID               uuid.UUID
	RoutingID        uuid.UUID
	Sequence         int
	Name             string
	MachineType      string
	EstimatedMinutes int
	MinOperators     int
	MaxOperators     int
	RequiredSkills   []string // skill codes from workforce module
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

func NewOperation(routingID uuid.UUID, seq int, name, machineType string, estimatedMinutes, minOps, maxOps int, skills []string) (*Operation, error) {
	if seq <= 0 {
		return nil, errors.New("operation sequence must be greater than 0")
	}
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("operation name is required")
	}
	if estimatedMinutes < 0 {
		return nil, errors.New("estimated minutes cannot be negative")
	}
	if minOps < 1 {
		return nil, errors.New("min_operators must be at least 1")
	}
	if maxOps < minOps {
		return nil, fmt.Errorf("max_operators (%d) must be >= min_operators (%d)", maxOps, minOps)
	}

	now := time.Now().UTC()
	return &Operation{
		ID:               uuid.New(),
		RoutingID:        routingID,
		Sequence:         seq,
		Name:             strings.TrimSpace(name),
		MachineType:      strings.TrimSpace(machineType),
		EstimatedMinutes: estimatedMinutes,
		MinOperators:     minOps,
		MaxOperators:     maxOps,
		RequiredSkills:   skills,
		CreatedAt:        now,
		UpdatedAt:        now,
	}, nil
}

// ─── Routing ──────────────────────────────────────────────────────────────────

// Routing is a named sequence of Operations that defines how a product is manufactured.
type Routing struct {
	domain.BaseEntity
	Name        string
	Description string
	Operations  []Operation
}

func NewRouting(name, description string, operations []Operation) (*Routing, error) {
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("routing name is required")
	}
	if len(operations) == 0 {
		return nil, errors.New("routing must have at least one operation")
	}

	// Verify sequences are unique and positive
	seqSet := make(map[int]struct{})
	for _, op := range operations {
		if _, exists := seqSet[op.Sequence]; exists {
			return nil, fmt.Errorf("duplicate operation sequence: %d", op.Sequence)
		}
		seqSet[op.Sequence] = struct{}{}
	}

	r := &Routing{
		BaseEntity:  domain.NewBaseEntity(),
		Name:        strings.TrimSpace(name),
		Description: strings.TrimSpace(description),
		Operations:  operations,
	}

	// Assign routing ID to all operations
	for i := range r.Operations {
		r.Operations[i].RoutingID = r.ID
	}

	return r, nil
}

// TotalEstimatedMinutes sums all operation durations.
func (r *Routing) TotalEstimatedMinutes() int {
	total := 0
	for _, op := range r.Operations {
		total += op.EstimatedMinutes
	}
	return total
}

// ─── Production Order ─────────────────────────────────────────────────────────

// ProductionOrder is the top-level aggregate for manufacturing a product batch.
type ProductionOrder struct {
	domain.AggregateRoot
	OrderNumber       string
	Customer          string
	Product           string
	ProductRevision   string
	WorkflowID        *uuid.UUID
	Quantity          int
	Priority          int // 1 = lowest, 100 = highest
	Status            OrderStatus
	ApprovalStatus    string // draft, pending_approval, approved, rejected
	ProductionStatus  string // planned, in_progress, completed, cancelled
	OperationType     *string // Deprecated/Optional
	Station           *string // Deprecated/Optional
	GatewayOrderID    *string
	DueDate           *time.Time
	Notes             string
	QuantityCompleted int
	QuantityRunning   int
	QuantityFailed    int
	QuantityCancelled int
	ScrapQuantity     int
}

func NewProductionOrder(orderNumber, customer, product, revision string, workflowID *uuid.UUID, quantity, priority int, dueDate *time.Time, notes string) (*ProductionOrder, error) {
	if strings.TrimSpace(orderNumber) == "" {
		return nil, errors.New("order number is required")
	}
	if strings.TrimSpace(product) == "" {
		return nil, errors.New("product is required")
	}
	if quantity <= 0 {
		return nil, errors.New("quantity must be greater than 0")
	}
	if priority < 1 || priority > 100 {
		return nil, errors.New("priority must be between 1 and 100")
	}

	po := &ProductionOrder{
		OrderNumber:       strings.TrimSpace(orderNumber),
		Customer:          strings.TrimSpace(customer),
		Product:           strings.TrimSpace(product),
		ProductRevision:   strings.TrimSpace(revision),
		WorkflowID:        workflowID,
		Quantity:          quantity,
		Priority:          priority,
		Status:            OrderStatusDraft,
		ApprovalStatus:    "draft",
		ProductionStatus:  "planned",
		DueDate:           dueDate,
		Notes:             strings.TrimSpace(notes),
		QuantityCompleted: 0,
		QuantityRunning:   0,
		QuantityFailed:    0,
		QuantityCancelled: 0,
		ScrapQuantity:     0,
	}
	po.BaseEntity = domain.NewBaseEntity()
	po.RecordEvent(NewProductionOrderCreatedEvent(po.ID, po.OrderNumber, po.Product, po.Quantity))
	return po, nil
}

// Release transitions the order from draft to released (available for work orders).
func (po *ProductionOrder) Release() error {
	if po.Status != OrderStatusDraft {
		return fmt.Errorf("can only release a draft order, current status: %s", po.Status)
	}
	po.Status = OrderStatusReleased
	po.UpdatedAt = time.Now().UTC()
	po.RecordEvent(NewProductionOrderReleasedEvent(po.ID, po.OrderNumber))
	return nil
}

// SentToGateway marks that the order has been successfully transmitted to the gateway.
func (po *ProductionOrder) SentToGateway(gatewayOrderID string) error {
	if po.Status != OrderStatusReleased && po.Status != OrderStatusSentToGateway {
		return fmt.Errorf("can only mark a released order as sent to gateway, current status: %s", po.Status)
	}
	po.Status = OrderStatusSentToGateway
	po.GatewayOrderID = &gatewayOrderID
	po.UpdatedAt = time.Now().UTC()
	return nil
}

// Accept transitions the order status to accepted.
func (po *ProductionOrder) Accept() error {
	if po.Status != OrderStatusSentToGateway {
		return fmt.Errorf("can only accept an order that has been sent to gateway, current status: %s", po.Status)
	}
	po.Status = OrderStatusAccepted
	po.UpdatedAt = time.Now().UTC()
	return nil
}

// Start transitions the order to in_progress (Running).
func (po *ProductionOrder) Start() error {
	if po.Status != OrderStatusAccepted && po.Status != OrderStatusReleased && po.Status != OrderStatusSentToGateway {
		return fmt.Errorf("can only start an accepted or released order, current status: %s", po.Status)
	}
	po.Status = OrderStatusInProgress
	po.UpdatedAt = time.Now().UTC()
	return nil
}

// Complete marks the order as fully manufactured.
func (po *ProductionOrder) Complete() error {
	if po.Status != OrderStatusInProgress && po.Status != OrderStatusAccepted && po.Status != OrderStatusSentToGateway {
		return fmt.Errorf("can only complete an active order, current status: %s", po.Status)
	}
	po.Status = OrderStatusCompleted
	po.UpdatedAt = time.Now().UTC()
	po.RecordEvent(NewProductionOrderCompletedEvent(po.ID, po.OrderNumber))
	return nil
}

// Fail marks the order as failed.
func (po *ProductionOrder) Fail() error {
	if po.Status != OrderStatusInProgress && po.Status != OrderStatusReleased && po.Status != OrderStatusSentToGateway && po.Status != OrderStatusAccepted {
		return fmt.Errorf("cannot fail an order in status: %s", po.Status)
	}
	po.Status = OrderStatusFailed
	po.UpdatedAt = time.Now().UTC()
	return nil
}

// Close transitions the order status to closed.
func (po *ProductionOrder) Close() error {
	if po.Status != OrderStatusCompleted {
		return fmt.Errorf("can only close a completed order, current status: %s", po.Status)
	}
	po.Status = OrderStatusClosed
	po.UpdatedAt = time.Now().UTC()
	return nil
}

// Cancel marks the order as cancelled. Only draft or released orders can be cancelled.
func (po *ProductionOrder) Cancel() error {
	if po.Status != OrderStatusDraft && po.Status != OrderStatusReleased && po.Status != OrderStatusSentToGateway {
		return fmt.Errorf("can only cancel a draft, released or sent order, current status: %s", po.Status)
	}
	po.Status = OrderStatusCancelled
	po.UpdatedAt = time.Now().UTC()
	po.RecordEvent(NewProductionOrderCancelledEvent(po.ID, po.OrderNumber))
	return nil
}

// UpdatePriority changes the production order priority.
func (po *ProductionOrder) UpdatePriority(priority int) error {
	if priority < 1 || priority > 100 {
		return errors.New("priority must be between 1 and 100")
	}
	po.Priority = priority
	po.UpdatedAt = time.Now().UTC()
	return nil
}

// ProductionOrderEvent represents a historical log of actions/events for a ProductionOrder.
type ProductionOrderEvent struct {
	ID                uuid.UUID
	ProductionOrderID uuid.UUID
	EventType         string
	Status            string
	Message           string
	OccurredAt        time.Time
}

func NewProductionOrderEvent(productionOrderID uuid.UUID, eventType, status, message string, occurredAt time.Time) *ProductionOrderEvent {
	return &ProductionOrderEvent{
		ID:                uuid.New(),
		ProductionOrderID: productionOrderID,
		EventType:         eventType,
		Status:            status,
		Message:           message,
		OccurredAt:        occurredAt,
	}
}

// ─── Work Order ───────────────────────────────────────────────────────────────

// WorkOrder represents the execution of a specific Routing for a ProductionOrder.
type WorkOrder struct {
	domain.AggregateRoot
	ProductionOrderID uuid.UUID
	RoutingID         uuid.UUID
	Sequence          int
	Status            WorkOrderStatus
	StartedAt         *time.Time
	CompletedAt       *time.Time

	// Extended fields
	DispatchPlanID   *uuid.UUID
	SerialNumber     string
	Barcode          string
	QRCode           string
	CurrentStep      string
	CurrentAttempt   int
	AssignedStation  string
	AssignedTeam     string
	TraceID          string
	RetryHistory     string // JSON string
	GatewayJobID     *string
	CurrentOperation string
	WorkflowProgress int
	Operations       []WorkOrderOperation
}

// WorkOrderOperation represents an immutable snapshot of a manufacturing operation within a work order's routing.
type WorkOrderOperation struct {
	ID                   uuid.UUID
	WorkOrderID          uuid.UUID
	Sequence             int
	OperationName        string
	OperationType        string
	Status               string // pending, running, completed, failed, skipped
	EstimatedDuration    int    // in seconds
	RetryLimit           int
	IsRequired           bool
	RequiresStation      bool
	DefaultStationType   string
	QualityCheckRequired bool
	IsFinalOperation     bool
	StartedAt            *time.Time
	CompletedAt          *time.Time
	AssignedStation      string
	AssignedTeam         string
	Duration             int
	RetryCount           int
	Telemetry            string
	Result               string
	Comments             string
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

func NewWorkOrder(productionOrderID, routingID uuid.UUID, sequence int) (*WorkOrder, error) {
	if sequence <= 0 {
		return nil, errors.New("work order sequence must be greater than 0")
	}

	wo := &WorkOrder{
		ProductionOrderID: productionOrderID,
		RoutingID:         routingID,
		Sequence:          sequence,
		Status:            WorkOrderStatusPending,
		CurrentAttempt:    1,
		RetryHistory:      "[]",
	}
	wo.BaseEntity = domain.NewBaseEntity()
	wo.RecordEvent(NewWorkOrderCreatedEvent(wo.ID, productionOrderID, routingID, sequence))
	return wo, nil
}

// Start transitions the work order to in_progress.
func (wo *WorkOrder) Start() error {
	if wo.Status != WorkOrderStatusPending && wo.Status != WorkOrderStatusDispatched && wo.Status != WorkOrderStatusAccepted {
		return fmt.Errorf("can only start a pending or dispatched work order, current status: %s", wo.Status)
	}
	now := time.Now().UTC()
	wo.Status = WorkOrderStatusInProgress
	wo.StartedAt = &now
	wo.UpdatedAt = now
	wo.RecordEvent(NewWorkOrderStartedEvent(wo.ID, wo.ProductionOrderID))
	return nil
}

// Complete marks the work order as done.
func (wo *WorkOrder) Complete() error {
	now := time.Now().UTC()
	wo.Status = WorkOrderStatusCompleted
	wo.CompletedAt = &now
	wo.UpdatedAt = now
	wo.RecordEvent(NewWorkOrderCompletedEvent(wo.ID, wo.ProductionOrderID))
	return nil
}

// Cancel marks the work order as cancelled.
func (wo *WorkOrder) Cancel() error {
	if wo.Status == WorkOrderStatusCompleted || wo.Status == WorkOrderStatusCancelled {
		return fmt.Errorf("cannot cancel a %s work order", wo.Status)
	}
	wo.Status = WorkOrderStatusCancelled
	wo.UpdatedAt = time.Now().UTC()
	return nil
}

// WorkOrderTimeline represents a single execution event for a WorkOrder
type WorkOrderTimeline struct {
	ID          uuid.UUID
	WorkOrderID uuid.UUID
	Stage       string
	Status      string
	Detail      string
	OccurredAt  time.Time
}

func NewWorkOrderTimeline(workOrderID uuid.UUID, stage, status, detail string) *WorkOrderTimeline {
	return &WorkOrderTimeline{
		ID:          uuid.New(),
		WorkOrderID: workOrderID,
		Stage:       stage,
		Status:      status,
		Detail:      detail,
		OccurredAt:  time.Now().UTC(),
	}
}
