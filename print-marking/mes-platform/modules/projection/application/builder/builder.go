// Package builder implements the projection read model builder.
// It queries the write-side GORM databases from all modules (via injected *gorm.DB)
// and computes fresh dashboard snapshots and statistics.
// The builder runs as a background job and on demand via the API.
package builder

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/projection/domain/readmodel"
	"github.com/nd/mes-platform/modules/projection/domain/repository"
	"github.com/nd/mes-platform/pkg/logger"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// ProjectionBuilder rebuilds read models from raw database state.
// It is called periodically by the background worker and on-demand by the API.
type ProjectionBuilder struct {
	db            *gorm.DB
	dashboardRepo repository.DashboardRepository
	orderRepo     repository.OrderStatsRepository
	workerRepo    repository.WorkerStatsRepository
	log           *logger.Logger
}

func NewProjectionBuilder(
	db *gorm.DB,
	dashboardRepo repository.DashboardRepository,
	orderRepo repository.OrderStatsRepository,
	workerRepo repository.WorkerStatsRepository,
	log *logger.Logger,
) *ProjectionBuilder {
	return &ProjectionBuilder{
		db:            db,
		dashboardRepo: dashboardRepo,
		orderRepo:     orderRepo,
		workerRepo:    workerRepo,
		log:           log.With(logger.Module("projection")),
	}
}

// RebuildDashboard recomputes and persists the dashboard snapshot for today.
// This is the primary projection that aggregates real-time factory status.
func (b *ProjectionBuilder) RebuildDashboard(ctx context.Context) (*readmodel.DashboardSnapshot, error) {
	now := time.Now().UTC()
	snapshot := &readmodel.DashboardSnapshot{
		ID:           uuid.New(),
		SnapshotDate: now,
		ComputedAt:   now,
	}

	// ── Production Orders ──────────────────────────────────────────────────
	type orderCount struct {
		Status string
		Count  int
	}
	var orderCounts []orderCount
	b.db.WithContext(ctx).
		Raw("SELECT status, COUNT(*) as count FROM production_orders GROUP BY status").
		Scan(&orderCounts)

	for _, c := range orderCounts {
		snapshot.TotalOrders += c.Count
		switch c.Status {
		case "draft":
			snapshot.DraftOrders = c.Count
		case "released":
			snapshot.ReleasedOrders = c.Count
		case "in_progress":
			snapshot.InProgressOrders = c.Count
		case "completed":
			snapshot.CompletedOrders = c.Count
		case "cancelled":
			snapshot.CancelledOrders = c.Count
		}
	}

	// ── Work Orders ────────────────────────────────────────────────────────
	type woCount struct {
		Status string
		Count  int
	}
	var woCounts []woCount
	b.db.WithContext(ctx).
		Raw("SELECT status, COUNT(*) as count FROM production_work_orders GROUP BY status").
		Scan(&woCounts)

	for _, c := range woCounts {
		snapshot.TotalWorkOrders += c.Count
		switch c.Status {
		case "pending":
			snapshot.PendingWorkOrders = c.Count
		case "in_progress":
			snapshot.ActiveWorkOrders = c.Count
		case "completed":
			snapshot.CompletedWorkOrders = c.Count
		}
	}

	// ── Workforce & Planning Schedule Statistics ─────────────────────────
	todayTrunc := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	var totalWorkers int
	b.db.WithContext(ctx).
		Raw("SELECT COUNT(*) FROM workforce_workers WHERE deleted_at IS NULL AND status = 'active'").
		Scan(&totalWorkers)

	var onLeaveWorkers int
	b.db.WithContext(ctx).
		Raw("SELECT COUNT(DISTINCT worker_id) FROM planning_leaves WHERE status = 'approved' AND start_date <= ? AND end_date >= ?", todayTrunc, todayTrunc).
		Scan(&onLeaveWorkers)

	var busyWorkers int
	b.db.WithContext(ctx).
		Raw(`
			SELECT COUNT(DISTINCT w.id) 
			FROM workforce_workers w
			LEFT JOIN workforce_teams t ON w.team_id = t.id
			WHERE w.deleted_at IS NULL AND w.status = 'active' AND (
				w.id IN (
					SELECT wa.worker_id 
					FROM planning_worker_assignments wa
					JOIN planning_shifts s ON wa.shift_id = s.id
					WHERE s.date = ?
				) OR 
				w.team_id IN (
					SELECT ta.team_id
					FROM planning_team_assignments ta
					JOIN planning_shifts s ON ta.shift_id = s.id
					WHERE s.date = ?
				)
			)
		`, todayTrunc, todayTrunc).
		Scan(&busyWorkers)

	var overtimeWorkers int
	b.db.WithContext(ctx).
		Raw("SELECT COUNT(DISTINCT worker_id) FROM planning_overtimes WHERE status = 'approved' AND date = ?", todayTrunc).
		Scan(&overtimeWorkers)

	availableWorkers := totalWorkers - busyWorkers - onLeaveWorkers
	if availableWorkers < 0 {
		availableWorkers = 0
	}

	snapshot.TotalWorkers = totalWorkers
	snapshot.AvailableWorkers = availableWorkers
	snapshot.OnLeaveWorkers = onLeaveWorkers
	snapshot.BusyWorkers = busyWorkers
	snapshot.UnassignedWorkers = availableWorkers
	snapshot.OvertimeWorkers = overtimeWorkers

	// ── Assignments ───────────────────────────────────────────────────────
	type assignCount struct {
		Status string
		Count  int
	}
	var assignCounts []assignCount
	b.db.WithContext(ctx).
		Raw("SELECT status, COUNT(*) as count FROM assignment_assignments GROUP BY status").
		Scan(&assignCounts)

	var avgScore float64
	b.db.WithContext(ctx).
		Raw("SELECT COALESCE(AVG(score), 0) FROM assignment_assignments WHERE status = 'approved'").
		Scan(&avgScore)

	for _, c := range assignCounts {
		switch c.Status {
		case "proposed":
			snapshot.OpenAssignments = c.Count
		case "approved":
			snapshot.ApprovedAssignments = c.Count
		}
	}
	snapshot.AvgAssignmentScore = avgScore

	if err := b.dashboardRepo.SaveSnapshot(ctx, snapshot); err != nil {
		b.log.Error("failed to save dashboard snapshot", logger.Err(err))
		return nil, err
	}

	b.log.Info("dashboard snapshot rebuilt", zap.String("date", now.Format("2006-01-02")))
	return snapshot, nil
}

// RebuildOrderStats recomputes order statistics for all periods.
func (b *ProjectionBuilder) RebuildOrderStats(ctx context.Context, period readmodel.StatsPeriod) error {
	now := time.Now().UTC()

	type rawStats struct {
		OrdersCreated   int
		OrdersCompleted int
		OrdersCancelled int
		TotalQuantity   int
	}

	var start, end time.Time
	switch period {
	case readmodel.PeriodWeekly:
		weekday := int(now.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		start = time.Date(now.Year(), now.Month(), now.Day()-weekday+1, 0, 0, 0, 0, time.UTC)
		end = start.AddDate(0, 0, 6)
	case readmodel.PeriodMonthly:
		start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		end = start.AddDate(0, 1, -1)
	default:
		start = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		end = start
	}

	var created, completed, cancelled, totalQty int
	b.db.WithContext(ctx).
		Raw("SELECT COUNT(*) FROM production_orders WHERE created_at >= ? AND created_at < ?",
			start, end.AddDate(0, 0, 1)).Scan(&created)
	b.db.WithContext(ctx).
		Raw("SELECT COUNT(*) FROM production_orders WHERE status = 'completed' AND updated_at >= ? AND updated_at < ?",
			start, end.AddDate(0, 0, 1)).Scan(&completed)
	b.db.WithContext(ctx).
		Raw("SELECT COUNT(*) FROM production_orders WHERE status = 'cancelled' AND updated_at >= ? AND updated_at < ?",
			start, end.AddDate(0, 0, 1)).Scan(&cancelled)
	b.db.WithContext(ctx).
		Raw("SELECT COALESCE(SUM(quantity), 0) FROM production_orders WHERE status = 'completed' AND updated_at >= ? AND updated_at < ?",
			start, end.AddDate(0, 0, 1)).Scan(&totalQty)

	stats := &readmodel.OrderStats{
		ID:                 uuid.New(),
		Period:             period,
		PeriodStart:        start,
		PeriodEnd:          end,
		OrdersCreated:      created,
		OrdersCompleted:    completed,
		OrdersCancelled:    cancelled,
		TotalUnitsProduced: totalQty,
	}

	return b.orderRepo.Upsert(ctx, stats)
}
