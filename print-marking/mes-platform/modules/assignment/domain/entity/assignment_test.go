package entity_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/assignment/domain/entity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func buildWorkers(assignmentID uuid.UUID, n int) []entity.AssignedWorker {
	workers := make([]entity.AssignedWorker, n)
	for i := 0; i < n; i++ {
		workers[i] = entity.NewAssignedWorker(assignmentID, uuid.New(), "Worker Name", []string{"LO1"}, 75.0)
	}
	return workers
}

// ─── NewProposedAssignment Tests ──────────────────────────────────────────────

func TestUnit_NewProposedAssignment_Success(t *testing.T) {
	woID := uuid.New()
	opID := uuid.New()
	workers := buildWorkers(uuid.Nil, 2)

	a, err := entity.NewProposedAssignment(woID, opID, "system", workers, 78.5, "auto-proposed")
	require.NoError(t, err)
	assert.Equal(t, entity.AssignmentStatusProposed, a.Status)
	assert.Equal(t, 1, a.Revision)
	assert.Equal(t, "system", a.ProposedBy)
	assert.Equal(t, 78.5, a.Score)
	assert.Len(t, a.Workers, 2)
	// Workers get the assignment ID
	for _, w := range a.Workers {
		assert.Equal(t, a.ID, w.AssignmentID)
	}

	events := a.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.assignment.AssignmentProposed", events[0].EventName())
}

func TestUnit_NewProposedAssignment_Validation(t *testing.T) {
	_, err := entity.NewProposedAssignment(uuid.Nil, uuid.New(), "system", buildWorkers(uuid.Nil, 1), 70, "")
	assert.ErrorContains(t, err, "work_order_id is required")

	_, err = entity.NewProposedAssignment(uuid.New(), uuid.Nil, "system", buildWorkers(uuid.Nil, 1), 70, "")
	assert.ErrorContains(t, err, "operation_id is required")

	_, err = entity.NewProposedAssignment(uuid.New(), uuid.New(), "system", []entity.AssignedWorker{}, 70, "")
	assert.ErrorContains(t, err, "at least one worker")
}

// ─── Approve Tests ────────────────────────────────────────────────────────────

func TestUnit_Assignment_Approve(t *testing.T) {
	a, _ := entity.NewProposedAssignment(uuid.New(), uuid.New(), "system", buildWorkers(uuid.Nil, 1), 80.0, "")
	a.PullEvents()

	reviewerID := uuid.New()
	err := a.Approve(reviewerID)
	require.NoError(t, err)
	assert.Equal(t, entity.AssignmentStatusApproved, a.Status)
	assert.Equal(t, &reviewerID, a.ReviewedBy)

	events := a.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.assignment.AssignmentApproved", events[0].EventName())
}

func TestUnit_Assignment_ApproveNonProposed(t *testing.T) {
	a, _ := entity.NewProposedAssignment(uuid.New(), uuid.New(), "system", buildWorkers(uuid.Nil, 1), 80.0, "")
	a.Approve(uuid.New())
	a.PullEvents()

	err := a.Approve(uuid.New())
	assert.ErrorContains(t, err, "proposed assignment")
}

// ─── Reject Tests ─────────────────────────────────────────────────────────────

func TestUnit_Assignment_Reject(t *testing.T) {
	a, _ := entity.NewProposedAssignment(uuid.New(), uuid.New(), "system", buildWorkers(uuid.Nil, 1), 60.0, "")
	a.PullEvents()

	reviewerID := uuid.New()
	err := a.Reject(reviewerID, "Skill level too low for this job")
	require.NoError(t, err)
	assert.Equal(t, entity.AssignmentStatusRejected, a.Status)
	assert.Equal(t, "Skill level too low for this job", a.Notes)

	events := a.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.assignment.AssignmentRejected", events[0].EventName())
}

func TestUnit_Assignment_RejectApproved(t *testing.T) {
	a, _ := entity.NewProposedAssignment(uuid.New(), uuid.New(), "system", buildWorkers(uuid.Nil, 1), 60.0, "")
	a.Approve(uuid.New())

	err := a.Reject(uuid.New(), "reason")
	assert.ErrorContains(t, err, "proposed assignment")
}

// ─── Override / NewRevision Tests ─────────────────────────────────────────────

func TestUnit_Assignment_MarkOverridden(t *testing.T) {
	a, _ := entity.NewProposedAssignment(uuid.New(), uuid.New(), "system", buildWorkers(uuid.Nil, 1), 60.0, "")

	err := a.MarkOverridden()
	require.NoError(t, err)
	assert.Equal(t, entity.AssignmentStatusOverridden, a.Status)
}

func TestUnit_Assignment_MarkOverridden_AlreadyRejected(t *testing.T) {
	a, _ := entity.NewProposedAssignment(uuid.New(), uuid.New(), "system", buildWorkers(uuid.Nil, 1), 60.0, "")
	a.Reject(uuid.New(), "reason")

	err := a.MarkOverridden()
	assert.Error(t, err)
}

func TestUnit_NewRevision_IncreasesRevision(t *testing.T) {
	prev, _ := entity.NewProposedAssignment(uuid.New(), uuid.New(), "system", buildWorkers(uuid.Nil, 1), 60.0, "")
	prev.PullEvents()

	reviewerID := uuid.New()
	newWorkers := buildWorkers(uuid.Nil, 2)
	newAssignment, err := entity.NewRevision(prev, reviewerID, newWorkers, 85.0, "manager override")
	require.NoError(t, err)

	assert.Equal(t, prev.Revision+1, newAssignment.Revision)
	assert.Equal(t, entity.AssignmentStatusProposed, newAssignment.Status)
	assert.Equal(t, prev.WorkOrderID, newAssignment.WorkOrderID)
	assert.Equal(t, prev.OperationID, newAssignment.OperationID)
	assert.Len(t, newAssignment.Workers, 2)
	assert.Equal(t, &reviewerID, newAssignment.ReviewedBy)

	events := newAssignment.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.assignment.AssignmentOverridden", events[0].EventName())
}

func TestUnit_NewRevision_RequiresWorkers(t *testing.T) {
	prev, _ := entity.NewProposedAssignment(uuid.New(), uuid.New(), "system", buildWorkers(uuid.Nil, 1), 60.0, "")
	_, err := entity.NewRevision(prev, uuid.New(), []entity.AssignedWorker{}, 0, "")
	assert.ErrorContains(t, err, "at least one worker")
}
