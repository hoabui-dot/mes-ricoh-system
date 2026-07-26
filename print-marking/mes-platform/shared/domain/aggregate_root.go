// Package domain provides base types for Domain-Driven Design across all MES modules.
// Every aggregate root and domain entity must embed AggregateRoot or BaseEntity.
package domain

import (
	"time"

	"github.com/google/uuid"
)

// BaseEntity provides common fields shared by all domain entities.
// Embed this in every entity struct.
type BaseEntity struct {
	ID        uuid.UUID  `json:"id"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
}

// NewBaseEntity creates a new BaseEntity with a generated UUID and current timestamps.
func NewBaseEntity() BaseEntity {
	now := time.Now().UTC()
	return BaseEntity{
		ID:        uuid.New(),
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// IsDeleted returns true when the entity has been soft-deleted.
func (b *BaseEntity) IsDeleted() bool {
	return b.DeletedAt != nil
}

// MarkDeleted sets the soft-delete timestamp.
func (b *BaseEntity) MarkDeleted() {
	now := time.Now().UTC()
	b.DeletedAt = &now
}

// Touch updates the UpdatedAt timestamp.
func (b *BaseEntity) Touch() {
	b.UpdatedAt = time.Now().UTC()
}

// ─── Aggregate Root ───────────────────────────────────────────────────────────

// AggregateRoot extends BaseEntity with domain event collection.
// Every aggregate must embed AggregateRoot and call RecordEvent when state changes.
type AggregateRoot struct {
	BaseEntity
	domainEvents []DomainEvent
}

// RecordEvent appends a domain event to the aggregate's pending event list.
// Events are published via the Outbox Pattern after the transaction commits.
func (a *AggregateRoot) RecordEvent(event DomainEvent) {
	a.domainEvents = append(a.domainEvents, event)
}

// PullEvents returns and clears all pending domain events.
// The application layer must call this after persisting the aggregate.
func (a *AggregateRoot) PullEvents() []DomainEvent {
	events := make([]DomainEvent, len(a.domainEvents))
	copy(events, a.domainEvents)
	a.domainEvents = nil
	return events
}

// HasEvents returns true if there are unpublished domain events.
func (a *AggregateRoot) HasEvents() bool {
	return len(a.domainEvents) > 0
}
