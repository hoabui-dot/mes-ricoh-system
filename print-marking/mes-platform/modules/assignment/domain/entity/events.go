package entity

import (
	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Assignment Events ────────────────────────────────────────────────────────

type AssignmentProposedEvent struct {
	domain.BaseDomainEvent
	AssignmentID uuid.UUID `json:"assignment_id"`
	WorkOrderID  uuid.UUID `json:"work_order_id"`
	OperationID  uuid.UUID `json:"operation_id"`
	Revision     int       `json:"revision"`
	Score        float64   `json:"score"`
}

func NewAssignmentProposedEvent(id, workOrderID, operationID uuid.UUID, revision int, score float64) AssignmentProposedEvent {
	return AssignmentProposedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.assignment.AssignmentProposed"),
		AssignmentID:    id,
		WorkOrderID:     workOrderID,
		OperationID:     operationID,
		Revision:        revision,
		Score:           score,
	}
}

type AssignmentApprovedEvent struct {
	domain.BaseDomainEvent
	AssignmentID uuid.UUID `json:"assignment_id"`
	WorkOrderID  uuid.UUID `json:"work_order_id"`
	ReviewedBy   uuid.UUID `json:"reviewed_by"`
}

func NewAssignmentApprovedEvent(id, workOrderID, reviewerID uuid.UUID) AssignmentApprovedEvent {
	return AssignmentApprovedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.assignment.AssignmentApproved"),
		AssignmentID:    id,
		WorkOrderID:     workOrderID,
		ReviewedBy:      reviewerID,
	}
}

type AssignmentRejectedEvent struct {
	domain.BaseDomainEvent
	AssignmentID uuid.UUID `json:"assignment_id"`
	WorkOrderID  uuid.UUID `json:"work_order_id"`
	ReviewedBy   uuid.UUID `json:"reviewed_by"`
	Reason       string    `json:"reason"`
}

func NewAssignmentRejectedEvent(id, workOrderID, reviewerID uuid.UUID, reason string) AssignmentRejectedEvent {
	return AssignmentRejectedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.assignment.AssignmentRejected"),
		AssignmentID:    id,
		WorkOrderID:     workOrderID,
		ReviewedBy:      reviewerID,
		Reason:          reason,
	}
}

type AssignmentOverriddenEvent struct {
	domain.BaseDomainEvent
	NewAssignmentID  uuid.UUID `json:"new_assignment_id"`
	PrevAssignmentID uuid.UUID `json:"prev_assignment_id"`
	WorkOrderID      uuid.UUID `json:"work_order_id"`
	OperationID      uuid.UUID `json:"operation_id"`
	Revision         int       `json:"revision"`
}

func NewAssignmentOverriddenEvent(newID, prevID, workOrderID, operationID uuid.UUID, revision int) AssignmentOverriddenEvent {
	return AssignmentOverriddenEvent{
		BaseDomainEvent:  domain.NewBaseDomainEvent("mes.assignment.AssignmentOverridden"),
		NewAssignmentID:  newID,
		PrevAssignmentID: prevID,
		WorkOrderID:      workOrderID,
		OperationID:      operationID,
		Revision:         revision,
	}
}
