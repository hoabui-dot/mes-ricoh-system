package domain

import "time"

// DomainEvent is the interface all domain events must implement.
// Events are immutable value objects representing facts that occurred.
type DomainEvent interface {
	// EventName returns the fully qualified event name used as the RabbitMQ routing key.
	// Convention: mes.<module>.<EventName>  e.g. "mes.identity.UserRegistered"
	EventName() string
	// OccurredAt returns the time the event was raised.
	OccurredAt() time.Time
}

// BaseDomainEvent provides common fields for all domain events.
// Embed this in every concrete event struct.
type BaseDomainEvent struct {
	Name       string    `json:"event_name"`
	OccurredOn time.Time `json:"occurred_at"`
}

// EventName implements DomainEvent.
func (e BaseDomainEvent) EventName() string { return e.Name }

// OccurredAt implements DomainEvent.
func (e BaseDomainEvent) OccurredAt() time.Time { return e.OccurredOn }

// NewBaseDomainEvent creates a BaseDomainEvent stamped with the current UTC time.
func NewBaseDomainEvent(name string) BaseDomainEvent {
	return BaseDomainEvent{
		Name:       name,
		OccurredOn: time.Now().UTC(),
	}
}
