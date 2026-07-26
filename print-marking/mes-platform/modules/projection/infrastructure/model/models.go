package model

import (
	"time"

	"github.com/google/uuid"
)

// DashboardSnapshotModel is the GORM model for projection_dashboard_snapshots.
type DashboardSnapshotModel struct {
	ID                   uuid.UUID `gorm:"type:uuid;primaryKey"`
	SnapshotDate         time.Time `gorm:"type:date;not null;uniqueIndex"`
	TotalOrders          int       `gorm:"not null;default:0"`
	DraftOrders          int       `gorm:"not null;default:0"`
	ReleasedOrders       int       `gorm:"not null;default:0"`
	InProgressOrders     int       `gorm:"not null;default:0"`
	CompletedOrders      int       `gorm:"not null;default:0"`
	CancelledOrders      int       `gorm:"not null;default:0"`
	TotalWorkOrders      int       `gorm:"not null;default:0"`
	PendingWorkOrders    int       `gorm:"not null;default:0"`
	ActiveWorkOrders     int       `gorm:"not null;default:0"`
	CompletedWorkOrders  int       `gorm:"not null;default:0"`
	TotalWorkers         int       `gorm:"not null;default:0"`
	AvailableWorkers     int       `gorm:"not null;default:0"`
	OnLeaveWorkers       int       `gorm:"not null;default:0"`
	BusyWorkers          int       `gorm:"not null;default:0"`
	UnassignedWorkers    int       `gorm:"not null;default:0"`
	OvertimeWorkers      int       `gorm:"not null;default:0"`
	OpenAssignments      int       `gorm:"not null;default:0"`
	ApprovedAssignments  int       `gorm:"not null;default:0"`
	AvgAssignmentScore   float64   `gorm:"type:decimal(6,2);not null;default:0"`
	ComputedAt           time.Time
	CreatedAt            time.Time `gorm:"autoCreateTime"`
	UpdatedAt            time.Time `gorm:"autoUpdateTime"`
}

func (DashboardSnapshotModel) TableName() string { return "projection_dashboard_snapshots" }

// OrderStatsModel is the GORM model for projection_order_stats.
type OrderStatsModel struct {
	ID                 uuid.UUID `gorm:"type:uuid;primaryKey"`
	Period             string    `gorm:"type:varchar(20);not null;uniqueIndex:idx_period_start"`
	PeriodStart        time.Time `gorm:"type:date;not null;uniqueIndex:idx_period_start"`
	PeriodEnd          time.Time `gorm:"type:date;not null"`
	OrdersCreated      int       `gorm:"not null;default:0"`
	OrdersCompleted    int       `gorm:"not null;default:0"`
	OrdersCancelled    int       `gorm:"not null;default:0"`
	AvgCompletionDays  float64   `gorm:"type:decimal(6,2);not null;default:0"`
	TotalUnitsProduced int       `gorm:"not null;default:0"`
	CreatedAt          time.Time `gorm:"autoCreateTime"`
	UpdatedAt          time.Time `gorm:"autoUpdateTime"`
}

func (OrderStatsModel) TableName() string { return "projection_order_stats" }

// WorkerStatsModel is the GORM model for projection_worker_stats.
type WorkerStatsModel struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey"`
	WorkerID         uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_worker_period_start"`
	WorkerName       string    `gorm:"type:varchar(255);not null"`
	Period           string    `gorm:"type:varchar(20);not null;uniqueIndex:idx_worker_period_start"`
	PeriodStart      time.Time `gorm:"type:date;not null;uniqueIndex:idx_worker_period_start"`
	AssignmentsCount int       `gorm:"not null;default:0"`
	ApprovedCount    int       `gorm:"not null;default:0"`
	OverriddenCount  int       `gorm:"not null;default:0"`
	AvgScore         float64   `gorm:"type:decimal(6,2);not null;default:0"`
	CreatedAt        time.Time `gorm:"autoCreateTime"`
	UpdatedAt        time.Time `gorm:"autoUpdateTime"`
}

func (WorkerStatsModel) TableName() string { return "projection_worker_stats" }
