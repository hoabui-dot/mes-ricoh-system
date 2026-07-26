package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/assignment/domain/entity"
)

var (
	ErrAssignmentNotFound = errors.New("assignment not found")
)

type AssignmentFilter struct {
	WorkOrderID *uuid.UUID
	OperationID *uuid.UUID
	Status      string
	Page        int
	PageSize    int
}

// AssignmentRepository manages persistence of assignments.
type AssignmentRepository interface {
	// Save creates or updates a single assignment (upsert).
	Save(ctx context.Context, a *entity.Assignment) error

	// FindByID retrieves an assignment with its assigned workers.
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Assignment, error)

	// FindLatestRevision retrieves the highest revision assignment for a
	// specific work order + operation combination.
	FindLatestRevision(ctx context.Context, workOrderID, operationID uuid.UUID) (*entity.Assignment, error)

	// ListHistory retrieves all revisions for a work order + operation, ordered
	// by revision descending (newest first).
	ListHistory(ctx context.Context, workOrderID, operationID uuid.UUID) ([]*entity.Assignment, error)

	// List retrieves assignments with optional filters and pagination.
	List(ctx context.Context, filter AssignmentFilter) ([]*entity.Assignment, int64, error)
}
