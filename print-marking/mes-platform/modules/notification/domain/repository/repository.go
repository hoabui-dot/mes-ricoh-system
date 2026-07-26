package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/notification/domain/entity"
)

type AlertFilter struct {
	UserID   *uuid.UUID
	Role     string
	IsRead   *bool
	Type     string
	Page     int
	PageSize int
}

// AlertRepository specifies the persistence contract for Alert entities.
type AlertRepository interface {
	Save(ctx context.Context, alert *entity.Alert) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Alert, error)
	List(ctx context.Context, filter AlertFilter) ([]*entity.Alert, int64, error)
	MarkAllRead(ctx context.Context, userID uuid.UUID) error
}

// OutboxRepository defines ports to save outgoing integration outbox events.
type OutboxRepository interface {
	Save(ctx context.Context, eventName string, routingKey string, payload any) error
}
