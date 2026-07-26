package model

import (
	"time"

	"github.com/google/uuid"
)

type ShiftTemplateModel struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	Code         string    `gorm:"type:varchar(50);uniqueIndex;not null"`
	Name         string    `gorm:"type:varchar(100);uniqueIndex;not null"`
	Description  string    `gorm:"type:varchar(255);not null;default:''"`
	StartTime    string    `gorm:"type:varchar(5);not null"`
	EndTime      string    `gorm:"type:varchar(5);not null"`
	BreakStart   string    `gorm:"type:varchar(5);not null;default:''"`
	BreakEnd     string    `gorm:"type:varchar(5);not null;default:''"`
	WorkingHours float64   `gorm:"type:numeric(5,2);not null;default:8.00"`
	CrossDay     bool      `gorm:"type:boolean;not null;default:false"`
	Color        string    `gorm:"type:varchar(20);not null;default:'#F97316'"`
	Status       string    `gorm:"type:varchar(20);not null;default:'active'"`
	CreatedAt    time.Time `gorm:"autoCreateTime"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime"`
}

func (ShiftTemplateModel) TableName() string { return "planning_shift_templates" }

type ShiftModel struct {
	ID              uuid.UUID          `gorm:"type:uuid;primaryKey"`
	ShiftTemplateID uuid.UUID          `gorm:"type:uuid;not null;uniqueIndex:idx_planning_shifts_date_tpl_unique"`
	Date            time.Time          `gorm:"type:date;not null;uniqueIndex:idx_planning_shifts_date_tpl_unique;index"`
	CreatedAt       time.Time          `gorm:"autoCreateTime"`
	UpdatedAt       time.Time          `gorm:"autoUpdateTime"`
	ShiftTemplate   ShiftTemplateModel `gorm:"foreignKey:ShiftTemplateID"`
	Teams           []TeamAssignmentModel   `gorm:"foreignKey:ShiftID;constraint:OnDelete:CASCADE"`
	Workers         []WorkerAssignmentModel `gorm:"foreignKey:ShiftID;constraint:OnDelete:CASCADE"`
}

func (ShiftModel) TableName() string { return "planning_shifts" }

type TeamAssignmentModel struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	ShiftID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_planning_team_assignments_unique"`
	TeamID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_planning_team_assignments_unique;index"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
	UpdatedAt time.Time `gorm:"autoUpdateTime"`
}

func (TeamAssignmentModel) TableName() string { return "planning_team_assignments" }

type WorkerAssignmentModel struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	ShiftID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_planning_worker_assignments_unique"`
	WorkerID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_planning_worker_assignments_unique;index"`
	Role      string    `gorm:"type:varchar(50);not null;default:'operator'"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
	UpdatedAt time.Time `gorm:"autoUpdateTime"`
}

func (WorkerAssignmentModel) TableName() string { return "planning_worker_assignments" }

type HolidayModel struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	Date        time.Time `gorm:"type:date;uniqueIndex;not null"`
	Name        string    `gorm:"type:varchar(100);not null"`
	Description string    `gorm:"type:varchar(255)"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime"`
}

func (HolidayModel) TableName() string { return "planning_holidays" }

type LeaveModel struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	WorkerID    uuid.UUID  `gorm:"type:uuid;not null;index"`
	StartDate   time.Time  `gorm:"type:date;not null;index"`
	EndDate     time.Time  `gorm:"type:date;not null;index"`
	Status      string     `gorm:"type:varchar(50);not null;default:'pending'"`
	Reason      string     `gorm:"type:varchar(255)"`
	ApprovedBy  *uuid.UUID `gorm:"type:uuid"`
	CreatedAt   time.Time  `gorm:"autoCreateTime"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime"`
}

func (LeaveModel) TableName() string { return "planning_leaves" }

type OvertimeModel struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	WorkerID    uuid.UUID  `gorm:"type:uuid;not null;index"`
	Date        time.Time  `gorm:"type:date;not null;index"`
	Hours       float64    `gorm:"type:numeric(4,2);not null"`
	Status      string     `gorm:"type:varchar(50);not null;default:'pending'"`
	Reason      string     `gorm:"type:varchar(255)"`
	ApprovedBy  *uuid.UUID `gorm:"type:uuid"`
	CreatedAt   time.Time  `gorm:"autoCreateTime"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime"`
}

func (OvertimeModel) TableName() string { return "planning_overtimes" }

type OutboxEventModel struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	EventName   string     `gorm:"type:varchar(255);not null;index"`
	RoutingKey  string     `gorm:"type:varchar(255);not null"`
	Payload     []byte     `gorm:"type:jsonb;not null"`
	Status      string     `gorm:"type:varchar(50);not null;default:'pending';index"`
	RetryCount  int        `gorm:"not null;default:0"`
	Error       string     `gorm:"type:text"`
	PublishedAt *time.Time `gorm:"index"`
	CreatedAt   time.Time  `gorm:"autoCreateTime;index"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime"`
}

func (OutboxEventModel) TableName() string { return "planning_outbox_events" }
