package model

import (
	"time"

	"github.com/google/uuid"
)

// AssignmentModel is the GORM model for assignment_assignments.
type AssignmentModel struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	WorkOrderID uuid.UUID `gorm:"type:uuid;not null;index"`
	OperationID uuid.UUID `gorm:"type:uuid;not null;index"`
	Revision    int       `gorm:"not null;default:1"`
	Status      string    `gorm:"type:varchar(50);not null;default:'proposed';index"`
	ProposedBy  string    `gorm:"type:varchar(255);not null;default:'system'"`
	ReviewedBy  *uuid.UUID `gorm:"type:uuid;default:null"`
	Score       float64   `gorm:"type:decimal(6,2);not null;default:0"`
	Notes       string    `gorm:"type:text"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime"`

	Workers []AssignedWorkerModel `gorm:"foreignKey:AssignmentID;constraint:OnDelete:CASCADE"`
}

func (AssignmentModel) TableName() string { return "assignment_assignments" }

// AssignedWorkerModel is the GORM model for assignment_assigned_workers.
// WorkerName is denormalized for historical immutability.
type AssignedWorkerModel struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey"`
	AssignmentID     uuid.UUID `gorm:"type:uuid;not null;index"`
	WorkerID         uuid.UUID `gorm:"type:uuid;not null"`
	WorkerName       string    `gorm:"type:varchar(255);not null"`
	SkillMatchedJSON string    `gorm:"type:text;not null;default:'[]'"` // JSON array
	Score            float64   `gorm:"type:decimal(6,2);not null;default:0"`
	CreatedAt        time.Time `gorm:"autoCreateTime"`
}

func (AssignedWorkerModel) TableName() string { return "assignment_assigned_workers" }

// OutboxEventModel is the GORM model for assignment_outbox_events.
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

func (OutboxEventModel) TableName() string { return "assignment_outbox_events" }
