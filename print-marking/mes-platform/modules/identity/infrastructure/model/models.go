// Package model contains GORM persistence models for the Identity module.
// These are separate from the domain entities to preserve domain purity.
// Mappers translate between models and entities.
package model

import (
	"time"

	"github.com/google/uuid"
)

// ─── GORM Models ──────────────────────────────────────────────────────────────

// UserModel is the GORM persistence model for users.
type UserModel struct {
	ID                     uuid.UUID  `gorm:"type:uuid;primaryKey"`
	Username               string     `gorm:"type:varchar(50);uniqueIndex;not null"`
	Email                  string     `gorm:"type:varchar(255);uniqueIndex;not null"`
	PasswordHash           string     `gorm:"type:varchar(255);not null"`
	FullName               string     `gorm:"type:varchar(100)"`
	Phone                  string     `gorm:"type:varchar(20)"`
	Status                 string     `gorm:"type:varchar(50);not null;default:'active';index"`
	LastLoginAt            *time.Time
	PasswordResetToken     string     `gorm:"type:varchar(255)"`
	PasswordResetExpiresAt *time.Time
	CreatedAt              time.Time  `gorm:"autoCreateTime"`
	UpdatedAt              time.Time  `gorm:"autoUpdateTime"`
	DeletedAt              *time.Time `gorm:"index"`
	Roles                  []RoleModel `gorm:"many2many:identity_user_roles;joinForeignKey:UserID;joinReferences:RoleID"`
}

// TableName overrides the default GORM table name.
func (UserModel) TableName() string { return "identity_users" }

// RoleModel is the GORM persistence model for roles.
type RoleModel struct {
	ID          uuid.UUID         `gorm:"type:uuid;primaryKey"`
	Name        string            `gorm:"type:varchar(100);not null"`
	Code        string            `gorm:"type:varchar(100);uniqueIndex;not null"`
	Description string            `gorm:"type:varchar(255)"`
	IsSystem    bool              `gorm:"type:boolean;not null;default:false"`
	CreatedAt   time.Time         `gorm:"autoCreateTime"`
	UpdatedAt   time.Time         `gorm:"autoUpdateTime"`
	Permissions []PermissionModel `gorm:"many2many:identity_role_permissions;joinForeignKey:RoleID;joinReferences:PermissionID"`
}

// TableName overrides the default GORM table name.
func (RoleModel) TableName() string { return "identity_roles" }

// PermissionModel is the GORM persistence model for permissions.
type PermissionModel struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	Name        string    `gorm:"type:varchar(100);uniqueIndex;not null"`
	Description string    `gorm:"type:varchar(255)"`
	Resource    string    `gorm:"type:varchar(50);not null;index"`
	Action      string    `gorm:"type:varchar(50);not null"`
	Module      string    `gorm:"type:varchar(100);not null;default:'Identity';index"`
	DisplayName string    `gorm:"type:varchar(150)"`
	Category    string    `gorm:"type:varchar(100)"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime"`
}

// TableName overrides the default GORM table name.
func (PermissionModel) TableName() string { return "identity_permissions" }

// RefreshTokenModel is the GORM persistence model for refresh tokens.
type RefreshTokenModel struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null;index"`
	TokenHash string     `gorm:"type:varchar(255);uniqueIndex;not null"`
	ExpiresAt time.Time  `gorm:"not null;index"`
	RevokedAt *time.Time `gorm:"index"`
	UserAgent string     `gorm:"type:text"`
	IPAddress string     `gorm:"type:varchar(45)"`
	CreatedAt time.Time  `gorm:"autoCreateTime"`
	UpdatedAt time.Time  `gorm:"autoUpdateTime"`
}

// TableName overrides the default GORM table name.
func (RefreshTokenModel) TableName() string { return "identity_refresh_tokens" }

// AuditLogModel records every identity-related action for the audit trail.
type AuditLogModel struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID        *uuid.UUID `gorm:"type:uuid;index"`
	Action        string    `gorm:"type:varchar(100);not null;index"`
	Resource      string    `gorm:"type:varchar(100);not null"`
	ResourceID    string    `gorm:"type:varchar(255)"`
	OldValue      string    `gorm:"type:jsonb"`
	NewValue      string    `gorm:"type:jsonb"`
	IPAddress     string    `gorm:"type:varchar(45)"`
	UserAgent     string    `gorm:"type:text"`
	TraceID       string    `gorm:"type:varchar(255)"`
	CorrelationID string    `gorm:"type:varchar(255)"`
	CreatedAt     time.Time `gorm:"autoCreateTime;index"`
}

// TableName overrides the default GORM table name.
func (AuditLogModel) TableName() string { return "identity_audit_logs" }

// OutboxEventModel is the identity-scoped outbox table.
type OutboxEventModel struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	EventName   string     `gorm:"type:varchar(255);not null;index"`
	RoutingKey  string     `gorm:"type:varchar(255);not null"`
	Payload     []byte     `gorm:"type:jsonb;not null"`
	Status      string     `gorm:"type:varchar(50);not null;default:'pending';index"`
	RetryCount  int        `gorm:"not null;default:0"`
	Error       string     `gorm:"type:text"`
	PublishedAt *time.Time `gorm:"index"`
	CreatedAt   time.Time  `gorm:"autoCreateTime;index"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime"`
}

// TableName overrides the default GORM table name.
func (OutboxEventModel) TableName() string { return "identity_outbox_events" }
