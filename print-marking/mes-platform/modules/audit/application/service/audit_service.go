package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/audit/domain/entity"
	"github.com/nd/mes-platform/modules/audit/domain/repository"
	"github.com/nd/mes-platform/pkg/logger"
)

type AuditService struct {
	repo repository.AuditRepository
	log  *logger.Logger
}

func NewAuditService(repo repository.AuditRepository, log *logger.Logger) *AuditService {
	return &AuditService{
		repo: repo,
		log:  log.With(logger.Module("audit")),
	}
}

func (s *AuditService) Log(ctx context.Context, traceID, correlationID string, userID *uuid.UUID, action, entityName, entityID string, oldValues, newValues string) error {
	logEntry, err := entity.NewAuditLog(traceID, correlationID, userID, action, entityName, entityID, oldValues, newValues)
	if err != nil {
		return err
	}

	return s.repo.Save(ctx, logEntry)
}

func (s *AuditService) GetLog(ctx context.Context, id uuid.UUID) (*entity.AuditLog, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *AuditService) ListLogs(ctx context.Context, filter repository.AuditFilter) ([]*entity.AuditLog, int64, error) {
	return s.repo.List(ctx, filter)
}
