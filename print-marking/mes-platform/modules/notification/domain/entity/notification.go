package entity

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

type AlertType string

const (
	AlertTypeInfo     AlertType = "info"
	AlertTypeWarning  AlertType = "warning"
	AlertTypeCritical AlertType = "critical"
)

type AlertChannel string

const (
	AlertChannelEmail AlertChannel = "email"
	AlertChannelInApp AlertChannel = "in_app"
	AlertChannelBoth  AlertChannel = "both"
)

// Alert is the Aggregate Root representing a notification dispatched to users or roles.
type Alert struct {
	domain.AggregateRoot
	UserID    *uuid.UUID // Logical reference to targeted User (optional)
	Role      string     // Target Role (optional, for role-based notifications)
	Title     string     // Subject/headline of alert
	Message   string     // Content body of alert
	Type      AlertType  // severity class
	Channel   AlertChannel
	IsRead    bool
	ReadAt    *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

// NewAlert instantiates a new Alert domain entity with validation checks.
func NewAlert(userID *uuid.UUID, role string, title, message string, t AlertType, c AlertChannel) (*Alert, error) {
	if strings.TrimSpace(title) == "" {
		return nil, errors.New("alert title is required")
	}
	if strings.TrimSpace(message) == "" {
		return nil, errors.New("alert message is required")
	}
	if userID == nil && strings.TrimSpace(role) == "" {
		return nil, errors.New("alert must target either a specific user or a role")
	}

	now := time.Now().UTC()
	alert := &Alert{
		AggregateRoot: domain.AggregateRoot{
			BaseEntity: domain.BaseEntity{
				ID: uuid.New(),
			},
		},
		UserID:    userID,
		Role:      strings.ToLower(strings.TrimSpace(role)),
		Title:     title,
		Message:   message,
		Type:      t,
		Channel:   c,
		IsRead:    false,
		CreatedAt: now,
		UpdatedAt: now,
	}

	// Record notification event
	alert.RecordEvent(NewAlertCreatedEvent(alert.ID, userID, alert.Role, title, string(t)))
	return alert, nil
}

// MarkAsRead flags the alert read state.
func (a *Alert) MarkAsRead() {
	if !a.IsRead {
		now := time.Now().UTC()
		a.IsRead = true
		a.ReadAt = &now
		a.UpdatedAt = now
	}
}

// NewAlertCreatedEvent helper to instantiate outbox event payload wrapper.
func NewAlertCreatedEvent(alertID uuid.UUID, userID *uuid.UUID, role, title, t string) AlertCreatedEvent {
	return AlertCreatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.notification.AlertCreated"),
		AlertID:         alertID,
		UserID:          userID,
		Role:            role,
		Title:           title,
		Type:            t,
	}
}

// ─── Events ───────────────────────────────────────────────────────────────────

type AlertCreatedEvent struct {
	domain.BaseDomainEvent
	AlertID uuid.UUID  `json:"alert_id"`
	UserID  *uuid.UUID `json:"user_id,omitempty"`
	Role    string     `json:"role,omitempty"`
	Title   string     `json:"title"`
	Type    string     `json:"type"`
}

func (e AlertCreatedEvent) EventName() string {
	return "mes.notification.AlertCreated"
}
