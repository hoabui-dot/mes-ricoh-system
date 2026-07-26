package model

import (
	"time"

	"github.com/google/uuid"
)

// AuditLogModel is the GORM model mapping to database table audit_logs.
type AuditLogModel struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey"`
	TraceID       string    `gorm:"type:varchar(255);not null;index"`
	CorrelationID string    `gorm:"type:varchar(255);not null;index"`
	UserID        *uuid.UUID `gorm:"type:uuid;index"`
	Action        string    `gorm:"type:varchar(255);not null"`
	EntityName    string    `gorm:"type:varchar(255);not null;index:idx_entity"`
	EntityID      string    `gorm:"type:varchar(255);not null;index:idx_entity"`
	OldValues     string    `gorm:"type:text"`
	NewValues     string    `gorm:"type:text"`
	CreatedAt     time.Time `gorm:"autoCreateTime"`
}

func (AuditLogModel) TableName() string { return "audit_logs" }
