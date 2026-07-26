package entity

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Assignment Status ────────────────────────────────────────────────────────

type AssignmentStatus string

const (
	AssignmentStatusProposed   AssignmentStatus = "proposed"
	AssignmentStatusApproved   AssignmentStatus = "approved"
	AssignmentStatusRejected   AssignmentStatus = "rejected"
	AssignmentStatusOverridden AssignmentStatus = "overridden"
)

// ─── AssignedWorker (Value Object) ───────────────────────────────────────────

// AssignedWorker represents one worker slot within an assignment.
// WorkerName is denormalized so assignment history remains immutable even if
// the worker record changes.
type AssignedWorker struct {
	ID           uuid.UUID
	AssignmentID uuid.UUID
	WorkerID     uuid.UUID
	WorkerName   string    // denormalized for history immutability
	SkillMatched []string  // which required skills this worker covers
	Score        float64   // individual worker score (0–100)
	CreatedAt    time.Time
}

func NewAssignedWorker(assignmentID, workerID uuid.UUID, workerName string, skillMatched []string, score float64) AssignedWorker {
	return AssignedWorker{
		ID:           uuid.New(),
		AssignmentID: assignmentID,
		WorkerID:     workerID,
		WorkerName:   workerName,
		SkillMatched: skillMatched,
		Score:        score,
		CreatedAt:    time.Now().UTC(),
	}
}

// ─── Assignment (Aggregate Root) ─────────────────────────────────────────────

// Assignment represents the mapping of workers to a specific operation within a
// work order. It is immutable once approved or rejected. Override creates a NEW
// Assignment record with revision+1 rather than mutating this one.
type Assignment struct {
	domain.AggregateRoot
	WorkOrderID  uuid.UUID
	OperationID  uuid.UUID
	Revision     int
	Status       AssignmentStatus
	ProposedBy   string // "system" or a user ID string
	ReviewedBy   *uuid.UUID
	Score        float64
	Notes        string
	Workers      []AssignedWorker
}

// NewProposedAssignment creates the first revision of an assignment proposed
// by the automatic engine.
func NewProposedAssignment(
	workOrderID, operationID uuid.UUID,
	proposedBy string,
	workers []AssignedWorker,
	score float64,
	notes string,
) (*Assignment, error) {
	if workOrderID == uuid.Nil {
		return nil, errors.New("work_order_id is required")
	}
	if operationID == uuid.Nil {
		return nil, errors.New("operation_id is required")
	}
	if len(workers) == 0 {
		return nil, errors.New("assignment must include at least one worker")
	}
	if proposedBy == "" {
		proposedBy = "system"
	}

	a := &Assignment{
		WorkOrderID: workOrderID,
		OperationID: operationID,
		Revision:    1,
		Status:      AssignmentStatusProposed,
		ProposedBy:  proposedBy,
		Score:       score,
		Notes:       notes,
		Workers:     workers,
	}
	a.BaseEntity = domain.NewBaseEntity()

	// Attach assignment ID to each worker
	for i := range a.Workers {
		a.Workers[i].AssignmentID = a.ID
	}

	a.RecordEvent(NewAssignmentProposedEvent(a.ID, a.WorkOrderID, a.OperationID, a.Revision, a.Score))
	return a, nil
}

// NewRevision creates a new assignment from an override, incrementing the revision.
// The previous assignment's status is set to Overridden before this is persisted.
func NewRevision(
	previous *Assignment,
	reviewerID uuid.UUID,
	workers []AssignedWorker,
	score float64,
	notes string,
) (*Assignment, error) {
	if len(workers) == 0 {
		return nil, errors.New("override must include at least one worker")
	}

	a := &Assignment{
		WorkOrderID: previous.WorkOrderID,
		OperationID: previous.OperationID,
		Revision:    previous.Revision + 1,
		Status:      AssignmentStatusProposed,
		ProposedBy:  reviewerID.String(),
		ReviewedBy:  &reviewerID,
		Score:       score,
		Notes:       notes,
		Workers:     workers,
	}
	a.BaseEntity = domain.NewBaseEntity()

	for i := range a.Workers {
		a.Workers[i].AssignmentID = a.ID
	}

	a.RecordEvent(NewAssignmentOverriddenEvent(a.ID, previous.ID, a.WorkOrderID, a.OperationID, a.Revision))
	return a, nil
}

// Approve marks the assignment as approved by a manager.
func (a *Assignment) Approve(reviewerID uuid.UUID) error {
	if a.Status != AssignmentStatusProposed {
		return fmt.Errorf("can only approve a proposed assignment, current status: %s", a.Status)
	}
	a.Status = AssignmentStatusApproved
	a.ReviewedBy = &reviewerID
	a.UpdatedAt = time.Now().UTC()
	a.RecordEvent(NewAssignmentApprovedEvent(a.ID, a.WorkOrderID, reviewerID))
	return nil
}

// Reject marks the assignment as rejected by a manager.
func (a *Assignment) Reject(reviewerID uuid.UUID, reason string) error {
	if a.Status != AssignmentStatusProposed {
		return fmt.Errorf("can only reject a proposed assignment, current status: %s", a.Status)
	}
	a.Status = AssignmentStatusRejected
	a.ReviewedBy = &reviewerID
	a.Notes = reason
	a.UpdatedAt = time.Now().UTC()
	a.RecordEvent(NewAssignmentRejectedEvent(a.ID, a.WorkOrderID, reviewerID, reason))
	return nil
}

// MarkOverridden transitions the current assignment's status to overridden.
// Called on the previous revision when a new override revision is created.
func (a *Assignment) MarkOverridden() error {
	if a.Status != AssignmentStatusProposed && a.Status != AssignmentStatusApproved {
		return fmt.Errorf("can only override a proposed or approved assignment, current status: %s", a.Status)
	}
	a.Status = AssignmentStatusOverridden
	a.UpdatedAt = time.Now().UTC()
	return nil
}
