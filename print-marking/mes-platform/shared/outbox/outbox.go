// Package outbox implements the Transactional Outbox Pattern.
// All domain events must be written to the outbox table inside the same
// database transaction as the business data — never published directly to
// RabbitMQ inside a business transaction.
package outbox

import (
	"time"

	"github.com/google/uuid"
)

// Status represents the lifecycle of an outbox event.
type Status string

const (
	StatusPending   Status = "pending"
	StatusPublished Status = "published"
	StatusFailed    Status = "failed"
)

// Event is the persisted outbox record.
// One row per domain event, stored in the module's own schema.
type Event struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	EventName   string     `gorm:"type:varchar(255);not null;index"`
	RoutingKey  string     `gorm:"type:varchar(255);not null"`
	Payload     []byte     `gorm:"type:jsonb;not null"`
	Status      Status     `gorm:"type:varchar(50);not null;default:'pending';index"`
	RetryCount  int        `gorm:"not null;default:0"`
	Error       string     `gorm:"type:text"`
	PublishedAt *time.Time `gorm:"index"`
	CreatedAt   time.Time  `gorm:"not null;autoCreateTime;index"`
	UpdatedAt   time.Time  `gorm:"not null;autoUpdateTime"`
}

// TableName must be overridden per module to isolate outbox tables.
// Define a concrete type embedding Event in each module's infrastructure layer.

// NewEvent creates a new pending outbox event ready to be inserted.
func NewEvent(eventName, routingKey string, payload []byte) *Event {
	return &Event{
		ID:         uuid.New(),
		EventName:  eventName,
		RoutingKey: routingKey,
		Payload:    payload,
		Status:     StatusPending,
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
	}
}

// MarkPublished transitions the event to published state.
func (e *Event) MarkPublished() {
	now := time.Now().UTC()
	e.Status = StatusPublished
	e.PublishedAt = &now
	e.UpdatedAt = now
}

// MarkFailed increments the retry counter and records the error.
func (e *Event) MarkFailed(errMsg string) {
	e.RetryCount++
	e.Error = errMsg
	e.Status = StatusFailed
	e.UpdatedAt = time.Now().UTC()
}

// IsPublishable returns true for events that can be retried.
func (e *Event) IsPublishable() bool {
	return e.Status == StatusPending || (e.Status == StatusFailed && e.RetryCount < 5)
}
