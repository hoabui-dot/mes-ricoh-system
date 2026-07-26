package repository

import (
	"context"
	"time"

	"github.com/nd/mes-platform/modules/projection/domain/readmodel"
)

// DashboardRepository manages persistence and retrieval of dashboard snapshots.
type DashboardRepository interface {
	// SaveSnapshot upserts the dashboard snapshot for the given date.
	SaveSnapshot(ctx context.Context, s *readmodel.DashboardSnapshot) error
	// GetSnapshot retrieves the snapshot for a given date. Returns nil if not found.
	GetSnapshot(ctx context.Context, date time.Time) (*readmodel.DashboardSnapshot, error)
	// GetLatest retrieves the most recently computed snapshot.
	GetLatest(ctx context.Context) (*readmodel.DashboardSnapshot, error)
}

// OrderStatsRepository manages order statistics by period.
type OrderStatsRepository interface {
	// Upsert saves or updates order stats for a given period window.
	Upsert(ctx context.Context, s *readmodel.OrderStats) error
	// List retrieves stats for a given period type.
	List(ctx context.Context, period readmodel.StatsPeriod, limit int) ([]*readmodel.OrderStats, error)
}

// WorkerStatsRepository manages per-worker statistics by period.
type WorkerStatsRepository interface {
	// Upsert saves or updates worker stats.
	Upsert(ctx context.Context, s *readmodel.WorkerStats) error
	// ListTopWorkers returns the top N workers by avg_score for a given period.
	ListTopWorkers(ctx context.Context, period readmodel.StatsPeriod, date time.Time, limit int) ([]*readmodel.WorkerStats, error)
}
