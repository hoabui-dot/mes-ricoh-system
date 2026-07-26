// Package readmodel defines the projection read models (view objects).
// These are NOT domain aggregates — they are denormalized, query-optimized
// representations built from domain events published by other modules.
package readmodel

import (
	"time"

	"github.com/google/uuid"
)

// ─── Dashboard Snapshot ───────────────────────────────────────────────────────

// DashboardSnapshot is the daily factory-wide summary.
// Updated atomically when the projection builder processes events.
type DashboardSnapshot struct {
	ID           uuid.UUID
	SnapshotDate time.Time // date part only; one row per UTC day

	// Production Orders
	TotalOrders      int
	DraftOrders      int
	ReleasedOrders   int
	InProgressOrders int
	CompletedOrders  int
	CancelledOrders  int

	// Work Orders
	TotalWorkOrders     int
	PendingWorkOrders   int
	ActiveWorkOrders    int
	CompletedWorkOrders int

	// Workforce
	TotalWorkers      int
	AvailableWorkers  int
	OnLeaveWorkers    int
	BusyWorkers       int
	UnassignedWorkers int
	OvertimeWorkers   int

	// Assignments
	OpenAssignments     int
	ApprovedAssignments int
	AvgAssignmentScore  float64

	ComputedAt time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// ─── Order Stats ──────────────────────────────────────────────────────────────

type StatsPeriod string

const (
	PeriodDaily   StatsPeriod = "daily"
	PeriodWeekly  StatsPeriod = "weekly"
	PeriodMonthly StatsPeriod = "monthly"
)

// OrderStats is a time-windowed production order statistics snapshot.
type OrderStats struct {
	ID                 uuid.UUID
	Period             StatsPeriod
	PeriodStart        time.Time
	PeriodEnd          time.Time
	OrdersCreated      int
	OrdersCompleted    int
	OrdersCancelled    int
	AvgCompletionDays  float64
	TotalUnitsProduced int
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// ─── Worker Stats ─────────────────────────────────────────────────────────────

// WorkerStats aggregates per-worker assignment metrics for a given period.
type WorkerStats struct {
	ID               uuid.UUID
	WorkerID         uuid.UUID
	WorkerName       string
	Period           StatsPeriod
	PeriodStart      time.Time
	AssignmentsCount int
	ApprovedCount    int
	OverriddenCount  int
	AvgScore         float64
	CreatedAt        time.Time
	UpdatedAt        time.Time
}
