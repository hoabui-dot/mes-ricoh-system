package model

import (
	"time"

	"github.com/google/uuid"
)

// AlertModel is the GORM representation of a notification.
type AlertModel struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID    *uuid.UUID `gorm:"type:uuid;index"`
	Role      string    `gorm:"type:varchar(50);index"`
	Title     string    `gorm:"type:varchar(255);not null"`
	Message   string    `gorm:"type:text;not null"`
	Type      string    `gorm:"type:varchar(50);not null"`
	Channel   string    `gorm:"type:varchar(50);not null"`
	IsRead    bool      `gorm:"not null;default:false;index"`
	ReadAt    *time.Time
	CreatedAt time.Time `gorm:"autoCreateTime"`
	UpdatedAt time.Time `gorm:"autoUpdateTime"`
}

func (AlertModel) TableName() string { return "notification_alerts" }

// OutboxEventModel is the GORM model for the local outbox.
type OutboxEventModel struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	EventName   string    `gorm:"type:varchar(255);not null"`
	RoutingKey  string    `gorm:"type:varchar(255);not null"`
	Payload     string    `gorm:"type:text;not null"` // JSON string
	Status      string    `gorm:"type:varchar(50);not null;default:'pending'"`
	RetryCount  int       `gorm:"not null;default:0"`
	Error       *string   `gorm:"type:text"`
	PublishedAt *time.Time
	CreatedAt   time.Time `gorm:"autoCreateTime"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime"`
}

func (OutboxEventModel) TableName() string { return "notification_outbox_events" }
