package dto

import (
	"time"

	"github.com/google/uuid"
)

// ─── Routing DTOs ─────────────────────────────────────────────────────────────

type CreateOperationRequest struct {
	Sequence         int      `json:"sequence" binding:"required,min=1"`
	Name             string   `json:"name" binding:"required,min=2,max=255"`
	MachineType      string   `json:"machine_type" binding:"max=100"`
	EstimatedMinutes int      `json:"estimated_minutes" binding:"min=0"`
	MinOperators     int      `json:"min_operators" binding:"required,min=1"`
	MaxOperators     int      `json:"max_operators" binding:"required,min=1"`
	RequiredSkills   []string `json:"required_skills"`
}

type CreateRoutingRequest struct {
	Name        string                   `json:"name" binding:"required,min=2,max=255"`
	Description string                   `json:"description" binding:"max=500"`
	Operations  []CreateOperationRequest  `json:"operations" binding:"required,min=1,dive"`
}

type OperationDTO struct {
	ID               uuid.UUID `json:"id"`
	RoutingID        uuid.UUID `json:"routing_id"`
	Sequence         int       `json:"sequence"`
	Name             string    `json:"name"`
	MachineType      string    `json:"machine_type"`
	EstimatedMinutes int       `json:"estimated_minutes"`
	MinOperators     int       `json:"min_operators"`
	MaxOperators     int       `json:"max_operators"`
	RequiredSkills   []string  `json:"required_skills"`
}

type RoutingDTO struct {
	ID                     uuid.UUID      `json:"id"`
	Name                   string         `json:"name"`
	Description            string         `json:"description"`
	Operations             []OperationDTO `json:"operations"`
	TotalEstimatedMinutes  int            `json:"total_estimated_minutes"`
	CreatedAt              time.Time      `json:"created_at"`
	UpdatedAt              time.Time      `json:"updated_at"`
}

// ─── Production Order DTOs ────────────────────────────────────────────────────

type CreateProductionOrderRequest struct {
	OrderNumber      string  `json:"order_number" binding:"required,min=2,max=100"`
	Customer         string  `json:"customer" binding:"max=255"`
	Product          string  `json:"product" binding:"required,min=2,max=255"`
	ProductRevision  string  `json:"product_revision" binding:"max=50"`
	WorkflowID       *string `json:"workflow_id"` // UUID string
	Quantity         int     `json:"quantity" binding:"required,min=1"`
	Priority         int     `json:"priority" binding:"required,min=1,max=100"`
	DueDate          *string `json:"due_date"` // optional YYYY-MM-DD
	Notes            string  `json:"notes" binding:"max=1000"`
}

type UpdatePriorityRequest struct {
	Priority int `json:"priority" binding:"required,min=1,max=100"`
}

type ProductionOrderEventDTO struct {
	ID                uuid.UUID `json:"id"`
	ProductionOrderID uuid.UUID `json:"production_order_id"`
	EventType         string    `json:"event_type"`
	Status            string    `json:"status"`
	Message           string    `json:"message"`
	OccurredAt        time.Time `json:"occurred_at"`
}

type ProductionOrderDTO struct {
	ID                uuid.UUID                 `json:"id"`
	OrderNumber       string                    `json:"order_number"`
	Customer          string                    `json:"customer"`
	Product           string                    `json:"product"`
	ProductRevision   string                    `json:"product_revision"`
	WorkflowID        *uuid.UUID                `json:"workflow_id,omitempty"`
	Quantity          int                       `json:"quantity"`
	Priority          int                       `json:"priority"`
	Status            string                    `json:"status"`
	ApprovalStatus    string                    `json:"approval_status"`
	ProductionStatus  string                    `json:"production_status"`
	OperationType     *string                   `json:"operation_type,omitempty"`
	Station           *string                   `json:"station,omitempty"`
	GatewayOrderID    *string                   `json:"gateway_order_id,omitempty"`
	DueDate           *time.Time                `json:"due_date,omitempty"`
	Notes             string                    `json:"notes,omitempty"`
	QuantityCompleted int                       `json:"quantity_completed"`
	QuantityRunning   int                       `json:"quantity_running"`
	QuantityFailed    int                       `json:"quantity_failed"`
	QuantityCancelled int                       `json:"quantity_cancelled"`
	ScrapQuantity     int                       `json:"scrap_quantity"`
	Events            []ProductionOrderEventDTO `json:"events,omitempty"`
	CreatedAt         time.Time                 `json:"created_at"`
	UpdatedAt         time.Time                 `json:"updated_at"`
}

type GatewayEventPayload struct {
	JobNo             string    `json:"job_no" binding:"required"`
	ProductionOrderID string    `json:"production_order_id"`
	OrderNumber       string    `json:"order_number"`
	Status            string    `json:"status" binding:"required"`
	Message           string    `json:"message" binding:"required"`
	OccurredAt        time.Time `json:"occurred_at" binding:"required"`
}

// ─── Work Order DTOs ──────────────────────────────────────────────────────────

type CreateWorkOrderRequest struct {
	ProductionOrderID string `json:"production_order_id" binding:"required,uuid"`
	RoutingID         string `json:"routing_id" binding:"required,uuid"`
	Sequence          int    `json:"sequence" binding:"required,min=1"`
}

type WorkOrderDTO struct {
	ID                uuid.UUID              `json:"id"`
	ProductionOrderID uuid.UUID              `json:"production_order_id"`
	RoutingID         uuid.UUID              `json:"routing_id"`
	Sequence          int                    `json:"sequence"`
	Status            string                 `json:"status"`
	StartedAt         *time.Time             `json:"started_at,omitempty"`
	CompletedAt       *time.Time             `json:"completed_at,omitempty"`
	DispatchPlanID    *uuid.UUID             `json:"dispatch_plan_id,omitempty"`
	SerialNumber      string                 `json:"serial_number"`
	Barcode           string                 `json:"barcode"`
	QRCode            string                 `json:"qr_code"`
	CurrentStep       string                 `json:"current_step"`
	CurrentAttempt    int                    `json:"current_attempt"`
	AssignedStation   string                 `json:"assigned_station"`
	AssignedTeam      string                 `json:"assigned_team"`
	TraceID           string                 `json:"trace_id"`
	RetryHistory      string                 `json:"retry_history"`
	GatewayJobID      *string                `json:"gateway_job_id,omitempty"`
	CurrentOperation  string                  `json:"current_operation"`
	WorkflowProgress  int                     `json:"workflow_progress"`
	Operations        []WorkOrderOperationDTO `json:"operations"`
	Timelines         []WorkOrderTimelineDTO  `json:"timelines,omitempty"`
	SimulatorDetails  any                     `json:"simulator_details,omitempty"`
	CreatedAt         time.Time               `json:"created_at"`
	UpdatedAt         time.Time               `json:"updated_at"`
}

type WorkOrderOperationDTO struct {
	ID                   uuid.UUID  `json:"id"`
	WorkOrderID          uuid.UUID  `json:"work_order_id"`
	Sequence             int        `json:"sequence"`
	OperationName        string     `json:"operation_name"`
	OperationType        string     `json:"operation_type"`
	Status               string     `json:"status"`
	EstimatedDuration    int        `json:"estimated_duration"`
	RetryLimit           int        `json:"retry_limit"`
	IsRequired           bool       `json:"is_required"`
	RequiresStation      bool       `json:"requires_station"`
	DefaultStationType   string     `json:"default_station_type"`
	QualityCheckRequired bool       `json:"quality_check_required"`
	IsFinalOperation     bool       `json:"is_final_operation"`
	StartedAt            *time.Time `json:"started_at,omitempty"`
	CompletedAt          *time.Time `json:"completed_at,omitempty"`
	AssignedStation      string     `json:"assigned_station"`
	AssignedTeam         string     `json:"assigned_team"`
	Duration             int        `json:"duration"`
	RetryCount           int        `json:"retry_count"`
	Telemetry            string     `json:"telemetry"`
	Result               string     `json:"result"`
	Comments             string     `json:"comments"`
}

type WorkOrderTimelineDTO struct {
	ID          uuid.UUID `json:"id"`
	WorkOrderID uuid.UUID `json:"work_order_id"`
	Stage       string    `json:"stage"`
	Status      string    `json:"status"`
	Detail      string    `json:"detail"`
	OccurredAt  time.Time `json:"occurred_at"`
}

type CreateDispatchPlanRequest struct {
	Quantity         int    `json:"quantity" binding:"required,min=1"`
	Station          string `json:"station" binding:"required,min=2,max=100"`
	ExecutionTeam    string `json:"execution_team" binding:"required,min=2,max=100"`
	DispatchStrategy string `json:"dispatch_strategy"`
	BatchSize        int    `json:"batch_size"`
}

type DispatchPlanDTO struct {
	ID                uuid.UUID `json:"id"`
	ProductionOrderID uuid.UUID `json:"production_order_id"`
	Quantity          int       `json:"quantity"`
	Station           string    `json:"station"`
	ExecutionTeam     string    `json:"execution_team"`
	DispatchStrategy  string    `json:"dispatch_strategy"`
	BatchSize         int       `json:"batch_size"`
	Status            string    `json:"status"`
	GeneratedCount    int       `json:"generated_count"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type DispatchWorkOrderRequest struct {
	Station   string `json:"station" binding:"required"`
	Team      string `json:"team"`
	Operation string `json:"operation"`
}

type BulkDispatchWorkOrdersRequest struct {
	WorkOrderIDs []string `json:"work_order_ids" binding:"required,min=1"`
	Station      string   `json:"station" binding:"required"`
	Team         string   `json:"team"`
	Operation    string   `json:"operation"`
}
