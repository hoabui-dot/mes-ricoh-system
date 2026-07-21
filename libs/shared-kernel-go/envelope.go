package sharedkernel

import (
	"time"

	"github.com/google/uuid"
)

type EventEnvelope[T any] struct {
	EventID       string    `json:"event_id"`
	EventType     string    `json:"event_type"`
	OccurredAt    string    `json:"occurred_at"`
	SourceService string    `json:"source_service"`
	TraceID       string    `json:"trace_id"`
	Payload       T         `json:"payload"`
}

func CreateEventEnvelope[T any](eventType, sourceService, traceID string, payload T) EventEnvelope[T] {
	return EventEnvelope[T]{
		EventID:       uuid.New().String(),
		EventType:     eventType,
		OccurredAt:    time.Now().UTC().Format(time.RFC3339Nano),
		SourceService: sourceService,
		TraceID:       traceID,
		Payload:       payload,
	}
}
