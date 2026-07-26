package entity

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// AuditLog is the aggregate root representing a recorded state mutation or user action.
type AuditLog struct {
	domain.BaseEntity
	TraceID       string
	CorrelationID string
	UserID        *uuid.UUID
	Action        string // e.g. "CREATE", "UPDATE", "DELETE"
	EntityName    string // e.g. "workforce_workers"
	EntityID      string // Primary Key of target entity
	OldValues     string // JSON string
	NewValues     string // JSON string
}

func NewAuditLog(traceID, correlationID string, userID *uuid.UUID, action, entityName, entityID string, oldValues, newValues string) (*AuditLog, error) {
	if strings.TrimSpace(traceID) == "" {
		return nil, errors.New("trace_id is required")
	}
	if strings.TrimSpace(action) == "" {
		return nil, errors.New("action is required")
	}
	if strings.TrimSpace(entityName) == "" {
		return nil, errors.New("entity_name is required")
	}
	if strings.TrimSpace(entityID) == "" {
		return nil, errors.New("entity_id is required")
	}

	return &AuditLog{
		BaseEntity: domain.BaseEntity{
			ID:        uuid.New(),
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		},
		TraceID:       traceID,
		CorrelationID: correlationID,
		UserID:        userID,
		Action:        strings.ToUpper(strings.TrimSpace(action)),
		EntityName:    strings.TrimSpace(entityName),
		EntityID:      strings.TrimSpace(entityID),
		OldValues:     oldValues,
		NewValues:     newValues,
	}, nil
}
