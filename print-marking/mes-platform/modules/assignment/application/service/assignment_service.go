package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/assignment/application/dto"
	"github.com/nd/mes-platform/modules/assignment/application/service/scoring"
	"github.com/nd/mes-platform/modules/assignment/domain/entity"
	"github.com/nd/mes-platform/modules/assignment/domain/repository"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/domain"
	"github.com/nd/mes-platform/shared/outbox"
)

var (
	ErrNotFound   = errors.New("not found")
	ErrConflict   = errors.New("conflict")
	ErrValidation = errors.New("validation error")
	ErrTransition = errors.New("invalid status transition")
	ErrNoWorkers  = errors.New("no qualified workers found")
)

// ─── Dependency Ports (cross-module without import coupling) ──────────────────

// OutboxRepository writes outbox events.
type OutboxRepository interface {
	Save(ctx context.Context, event *outbox.Event) error
}

// WorkerQuery provides read-only cross-module access to worker data.
// This keeps the assignment module decoupled from the workforce module.
type WorkerQuery interface {
	// FindCandidates returns all active workers with their skill profiles.
	FindCandidates(ctx context.Context) ([]scoring.WorkerCandidate, error)
	// FindWorkersByIDs returns workers (for manual selection in override).
	FindWorkersByIDs(ctx context.Context, ids []uuid.UUID) ([]scoring.WorkerCandidate, error)
}

// OperationQuery provides read-only cross-module access to operation data.
type OperationQuery interface {
	// FindOperation retrieves operation required skills, operators, etc.
	FindOperation(ctx context.Context, operationID uuid.UUID) (*scoring.RequiredOperation, error)
}

// ─── Service ─────────────────────────────────────────────────────────────────

type AssignmentService struct {
	assignmentRepo repository.AssignmentRepository
	outboxRepo     OutboxRepository
	workerQuery    WorkerQuery
	operationQuery OperationQuery
	log            *logger.Logger
}

func NewAssignmentService(
	assignmentRepo repository.AssignmentRepository,
	outboxRepo OutboxRepository,
	workerQuery WorkerQuery,
	operationQuery OperationQuery,
	log *logger.Logger,
) *AssignmentService {
	return &AssignmentService{
		assignmentRepo: assignmentRepo,
		outboxRepo:     outboxRepo,
		workerQuery:    workerQuery,
		operationQuery: operationQuery,
		log:            log.With(logger.Module("assignment")),
	}
}

// ─── Propose ─────────────────────────────────────────────────────────────────

// ProposeAssignment runs the automatic scoring engine and creates a new
// proposed assignment. If worker_ids are provided in the request, the engine
// treats it as a manual selection instead of auto-scoring.
func (s *AssignmentService) ProposeAssignment(ctx context.Context, req dto.ProposeAssignmentRequest) (*dto.AssignmentDTO, error) {
	workOrderID, err := uuid.Parse(req.WorkOrderID)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid work_order_id", ErrValidation)
	}
	operationID, err := uuid.Parse(req.OperationID)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid operation_id", ErrValidation)
	}

	// Get operation requirements
	op, err := s.operationQuery.FindOperation(ctx, operationID)
	if err != nil {
		return nil, fmt.Errorf("%w: operation", ErrNotFound)
	}

	var selectedCandidates []scoring.ScoredCandidate
	var totalScore float64

	if len(req.WorkerIDs) > 0 {
		// Manual selection — bypass scoring, use provided workers directly
		ids := make([]uuid.UUID, 0, len(req.WorkerIDs))
		for _, idStr := range req.WorkerIDs {
			id, parseErr := uuid.Parse(idStr)
			if parseErr != nil {
				return nil, fmt.Errorf("%w: invalid worker_id %s", ErrValidation, idStr)
			}
			ids = append(ids, id)
		}
		candidates, findErr := s.workerQuery.FindWorkersByIDs(ctx, ids)
		if findErr != nil || len(candidates) == 0 {
			return nil, fmt.Errorf("%w: one or more workers not found", ErrNotFound)
		}
		scored := scoring.Score(candidates, *op)
		selectedCandidates = scored
		totalScore = scoring.AverageScore(selectedCandidates)
	} else {
		// Automatic scoring
		candidates, findErr := s.workerQuery.FindCandidates(ctx)
		if findErr != nil {
			return nil, findErr
		}
		scored := scoring.Score(candidates, *op)
		selectedCandidates = scoring.SelectTop(scored, *op)
		if len(selectedCandidates) == 0 {
			return nil, ErrNoWorkers
		}
		totalScore = scoring.AverageScore(selectedCandidates)
	}

	// Build AssignedWorker value objects
	workers := make([]entity.AssignedWorker, len(selectedCandidates))
	for i, sc := range selectedCandidates {
		workerID, _ := uuid.Parse(sc.WorkerID)
		workers[i] = entity.NewAssignedWorker(uuid.Nil, workerID, sc.WorkerName, sc.SkillMatched, sc.TotalScore)
	}

	assignment, err := entity.NewProposedAssignment(workOrderID, operationID, "system", workers, totalScore, req.Notes)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.assignmentRepo.Save(ctx, assignment); err != nil {
		return nil, err
	}
	_ = s.publishEvents(ctx, assignment.PullEvents())

	return mapAssignmentToDTO(assignment), nil
}

// ─── Approve ─────────────────────────────────────────────────────────────────

func (s *AssignmentService) ApproveAssignment(ctx context.Context, id uuid.UUID, req dto.ApproveAssignmentRequest) error {
	reviewerID, err := uuid.Parse(req.ReviewerID)
	if err != nil {
		return fmt.Errorf("%w: invalid reviewer_id", ErrValidation)
	}
	a, err := s.assignmentRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if err := a.Approve(reviewerID); err != nil {
		return fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}
	if err := s.assignmentRepo.Save(ctx, a); err != nil {
		return err
	}
	_ = s.publishEvents(ctx, a.PullEvents())
	return nil
}

// ─── Reject ──────────────────────────────────────────────────────────────────

func (s *AssignmentService) RejectAssignment(ctx context.Context, id uuid.UUID, req dto.RejectAssignmentRequest) error {
	reviewerID, err := uuid.Parse(req.ReviewerID)
	if err != nil {
		return fmt.Errorf("%w: invalid reviewer_id", ErrValidation)
	}
	a, err := s.assignmentRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if err := a.Reject(reviewerID, req.Reason); err != nil {
		return fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}
	if err := s.assignmentRepo.Save(ctx, a); err != nil {
		return err
	}
	_ = s.publishEvents(ctx, a.PullEvents())
	return nil
}

// ─── Override ─────────────────────────────────────────────────────────────────

// OverrideAssignment creates a new revision of the assignment with manually
// selected workers. The previous revision is marked as overridden.
// The history of previous revisions is preserved immutably.
func (s *AssignmentService) OverrideAssignment(ctx context.Context, id uuid.UUID, req dto.OverrideAssignmentRequest) (*dto.AssignmentDTO, error) {
	reviewerID, err := uuid.Parse(req.ReviewerID)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid reviewer_id", ErrValidation)
	}

	// Find the existing assignment
	prev, err := s.assignmentRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	// Get operation info for scoring context
	op, _ := s.operationQuery.FindOperation(ctx, prev.OperationID)
	if op == nil {
		op = &scoring.RequiredOperation{MinOperators: 1, MaxOperators: 10, Priority: 50}
	}

	// Load selected workers
	workerIDs := make([]uuid.UUID, 0, len(req.WorkerIDs))
	for _, idStr := range req.WorkerIDs {
		wid, parseErr := uuid.Parse(idStr)
		if parseErr != nil {
			return nil, fmt.Errorf("%w: invalid worker_id %s", ErrValidation, idStr)
		}
		workerIDs = append(workerIDs, wid)
	}

	candidates, findErr := s.workerQuery.FindWorkersByIDs(ctx, workerIDs)
	if findErr != nil || len(candidates) == 0 {
		return nil, fmt.Errorf("%w: one or more workers not found", ErrNotFound)
	}

	scored := scoring.Score(candidates, *op)
	avgScore := scoring.AverageScore(scored)

	workers := make([]entity.AssignedWorker, len(scored))
	for i, sc := range scored {
		wid, _ := uuid.Parse(sc.WorkerID)
		workers[i] = entity.NewAssignedWorker(uuid.Nil, wid, sc.WorkerName, sc.SkillMatched, sc.TotalScore)
	}

	// Create the new revision
	newAssignment, err := entity.NewRevision(prev, reviewerID, workers, avgScore, req.Notes)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	// Mark previous revision as overridden (immutable update)
	if err := prev.MarkOverridden(); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}

	// Persist both in order: update previous first, then create new
	if err := s.assignmentRepo.Save(ctx, prev); err != nil {
		return nil, err
	}
	if err := s.assignmentRepo.Save(ctx, newAssignment); err != nil {
		return nil, err
	}

	_ = s.publishEvents(ctx, newAssignment.PullEvents())
	return mapAssignmentToDTO(newAssignment), nil
}

// ─── Queries ─────────────────────────────────────────────────────────────────

func (s *AssignmentService) GetAssignment(ctx context.Context, id uuid.UUID) (*dto.AssignmentDTO, error) {
	a, err := s.assignmentRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	return mapAssignmentToDTO(a), nil
}

func (s *AssignmentService) ListAssignments(ctx context.Context, filter repository.AssignmentFilter) ([]*dto.AssignmentDTO, int64, error) {
	assignments, total, err := s.assignmentRepo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	dtos := make([]*dto.AssignmentDTO, len(assignments))
	for i, a := range assignments {
		dtos[i] = mapAssignmentToDTO(a)
	}
	return dtos, total, nil
}

func (s *AssignmentService) GetAssignmentHistory(ctx context.Context, workOrderID, operationID uuid.UUID) (*dto.AssignmentHistoryDTO, error) {
	revisions, err := s.assignmentRepo.ListHistory(ctx, workOrderID, operationID)
	if err != nil {
		return nil, err
	}
	revDTOs := make([]dto.AssignmentDTO, len(revisions))
	for i, r := range revisions {
		revDTOs[i] = *mapAssignmentToDTO(r)
	}
	return &dto.AssignmentHistoryDTO{
		WorkOrderID: workOrderID,
		OperationID: operationID,
		Revisions:   revDTOs,
	}, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (s *AssignmentService) publishEvents(ctx context.Context, events []domain.DomainEvent) error {
	for _, ev := range events {
		payload, err := outbox.MarshalEvent(ev)
		if err != nil {
			return err
		}
		outboxEvent := outbox.NewEvent(ev.EventName(), ev.EventName(), payload)
		if err := s.outboxRepo.Save(ctx, outboxEvent); err != nil {
			return err
		}
	}
	return nil
}

func mapAssignmentToDTO(a *entity.Assignment) *dto.AssignmentDTO {
	workers := make([]dto.AssignedWorkerDTO, len(a.Workers))
	for i, w := range a.Workers {
		workers[i] = dto.AssignedWorkerDTO{
			ID:           w.ID,
			WorkerID:     w.WorkerID,
			WorkerName:   w.WorkerName,
			SkillMatched: w.SkillMatched,
			Score:        w.Score,
		}
	}
	return &dto.AssignmentDTO{
		ID:          a.ID,
		WorkOrderID: a.WorkOrderID,
		OperationID: a.OperationID,
		Revision:    a.Revision,
		Status:      string(a.Status),
		ProposedBy:  a.ProposedBy,
		ReviewedBy:  a.ReviewedBy,
		Score:       a.Score,
		Notes:       a.Notes,
		Workers:     workers,
		CreatedAt:   a.CreatedAt,
		UpdatedAt:   a.UpdatedAt,
	}
}
