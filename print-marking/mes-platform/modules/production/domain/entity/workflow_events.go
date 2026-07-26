package entity

import (
	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// WorkflowCreatedEvent is raised when a workflow is initialized.
type WorkflowCreatedEvent struct {
	domain.BaseDomainEvent
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowCode string    `json:"workflow_code"`
	Version      int       `json:"version"`
	UserID       string    `json:"user_id"`
}

func NewWorkflowCreatedEvent(id uuid.UUID, code string, version int, user string) WorkflowCreatedEvent {
	return WorkflowCreatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workflow.WorkflowCreated"),
		WorkflowID:      id,
		WorkflowCode:    code,
		Version:         version,
		UserID:          user,
	}
}

// WorkflowUpdatedEvent is raised when basic info changes.
type WorkflowUpdatedEvent struct {
	domain.BaseDomainEvent
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowCode string    `json:"workflow_code"`
	Version      int       `json:"version"`
	UserID       string    `json:"user_id"`
}

func NewWorkflowUpdatedEvent(id uuid.UUID, code string, version int, user string) WorkflowUpdatedEvent {
	return WorkflowUpdatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workflow.WorkflowUpdated"),
		WorkflowID:      id,
		WorkflowCode:    code,
		Version:         version,
		UserID:          user,
	}
}

// WorkflowPublishedEvent is raised when a workflow is published.
type WorkflowPublishedEvent struct {
	domain.BaseDomainEvent
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowCode string    `json:"workflow_code"`
	Version      int       `json:"version"`
	UserID       string    `json:"user_id"`
}

func NewWorkflowPublishedEvent(id uuid.UUID, code string, version int, user string) WorkflowPublishedEvent {
	return WorkflowPublishedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workflow.WorkflowPublished"),
		WorkflowID:      id,
		WorkflowCode:    code,
		Version:         version,
		UserID:          user,
	}
}

// WorkflowArchivedEvent is raised when a workflow is archived.
type WorkflowArchivedEvent struct {
	domain.BaseDomainEvent
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowCode string    `json:"workflow_code"`
	Version      int       `json:"version"`
	UserID       string    `json:"user_id"`
}

func NewWorkflowArchivedEvent(id uuid.UUID, code string, version int, user string) WorkflowArchivedEvent {
	return WorkflowArchivedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workflow.WorkflowArchived"),
		WorkflowID:      id,
		WorkflowCode:    code,
		Version:         version,
		UserID:          user,
	}
}

// WorkflowVersionCreatedEvent is raised when a workflow is cloned into a new version.
type WorkflowVersionCreatedEvent struct {
	domain.BaseDomainEvent
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowCode string    `json:"workflow_code"`
	Version      int       `json:"version"`
	UserID       string    `json:"user_id"`
}

func NewWorkflowVersionCreatedEvent(id uuid.UUID, code string, version int, user string) WorkflowVersionCreatedEvent {
	return WorkflowVersionCreatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workflow.WorkflowVersionCreated"),
		WorkflowID:      id,
		WorkflowCode:    code,
		Version:         version,
		UserID:          user,
	}
}

// WorkflowValidatedEvent is raised when a workflow validation checks successfully pass.
type WorkflowValidatedEvent struct {
	domain.BaseDomainEvent
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowCode string    `json:"workflow_code"`
	Version      int       `json:"version"`
	UserID       string    `json:"user_id"`
}

func NewWorkflowValidatedEvent(id uuid.UUID, code string, version int, user string) WorkflowValidatedEvent {
	return WorkflowValidatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workflow.WorkflowValidated"),
		WorkflowID:      id,
		WorkflowCode:    code,
		Version:         version,
		UserID:          user,
	}
}

// OperationAddedEvent is raised when an operation is appended.
type OperationAddedEvent struct {
	domain.BaseDomainEvent
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowCode string    `json:"workflow_code"`
	Version      int       `json:"version"`
	OperationID  uuid.UUID `json:"operation_id"`
	Sequence     int       `json:"sequence"`
	UserID       string    `json:"user_id"`
}

func NewOperationAddedEvent(id uuid.UUID, code string, version int, opID uuid.UUID, seq int, user string) OperationAddedEvent {
	return OperationAddedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workflow.OperationAdded"),
		WorkflowID:      id,
		WorkflowCode:    code,
		Version:         version,
		OperationID:     opID,
		Sequence:        seq,
		UserID:          user,
	}
}

// OperationRemovedEvent is raised when an operation is deleted.
type OperationRemovedEvent struct {
	domain.BaseDomainEvent
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowCode string    `json:"workflow_code"`
	Version      int       `json:"version"`
	OperationID  uuid.UUID `json:"operation_id"`
	Sequence     int       `json:"sequence"`
	UserID       string    `json:"user_id"`
}

func NewOperationRemovedEvent(id uuid.UUID, code string, version int, opID uuid.UUID, seq int, user string) OperationRemovedEvent {
	return OperationRemovedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workflow.OperationRemoved"),
		WorkflowID:      id,
		WorkflowCode:    code,
		Version:         version,
		OperationID:     opID,
		Sequence:        seq,
		UserID:          user,
	}
}

// OperationUpdatedEvent is raised when an operation's parameters change.
type OperationUpdatedEvent struct {
	domain.BaseDomainEvent
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowCode string    `json:"workflow_code"`
	Version      int       `json:"version"`
	OperationID  uuid.UUID `json:"operation_id"`
	Sequence     int       `json:"sequence"`
	UserID       string    `json:"user_id"`
}

func NewOperationUpdatedEvent(id uuid.UUID, code string, version int, opID uuid.UUID, seq int, user string) OperationUpdatedEvent {
	return OperationUpdatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workflow.OperationUpdated"),
		WorkflowID:      id,
		WorkflowCode:    code,
		Version:         version,
		OperationID:     opID,
		Sequence:        seq,
		UserID:          user,
	}
}

// OperationMovedEvent is raised when operations are reordered.
type OperationMovedEvent struct {
	domain.BaseDomainEvent
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowCode string    `json:"workflow_code"`
	Version      int       `json:"version"`
	OperationID  uuid.UUID `json:"operation_id"`
	Sequence     int       `json:"sequence"`
	UserID       string    `json:"user_id"`
}

func NewOperationMovedEvent(id uuid.UUID, code string, version int, opID uuid.UUID, seq int, user string) OperationMovedEvent {
	return OperationMovedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workflow.OperationMoved"),
		WorkflowID:      id,
		WorkflowCode:    code,
		Version:         version,
		OperationID:     opID,
		Sequence:        seq,
		UserID:          user,
	}
}
