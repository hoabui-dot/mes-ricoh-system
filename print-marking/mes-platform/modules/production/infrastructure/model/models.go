package model

import (
	"time"

	"github.com/google/uuid"
)

// ProductionOrderModel is the GORM model for production_orders.
type ProductionOrderModel struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey"`
	OrderNumber       string     `gorm:"type:varchar(100);uniqueIndex;not null"`
	Customer          string     `gorm:"type:varchar(255);not null;default:''"`
	Product           string     `gorm:"type:varchar(255);not null;default:''"`
	ProductRevision   string     `gorm:"type:varchar(50);not null;default:''"`
	WorkflowID        *uuid.UUID `gorm:"type:uuid;default:null;index"`
	Quantity          int        `gorm:"not null;default:1"`
	Priority          int        `gorm:"not null;default:50"`
	Status            string     `gorm:"type:varchar(50);not null;default:'draft';index"`
	ApprovalStatus    string     `gorm:"type:varchar(50);not null;default:'draft'"`
	ProductionStatus  string     `gorm:"type:varchar(50);not null;default:'planned'"`
	OperationType     *string    `gorm:"type:varchar(50);default:null"`
	Station           *string    `gorm:"type:varchar(100);default:null"`
	GatewayOrderID    *string    `gorm:"type:varchar(100);default:null;index"`
	DueDate           *time.Time `gorm:"type:date;index"`
	Notes             string     `gorm:"type:text"`
	QuantityCompleted int        `gorm:"not null;default:0"`
	QuantityRunning   int        `gorm:"not null;default:0"`
	QuantityFailed    int        `gorm:"not null;default:0"`
	QuantityCancelled int        `gorm:"not null;default:0"`
	ScrapQuantity     int        `gorm:"not null;default:0"`
	CreatedAt         time.Time  `gorm:"autoCreateTime"`
	UpdatedAt         time.Time  `gorm:"autoUpdateTime"`
}

func (ProductionOrderModel) TableName() string { return "production_orders" }

// ProductionOrderEventModel is the GORM model for production_order_events.
type ProductionOrderEventModel struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey"`
	ProductionOrderID uuid.UUID `gorm:"type:uuid;not null;index"`
	EventType         string    `gorm:"type:varchar(100);not null"`
	Status            string    `gorm:"type:varchar(50);not null"`
	Message           string    `gorm:"type:text;not null"`
	OccurredAt        time.Time `gorm:"not null"`
	CreatedAt         time.Time `gorm:"autoCreateTime"`
}

func (ProductionOrderEventModel) TableName() string { return "production_order_events" }

// RoutingModel is the GORM model for production_routings.
type RoutingModel struct {
	ID          uuid.UUID        `gorm:"type:uuid;primaryKey"`
	Name        string           `gorm:"type:varchar(255);uniqueIndex;not null"`
	Description string           `gorm:"type:text"`
	CreatedAt   time.Time        `gorm:"autoCreateTime"`
	UpdatedAt   time.Time        `gorm:"autoUpdateTime"`
	Operations  []OperationModel `gorm:"foreignKey:RoutingID;constraint:OnDelete:CASCADE"`
}

func (RoutingModel) TableName() string { return "production_routings" }

// OperationModel is the GORM model for production_operations.
// RequiredSkillsJSON stores the skill codes as a JSON-encoded string for DB compatibility.
type OperationModel struct {
	ID                 uuid.UUID `gorm:"type:uuid;primaryKey"`
	RoutingID          uuid.UUID `gorm:"type:uuid;not null;index"`
	Sequence           int       `gorm:"not null"`
	Name               string    `gorm:"type:varchar(255);not null"`
	MachineType        string    `gorm:"type:varchar(100);not null;default:''"`
	EstimatedMinutes   int       `gorm:"not null;default:0"`
	MinOperators       int       `gorm:"not null;default:1"`
	MaxOperators       int       `gorm:"not null;default:1"`
	RequiredSkillsJSON string    `gorm:"type:text;not null;default:'[]'"` // JSON array of skill codes
	CreatedAt          time.Time `gorm:"autoCreateTime"`
	UpdatedAt          time.Time `gorm:"autoUpdateTime"`
}

func (OperationModel) TableName() string { return "production_operations" }

// WorkOrderModel is the GORM model for production_work_orders.
type WorkOrderModel struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey"`
	ProductionOrderID uuid.UUID  `gorm:"type:uuid;not null;index"`
	RoutingID         uuid.UUID  `gorm:"type:uuid;not null"`
	Sequence          int        `gorm:"not null;default:1"`
	Status            string     `gorm:"type:varchar(50);not null;default:'pending';index"`
	StartedAt         *time.Time `gorm:"default:null"`
	CompletedAt       *time.Time `gorm:"default:null"`
	CreatedAt         time.Time  `gorm:"autoCreateTime"`
	UpdatedAt         time.Time  `gorm:"autoUpdateTime"`

	// Extended fields
	DispatchPlanID    *uuid.UUID `gorm:"type:uuid;default:null;index"`
	SerialNumber      string     `gorm:"type:varchar(100);uniqueIndex;default:''"`
	Barcode           string     `gorm:"type:varchar(100);default:''"`
	QRCode            string     `gorm:"type:varchar(100);default:''"`
	CurrentStep       string     `gorm:"type:varchar(100);default:''"`
	CurrentAttempt    int        `gorm:"not null;default:1"`
	AssignedStation   string     `gorm:"type:varchar(100);default:''"`
	AssignedTeam      string     `gorm:"type:varchar(100);default:''"`
	TraceID           string     `gorm:"type:varchar(100);default:''"`
	RetryHistory      string     `gorm:"type:text;default:'[]'"`
	GatewayJobID      *string    `gorm:"type:varchar(100);default:null;index"`
	CurrentOperation  string                    `gorm:"type:varchar(100);default:''"`
	WorkflowProgress  int                       `gorm:"not null;default:0"`
	Operations        []WorkOrderOperationModel `gorm:"foreignKey:WorkOrderID;constraint:OnDelete:CASCADE"`
}

func (WorkOrderModel) TableName() string { return "production_work_orders" }

// WorkOrderOperationModel is the GORM model for work_order_operations.
type WorkOrderOperationModel struct {
	ID                   uuid.UUID  `gorm:"type:uuid;primaryKey"`
	WorkOrderID          uuid.UUID  `gorm:"type:uuid;not null;index"`
	Sequence             int        `gorm:"not null"`
	OperationName        string     `gorm:"type:varchar(255);not null;default:''"`
	OperationType        string     `gorm:"type:varchar(100);not null"`
	Status               string     `gorm:"type:varchar(50);not null;default:'pending'"`
	EstimatedDuration    int        `gorm:"not null;default:0"`
	RetryLimit           int        `gorm:"not null;default:0"`
	IsRequired           bool       `gorm:"not null;default:true"`
	RequiresStation      bool       `gorm:"not null;default:true"`
	DefaultStationType   string     `gorm:"type:varchar(100);not null;default:''"`
	QualityCheckRequired bool       `gorm:"not null;default:false"`
	IsFinalOperation     bool       `gorm:"not null;default:false"`
	StartedAt            *time.Time `gorm:"default:null"`
	CompletedAt          *time.Time `gorm:"default:null"`
	AssignedStation      string     `gorm:"type:varchar(100);not null;default:''"`
	AssignedTeam         string     `gorm:"type:varchar(100);not null;default:''"`
	Duration             int        `gorm:"not null;default:0"`
	RetryCount           int        `gorm:"not null;default:0"`
	Telemetry            string     `gorm:"type:text;not null;default:''"`
	Result               string     `gorm:"type:varchar(100);not null;default:''"`
	Comments             string     `gorm:"type:text;not null;default:''"`
	CreatedAt            time.Time  `gorm:"autoCreateTime"`
	UpdatedAt            time.Time  `gorm:"autoUpdateTime"`
}

func (WorkOrderOperationModel) TableName() string { return "work_order_operations" }

// DispatchPlanModel is the GORM model for production_dispatch_plans.
type DispatchPlanModel struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey"`
	ProductionOrderID uuid.UUID `gorm:"type:uuid;not null;index"`
	Quantity          int       `gorm:"not null"`
	Station           string    `gorm:"type:varchar(100);not null"`
	ExecutionTeam     string    `gorm:"type:varchar(100);not null"`
	DispatchStrategy  string    `gorm:"type:varchar(50);not null;default:'Serial'"`
	BatchSize         int       `gorm:"not null;default:1"`
	Status            string    `gorm:"type:varchar(50);not null;default:'pending'"`
	GeneratedCount    int       `gorm:"not null;default:0"`
	CreatedAt         time.Time `gorm:"autoCreateTime"`
	UpdatedAt         time.Time `gorm:"autoUpdateTime"`
}

func (DispatchPlanModel) TableName() string { return "production_dispatch_plans" }

// WorkOrderTimelineModel is the GORM model for production_work_order_timelines.
type WorkOrderTimelineModel struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	WorkOrderID uuid.UUID `gorm:"type:uuid;not null;index"`
	Stage       string    `gorm:"type:varchar(100);not null"`
	Status      string    `gorm:"type:varchar(50);not null"`
	Detail      string    `gorm:"type:text;not null"`
	OccurredAt  time.Time `gorm:"not null"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
}

func (WorkOrderTimelineModel) TableName() string { return "production_work_order_timelines" }

// OutboxEventModel is the GORM model for production_outbox_events.
type OutboxEventModel struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	EventName   string     `gorm:"type:varchar(255);not null;index"`
	RoutingKey  string     `gorm:"type:varchar(255);not null"`
	Payload     []byte     `gorm:"type:text;not null"`
	Status      string     `gorm:"type:varchar(50);not null;default:'pending';index"`
	RetryCount  int        `gorm:"not null;default:0"`
	Error       string     `gorm:"type:text"`
	PublishedAt *time.Time `gorm:"index"`
	CreatedAt   time.Time  `gorm:"autoCreateTime;index"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime"`
}

func (OutboxEventModel) TableName() string { return "production_outbox_events" }
