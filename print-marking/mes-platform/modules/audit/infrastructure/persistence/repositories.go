package persistence

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/audit/domain/entity"
	"github.com/nd/mes-platform/modules/audit/domain/repository"
	"github.com/nd/mes-platform/modules/audit/infrastructure/model"
	"github.com/nd/mes-platform/shared/domain"
	"gorm.io/gorm"
)

type GormAuditRepository struct {
	db *gorm.DB
}

func NewGormAuditRepository(db *gorm.DB) *GormAuditRepository {
	return &GormAuditRepository{db: db}
}

func (r *GormAuditRepository) Save(ctx context.Context, log *entity.AuditLog) error {
	m := auditToModel(log)
	return r.db.WithContext(ctx).Create(m).Error
}

func (r *GormAuditRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.AuditLog, error) {
	var m model.AuditLogModel
	err := r.db.WithContext(ctx).First(&m, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("audit log not found")
	}
	if err != nil {
		return nil, err
	}
	return modelToAudit(&m), nil
}

func (r *GormAuditRepository) List(ctx context.Context, filter repository.AuditFilter) ([]*entity.AuditLog, int64, error) {
	query := r.db.WithContext(ctx).Model(&model.AuditLogModel{})

	if filter.UserID != nil {
		query = query.Where("user_id = ?", *filter.UserID)
	}
	if filter.TraceID != "" {
		query = query.Where("trace_id = ?", filter.TraceID)
	}
	if filter.CorrelationID != "" {
		query = query.Where("correlation_id = ?", filter.CorrelationID)
	}
	if filter.EntityName != "" {
		query = query.Where("entity_name = ?", filter.EntityName)
	}
	if filter.EntityID != "" {
		query = query.Where("entity_id = ?", filter.EntityID)
	}
	if filter.Action != "" {
		query = query.Where("action = ?", filter.Action)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var models []model.AuditLogModel
	err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&models).Error
	if err != nil {
		return nil, 0, err
	}

	logs := make([]*entity.AuditLog, len(models))
	for i, m := range models {
		logs[i] = modelToAudit(&m)
	}

	return logs, total, nil
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

func auditToModel(a *entity.AuditLog) *model.AuditLogModel {
	return &model.AuditLogModel{
		ID:            a.ID,
		TraceID:       a.TraceID,
		CorrelationID: a.CorrelationID,
		UserID:        a.UserID,
		Action:        a.Action,
		EntityName:    a.EntityName,
		EntityID:      a.EntityID,
		OldValues:     a.OldValues,
		NewValues:     a.NewValues,
		CreatedAt:     a.CreatedAt,
	}
}

func modelToAudit(m *model.AuditLogModel) *entity.AuditLog {
	a := &entity.AuditLog{
		TraceID:       m.TraceID,
		CorrelationID: m.CorrelationID,
		UserID:        m.UserID,
		Action:        m.Action,
		EntityName:    m.EntityName,
		EntityID:      m.EntityID,
		OldValues:     m.OldValues,
		NewValues:     m.NewValues,
	}
	a.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.CreatedAt,
	}
	return a
}
