package persistence

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/projection/domain/readmodel"
	"github.com/nd/mes-platform/modules/projection/domain/repository"
	"github.com/nd/mes-platform/modules/projection/infrastructure/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ─── Dashboard Repository ─────────────────────────────────────────────────────

type GormDashboardRepository struct {
	db *gorm.DB
}

func NewGormDashboardRepository(db *gorm.DB) *GormDashboardRepository {
	return &GormDashboardRepository{db: db}
}

func (r *GormDashboardRepository) SaveSnapshot(ctx context.Context, s *readmodel.DashboardSnapshot) error {
	m := snapshotToModel(s)
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "snapshot_date"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"total_orders", "draft_orders", "released_orders",
				"in_progress_orders", "completed_orders", "cancelled_orders",
				"total_work_orders", "pending_work_orders", "active_work_orders", "completed_work_orders",
				"total_workers", "available_workers", "on_leave_workers",
				"busy_workers", "unassigned_workers", "overtime_workers",
				"open_assignments", "approved_assignments", "avg_assignment_score",
				"computed_at", "updated_at",
			}),
		}).
		Create(m).Error
}

func (r *GormDashboardRepository) GetSnapshot(ctx context.Context, date time.Time) (*readmodel.DashboardSnapshot, error) {
	truncated := truncateToDay(date)
	var m model.DashboardSnapshotModel
	err := r.db.WithContext(ctx).
		Where("snapshot_date = ?", truncated).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return modelToSnapshot(&m), nil
}

func (r *GormDashboardRepository) GetLatest(ctx context.Context) (*readmodel.DashboardSnapshot, error) {
	var m model.DashboardSnapshotModel
	err := r.db.WithContext(ctx).
		Order("snapshot_date DESC").
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return modelToSnapshot(&m), nil
}

// ─── Order Stats Repository ───────────────────────────────────────────────────

type GormOrderStatsRepository struct {
	db *gorm.DB
}

func NewGormOrderStatsRepository(db *gorm.DB) *GormOrderStatsRepository {
	return &GormOrderStatsRepository{db: db}
}

func (r *GormOrderStatsRepository) Upsert(ctx context.Context, s *readmodel.OrderStats) error {
	m := orderStatsToModel(s)
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "period"}, {Name: "period_start"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"orders_created", "orders_completed", "orders_cancelled",
				"avg_completion_days", "total_units_produced", "updated_at",
			}),
		}).
		Create(m).Error
}

func (r *GormOrderStatsRepository) List(ctx context.Context, period readmodel.StatsPeriod, limit int) ([]*readmodel.OrderStats, error) {
	if limit <= 0 {
		limit = 12
	}
	var models []model.OrderStatsModel
	err := r.db.WithContext(ctx).
		Where("period = ?", string(period)).
		Order("period_start DESC").
		Limit(limit).
		Find(&models).Error
	if err != nil {
		return nil, err
	}
	result := make([]*readmodel.OrderStats, len(models))
	for i, m := range models {
		result[i] = modelToOrderStats(&m)
	}
	return result, nil
}

// ─── Worker Stats Repository ──────────────────────────────────────────────────

type GormWorkerStatsRepository struct {
	db *gorm.DB
}

func NewGormWorkerStatsRepository(db *gorm.DB) *GormWorkerStatsRepository {
	return &GormWorkerStatsRepository{db: db}
}

func (r *GormWorkerStatsRepository) Upsert(ctx context.Context, s *readmodel.WorkerStats) error {
	m := workerStatsToModel(s)
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "worker_id"}, {Name: "period"}, {Name: "period_start"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"assignments_count", "approved_count", "overridden_count", "avg_score", "updated_at",
			}),
		}).
		Create(m).Error
}

func (r *GormWorkerStatsRepository) ListTopWorkers(ctx context.Context, period readmodel.StatsPeriod, date time.Time, limit int) ([]*readmodel.WorkerStats, error) {
	if limit <= 0 {
		limit = 10
	}
	periodStart := periodStartFor(period, date)
	var models []model.WorkerStatsModel
	err := r.db.WithContext(ctx).
		Where("period = ? AND period_start = ?", string(period), periodStart).
		Order("avg_score DESC").
		Limit(limit).
		Find(&models).Error
	if err != nil {
		return nil, err
	}
	result := make([]*readmodel.WorkerStats, len(models))
	for i, m := range models {
		result[i] = modelToWorkerStats(&m)
	}
	return result, nil
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

func snapshotToModel(s *readmodel.DashboardSnapshot) *model.DashboardSnapshotModel {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return &model.DashboardSnapshotModel{
		ID:                  s.ID,
		SnapshotDate:        truncateToDay(s.SnapshotDate),
		TotalOrders:         s.TotalOrders,
		DraftOrders:         s.DraftOrders,
		ReleasedOrders:      s.ReleasedOrders,
		InProgressOrders:    s.InProgressOrders,
		CompletedOrders:     s.CompletedOrders,
		CancelledOrders:     s.CancelledOrders,
		TotalWorkOrders:     s.TotalWorkOrders,
		PendingWorkOrders:   s.PendingWorkOrders,
		ActiveWorkOrders:    s.ActiveWorkOrders,
		CompletedWorkOrders: s.CompletedWorkOrders,
		TotalWorkers:        s.TotalWorkers,
		AvailableWorkers:    s.AvailableWorkers,
		OnLeaveWorkers:      s.OnLeaveWorkers,
		BusyWorkers:         s.BusyWorkers,
		UnassignedWorkers:   s.UnassignedWorkers,
		OvertimeWorkers:     s.OvertimeWorkers,
		OpenAssignments:     s.OpenAssignments,
		ApprovedAssignments: s.ApprovedAssignments,
		AvgAssignmentScore:  s.AvgAssignmentScore,
		ComputedAt:          s.ComputedAt,
	}
}

func modelToSnapshot(m *model.DashboardSnapshotModel) *readmodel.DashboardSnapshot {
	return &readmodel.DashboardSnapshot{
		ID:                  m.ID,
		SnapshotDate:        m.SnapshotDate,
		TotalOrders:         m.TotalOrders,
		DraftOrders:         m.DraftOrders,
		ReleasedOrders:      m.ReleasedOrders,
		InProgressOrders:    m.InProgressOrders,
		CompletedOrders:     m.CompletedOrders,
		CancelledOrders:     m.CancelledOrders,
		TotalWorkOrders:     m.TotalWorkOrders,
		PendingWorkOrders:   m.PendingWorkOrders,
		ActiveWorkOrders:    m.ActiveWorkOrders,
		CompletedWorkOrders: m.CompletedWorkOrders,
		TotalWorkers:        m.TotalWorkers,
		AvailableWorkers:    m.AvailableWorkers,
		OnLeaveWorkers:      m.OnLeaveWorkers,
		BusyWorkers:         m.BusyWorkers,
		UnassignedWorkers:   m.UnassignedWorkers,
		OvertimeWorkers:     m.OvertimeWorkers,
		OpenAssignments:     m.OpenAssignments,
		ApprovedAssignments: m.ApprovedAssignments,
		AvgAssignmentScore:  m.AvgAssignmentScore,
		ComputedAt:          m.ComputedAt,
		CreatedAt:           m.CreatedAt,
		UpdatedAt:           m.UpdatedAt,
	}
}

func orderStatsToModel(s *readmodel.OrderStats) *model.OrderStatsModel {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return &model.OrderStatsModel{
		ID:                 s.ID,
		Period:             string(s.Period),
		PeriodStart:        s.PeriodStart,
		PeriodEnd:          s.PeriodEnd,
		OrdersCreated:      s.OrdersCreated,
		OrdersCompleted:    s.OrdersCompleted,
		OrdersCancelled:    s.OrdersCancelled,
		AvgCompletionDays:  s.AvgCompletionDays,
		TotalUnitsProduced: s.TotalUnitsProduced,
	}
}

func modelToOrderStats(m *model.OrderStatsModel) *readmodel.OrderStats {
	return &readmodel.OrderStats{
		ID:                 m.ID,
		Period:             readmodel.StatsPeriod(m.Period),
		PeriodStart:        m.PeriodStart,
		PeriodEnd:          m.PeriodEnd,
		OrdersCreated:      m.OrdersCreated,
		OrdersCompleted:    m.OrdersCompleted,
		OrdersCancelled:    m.OrdersCancelled,
		AvgCompletionDays:  m.AvgCompletionDays,
		TotalUnitsProduced: m.TotalUnitsProduced,
		CreatedAt:          m.CreatedAt,
		UpdatedAt:          m.UpdatedAt,
	}
}

func workerStatsToModel(s *readmodel.WorkerStats) *model.WorkerStatsModel {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return &model.WorkerStatsModel{
		ID:               s.ID,
		WorkerID:         s.WorkerID,
		WorkerName:       s.WorkerName,
		Period:           string(s.Period),
		PeriodStart:      s.PeriodStart,
		AssignmentsCount: s.AssignmentsCount,
		ApprovedCount:    s.ApprovedCount,
		OverriddenCount:  s.OverriddenCount,
		AvgScore:         s.AvgScore,
	}
}

func modelToWorkerStats(m *model.WorkerStatsModel) *readmodel.WorkerStats {
	return &readmodel.WorkerStats{
		ID:               m.ID,
		WorkerID:         m.WorkerID,
		WorkerName:       m.WorkerName,
		Period:           readmodel.StatsPeriod(m.Period),
		PeriodStart:      m.PeriodStart,
		AssignmentsCount: m.AssignmentsCount,
		ApprovedCount:    m.ApprovedCount,
		OverriddenCount:  m.OverriddenCount,
		AvgScore:         m.AvgScore,
		CreatedAt:        m.CreatedAt,
		UpdatedAt:        m.UpdatedAt,
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func truncateToDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func periodStartFor(period readmodel.StatsPeriod, date time.Time) time.Time {
	y, m, d := date.Date()
	switch period {
	case readmodel.PeriodWeekly:
		weekday := int(date.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		return time.Date(y, m, d-weekday+1, 0, 0, 0, 0, time.UTC)
	case readmodel.PeriodMonthly:
		return time.Date(y, m, 1, 0, 0, 0, 0, time.UTC)
	default: // daily
		return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	}
}

// Ensure interfaces are satisfied.
var _ repository.DashboardRepository = (*GormDashboardRepository)(nil)
var _ repository.OrderStatsRepository = (*GormOrderStatsRepository)(nil)
var _ repository.WorkerStatsRepository = (*GormWorkerStatsRepository)(nil)
