package persistence

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/assignment/domain/entity"
	"github.com/nd/mes-platform/modules/assignment/domain/repository"
	"github.com/nd/mes-platform/modules/assignment/infrastructure/model"
	"github.com/nd/mes-platform/shared/outbox"
	"gorm.io/gorm"
)

// ─── Assignment Repository ─────────────────────────────────────────────────────

type GormAssignmentRepository struct {
	db *gorm.DB
}

func NewGormAssignmentRepository(db *gorm.DB) *GormAssignmentRepository {
	return &GormAssignmentRepository{db: db}
}

func (r *GormAssignmentRepository) Save(ctx context.Context, a *entity.Assignment) error {
	m := assignmentToModel(a)
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Upsert the assignment itself (no workers)
		assignmentOnly := model.AssignmentModel{
			ID:          m.ID,
			WorkOrderID: m.WorkOrderID,
			OperationID: m.OperationID,
			Revision:    m.Revision,
			Status:      m.Status,
			ProposedBy:  m.ProposedBy,
			ReviewedBy:  m.ReviewedBy,
			Score:       m.Score,
			Notes:       m.Notes,
			CreatedAt:   m.CreatedAt,
			UpdatedAt:   m.UpdatedAt,
		}
		if err := tx.Save(&assignmentOnly).Error; err != nil {
			return err
		}

		// Only insert workers if they exist and none have been persisted yet
		// (workers are immutable once created — the history must not change)
		if len(m.Workers) > 0 {
			var existing int64
			tx.Model(&model.AssignedWorkerModel{}).
				Where("assignment_id = ?", m.ID).
				Count(&existing)
			if existing == 0 {
				if err := tx.Create(&m.Workers).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func (r *GormAssignmentRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Assignment, error) {
	var m model.AssignmentModel
	err := r.db.WithContext(ctx).
		Preload("Workers").
		Where("id = ?", id).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrAssignmentNotFound
	}
	if err != nil {
		return nil, err
	}
	return modelToAssignment(&m), nil
}

func (r *GormAssignmentRepository) FindLatestRevision(ctx context.Context, workOrderID, operationID uuid.UUID) (*entity.Assignment, error) {
	var m model.AssignmentModel
	err := r.db.WithContext(ctx).
		Preload("Workers").
		Where("work_order_id = ? AND operation_id = ?", workOrderID, operationID).
		Order("revision DESC").
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrAssignmentNotFound
	}
	if err != nil {
		return nil, err
	}
	return modelToAssignment(&m), nil
}

func (r *GormAssignmentRepository) ListHistory(ctx context.Context, workOrderID, operationID uuid.UUID) ([]*entity.Assignment, error) {
	var models []model.AssignmentModel
	err := r.db.WithContext(ctx).
		Preload("Workers").
		Where("work_order_id = ? AND operation_id = ?", workOrderID, operationID).
		Order("revision DESC").
		Find(&models).Error
	if err != nil {
		return nil, err
	}
	assignments := make([]*entity.Assignment, len(models))
	for i, m := range models {
		assignments[i] = modelToAssignment(&m)
	}
	return assignments, nil
}

func (r *GormAssignmentRepository) List(ctx context.Context, filter repository.AssignmentFilter) ([]*entity.Assignment, int64, error) {
	query := r.db.WithContext(ctx).Model(&model.AssignmentModel{})

	if filter.WorkOrderID != nil {
		query = query.Where("work_order_id = ?", *filter.WorkOrderID)
	}
	if filter.OperationID != nil {
		query = query.Where("operation_id = ?", *filter.OperationID)
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page, pageSize := filter.Page, filter.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}

	var models []model.AssignmentModel
	err := query.
		Preload("Workers").
		Offset((page-1)*pageSize).
		Limit(pageSize).
		Order("created_at DESC").
		Find(&models).Error
	if err != nil {
		return nil, 0, err
	}

	assignments := make([]*entity.Assignment, len(models))
	for i, m := range models {
		assignments[i] = modelToAssignment(&m)
	}
	return assignments, total, nil
}

// ─── Outbox Repository ────────────────────────────────────────────────────────

type GormOutboxRepository struct {
	db *gorm.DB
}

func NewGormOutboxRepository(db *gorm.DB) *GormOutboxRepository {
	return &GormOutboxRepository{db: db}
}

func (r *GormOutboxRepository) Save(ctx context.Context, event *outbox.Event) error {
	m := &model.OutboxEventModel{
		ID:          event.ID,
		EventName:   event.EventName,
		RoutingKey:  event.RoutingKey,
		Payload:     event.Payload,
		Status:      string(event.Status),
		RetryCount:  event.RetryCount,
		Error:       event.Error,
		CreatedAt:   event.CreatedAt,
		UpdatedAt:   event.UpdatedAt,
	}
	return r.db.WithContext(ctx).Create(m).Error
}
