package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/audit/domain/entity"
)

type AuditFilter struct {
	UserID        *uuid.UUID
	TraceID       string
	CorrelationID string
	EntityName    string
	EntityID      string
	Action        string
	Page          int
	PageSize      int
}

// AuditRepository defines the persistence contract for audit logs.
type AuditRepository interface {
	Save(ctx context.Context, log *entity.AuditLog) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.AuditLog, error)
	List(ctx context.Context, filter AuditFilter) ([]*entity.AuditLog, int64, error)
}
