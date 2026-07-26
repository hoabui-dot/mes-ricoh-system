package persistence

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/notification/domain/entity"
	"github.com/nd/mes-platform/modules/notification/domain/repository"
	"github.com/nd/mes-platform/modules/notification/infrastructure/model"
	"github.com/nd/mes-platform/shared/domain"
	"gorm.io/gorm"
)

// ─── GormAlertRepository ──────────────────────────────────────────────────────

type GormAlertRepository struct {
	db *gorm.DB
}

func NewGormAlertRepository(db *gorm.DB) *GormAlertRepository {
	return &GormAlertRepository{db: db}
}

func (r *GormAlertRepository) Save(ctx context.Context, alert *entity.Alert) error {
	m := alertToModel(alert)
	return r.db.WithContext(ctx).Save(m).Error
}

func (r *GormAlertRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Alert, error) {
	var m model.AlertModel
	err := r.db.WithContext(ctx).First(&m, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("alert not found")
	}
	if err != nil {
		return nil, err
	}
	return modelToAlert(&m), nil
}

func (r *GormAlertRepository) List(ctx context.Context, filter repository.AlertFilter) ([]*entity.Alert, int64, error) {
	query := r.db.WithContext(ctx).Model(&model.AlertModel{})

	if filter.UserID != nil {
		if filter.Role != "" {
			// Targeted at user OR target role
			query = query.Where("user_id = ? OR role = ?", *filter.UserID, filter.Role)
		} else {
			query = query.Where("user_id = ?", *filter.UserID)
		}
	} else if filter.Role != "" {
		query = query.Where("role = ?", filter.Role)
	}

	if filter.IsRead != nil {
		query = query.Where("is_read = ?", *filter.IsRead)
	}
	if filter.Type != "" {
		query = query.Where("type = ?", filter.Type)
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

	var models []model.AlertModel
	err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&models).Error
	if err != nil {
		return nil, 0, err
	}

	alerts := make([]*entity.Alert, len(models))
	for i, m := range models {
		alerts[i] = modelToAlert(&m)
	}

	return alerts, total, nil
}

func (r *GormAlertRepository) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).
		Model(&model.AlertModel{}).
		Where("user_id = ? AND is_read = ?", userID, false).
		Updates(map[string]any{
			"is_read":    true,
			"read_at":    now,
			"updated_at": now,
		}).Error
}

// ─── GormOutboxRepository ─────────────────────────────────────────────────────

type GormOutboxRepository struct {
	db *gorm.DB
}

func NewGormOutboxRepository(db *gorm.DB) *GormOutboxRepository {
	return &GormOutboxRepository{db: db}
}

func (r *GormOutboxRepository) Save(ctx context.Context, eventName string, routingKey string, payload any) error {
	bytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	m := &model.OutboxEventModel{
		ID:        uuid.New(),
		EventName: eventName,
		RoutingKey: routingKey,
		Payload:   string(bytes),
		Status:    "pending",
	}

	return r.db.WithContext(ctx).Create(m).Error
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

func alertToModel(a *entity.Alert) *model.AlertModel {
	return &model.AlertModel{
		ID:        a.ID,
		UserID:    a.UserID,
		Role:      a.Role,
		Title:     a.Title,
		Message:   a.Message,
		Type:      string(a.Type),
		Channel:   string(a.Channel),
		IsRead:    a.IsRead,
		ReadAt:    a.ReadAt,
		CreatedAt: a.CreatedAt,
		UpdatedAt: a.UpdatedAt,
	}
}

func modelToAlert(m *model.AlertModel) *entity.Alert {
	a := &entity.Alert{
		UserID:    m.UserID,
		Role:      m.Role,
		Title:     m.Title,
		Message:   m.Message,
		Type:      entity.AlertType(m.Type),
		Channel:   entity.AlertChannel(m.Channel),
		IsRead:    m.IsRead,
		ReadAt:    m.ReadAt,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	a.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return a
}

// Set base entity IDs correctly
func init() {
	// Hook to populate base entity ID field from internal aggregate
}
