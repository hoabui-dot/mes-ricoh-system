package service

import (
	"context"
	"fmt"
	"regexp"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/production/application/dto"
	"github.com/nd/mes-platform/modules/production/domain/entity"
	"github.com/nd/mes-platform/modules/production/domain/repository"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/domain"
	"github.com/nd/mes-platform/shared/outbox"
)

type WorkflowService struct {
	workflowRepo repository.WorkflowRepository
	outboxRepo   OutboxRepository
	log          *logger.Logger
}

func NewWorkflowService(
	workflowRepo repository.WorkflowRepository,
	outboxRepo OutboxRepository,
	log *logger.Logger,
) *WorkflowService {
	return &WorkflowService{
		workflowRepo: workflowRepo,
		outboxRepo:   outboxRepo,
		log:          log.With(logger.Module("production_workflow")),
	}
}

// CreateWorkflow creates a new workflow template.
func (s *WorkflowService) CreateWorkflow(ctx context.Context, req dto.CreateWorkflowRequest, user string) (*dto.WorkflowDTO, error) {
	// Validate Code regex: ^[A-Z0-9-_]+$
	codeRegex := regexp.MustCompile(`^[A-Z0-9-_]+$`)
	if !codeRegex.MatchString(req.WorkflowCode) {
		return nil, fmt.Errorf("%w: workflow code must only contain uppercase alphanumeric characters, hyphens and underscores", ErrValidation)
	}

	// Check unique code + version (version 1 is default)
	existing, _ := s.workflowRepo.FindByCodeAndVersion(ctx, req.WorkflowCode, 1)
	if existing != nil {
		return nil, fmt.Errorf("%w: workflow code %s with version 1 already exists", ErrConflict, req.WorkflowCode)
	}

	wf, err := entity.NewProductionWorkflow(req.WorkflowCode, req.WorkflowName, req.Description, req.ProductFamily, user)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.workflowRepo.Save(ctx, wf); err != nil {
		return nil, err
	}

	_ = s.publishEvents(ctx, wf.PullEvents())
	return mapWorkflowToDTO(wf), nil
}

// UpdateWorkflow updates a draft workflow's basic info.
func (s *WorkflowService) UpdateWorkflow(ctx context.Context, id uuid.UUID, req dto.UpdateWorkflowRequest, user string) (*dto.WorkflowDTO, error) {
	wf, err := s.workflowRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	if err := wf.UpdateBasicInfo(req.WorkflowName, req.Description, req.ProductFamily, user); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}

	if err := s.workflowRepo.Save(ctx, wf); err != nil {
		return nil, err
	}

	_ = s.publishEvents(ctx, wf.PullEvents())
	return mapWorkflowToDTO(wf), nil
}

// GetWorkflow gets workflow by ID.
func (s *WorkflowService) GetWorkflow(ctx context.Context, id uuid.UUID) (*dto.WorkflowDTO, error) {
	wf, err := s.workflowRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	return mapWorkflowToDTO(wf), nil
}

// SearchWorkflows searches workflows with filters and pagination.
func (s *WorkflowService) SearchWorkflows(ctx context.Context, filter repository.WorkflowFilter) ([]*dto.WorkflowDTO, int64, error) {
	workflows, total, err := s.workflowRepo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	dtos := make([]*dto.WorkflowDTO, len(workflows))
	for i, wf := range workflows {
		dtos[i] = mapWorkflowToDTO(wf)
	}
	return dtos, total, nil
}

// AddOperation adds an operation to a workflow.
func (s *WorkflowService) AddOperation(ctx context.Context, workflowID uuid.UUID, req dto.AddOperationRequest, user string) (*dto.WorkflowOperationDTO, error) {
	wf, err := s.workflowRepo.FindByID(ctx, workflowID)
	if err != nil {
		return nil, ErrNotFound
	}

	isRequired := true
	if req.IsRequired != nil {
		isRequired = *req.IsRequired
	}

	op, err := wf.AddOperation(req.OperationType, req.StationType, req.EstimatedDuration, req.RetryLimit, isRequired, req.Metadata, user)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.workflowRepo.Save(ctx, wf); err != nil {
		return nil, err
	}

	_ = s.publishEvents(ctx, wf.PullEvents())
	return mapOperationToDTO(op), nil
}

// UpdateOperation updates an operation's parameters.
func (s *WorkflowService) UpdateOperation(ctx context.Context, workflowID uuid.UUID, opID uuid.UUID, req dto.UpdateOperationRequest, user string) error {
	wf, err := s.workflowRepo.FindByID(ctx, workflowID)
	if err != nil {
		return ErrNotFound
	}

	isRequired := true
	if req.IsRequired != nil {
		isRequired = *req.IsRequired
	}

	if err := wf.UpdateOperation(opID, req.OperationType, req.StationType, req.EstimatedDuration, req.RetryLimit, isRequired, req.Metadata, user); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.workflowRepo.Save(ctx, wf); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, wf.PullEvents())
	return nil
}

// RemoveOperation deletes an operation.
func (s *WorkflowService) RemoveOperation(ctx context.Context, workflowID uuid.UUID, opID uuid.UUID, user string) error {
	wf, err := s.workflowRepo.FindByID(ctx, workflowID)
	if err != nil {
		return ErrNotFound
	}

	if err := wf.RemoveOperation(opID, user); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.workflowRepo.Save(ctx, wf); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, wf.PullEvents())
	return nil
}

// MoveOperation reorders sequences.
func (s *WorkflowService) MoveOperation(ctx context.Context, workflowID uuid.UUID, opID uuid.UUID, req dto.MoveOperationRequest, user string) error {
	wf, err := s.workflowRepo.FindByID(ctx, workflowID)
	if err != nil {
		return ErrNotFound
	}

	if err := wf.MoveOperation(opID, req.NewSequence, user); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.workflowRepo.Save(ctx, wf); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, wf.PullEvents())
	return nil
}

// ValidateWorkflow checks a workflow's validation errors and transitions status to Ready if zero errors found.
func (s *WorkflowService) ValidateWorkflow(ctx context.Context, id uuid.UUID) ([]string, error) {
	wf, err := s.workflowRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	errs := wf.Validate()
	if len(errs) == 0 {
		if err := s.workflowRepo.Save(ctx, wf); err != nil {
			return nil, err
		}
		_ = s.publishEvents(ctx, wf.PullEvents())
	}
	return errs, nil
}

// PublishWorkflow publishes a ready workflow.
func (s *WorkflowService) PublishWorkflow(ctx context.Context, id uuid.UUID, user string) error {
	wf, err := s.workflowRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}

	// Business rule check: passes validation checks
	if errs := wf.Validate(); len(errs) > 0 {
		return fmt.Errorf("%w: workflow has unresolved validation errors: %v", ErrValidation, errs)
	}

	// Business rule check: no existing Published version for this code
	existingPublished, _ := s.workflowRepo.FindPublishedByCode(ctx, wf.WorkflowCode)
	if existingPublished != nil {
		return fmt.Errorf("%w: there is already a published version (v%d) for workflow code %s. Archive it first", ErrConflict, existingPublished.Version, wf.WorkflowCode)
	}

	if err := wf.Publish(user); err != nil {
		return fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}

	if err := s.workflowRepo.Save(ctx, wf); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, wf.PullEvents())
	return nil
}

// ArchiveWorkflow archives a published workflow.
func (s *WorkflowService) ArchiveWorkflow(ctx context.Context, id uuid.UUID, user string) error {
	wf, err := s.workflowRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}

	if err := wf.Archive(user); err != nil {
		return fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}

	if err := s.workflowRepo.Save(ctx, wf); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, wf.PullEvents())
	return nil
}

// CloneWorkflow clones a published workflow to draft version max+1.
func (s *WorkflowService) CloneWorkflow(ctx context.Context, id uuid.UUID, user string) (*dto.WorkflowDTO, error) {
	wf, err := s.workflowRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	// We must find the max version currently registered for this workflow code to avoid collision.
	// We can list all versions by code by performing a List search.
	listFilter := repository.WorkflowFilter{
		Keyword:  wf.WorkflowCode,
		Page:     1,
		PageSize: 100,
	}
	allVersions, _, err := s.workflowRepo.List(ctx, listFilter)
	if err != nil {
		return nil, err
	}

	maxVer := wf.Version
	for _, v := range allVersions {
		if v.WorkflowCode == wf.WorkflowCode && v.Version > maxVer {
			maxVer = v.Version
		}
	}

	cloned, err := wf.Clone(maxVer+1, user)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}

	if err := s.workflowRepo.Save(ctx, cloned); err != nil {
		return nil, err
	}

	_ = s.publishEvents(ctx, cloned.PullEvents())
	return mapWorkflowToDTO(cloned), nil
}

// Private helpers

func (s *WorkflowService) publishEvents(ctx context.Context, events []domain.DomainEvent) error {
	for _, ev := range events {
		payload, err := outbox.MarshalEvent(ev)
		if err != nil {
			s.log.Error("failed to marshal event for outbox", logger.Err(err))
			continue
		}

		// Map to routing key format (e.g. "workflow.created")
		var rk string
		switch ev.EventName() {
		case "mes.workflow.WorkflowCreated":
			rk = "workflow.created"
		case "mes.workflow.WorkflowUpdated":
			rk = "workflow.updated"
		case "mes.workflow.WorkflowPublished":
			rk = "workflow.published"
		case "mes.workflow.WorkflowArchived":
			rk = "workflow.archived"
		case "mes.workflow.WorkflowVersionCreated":
			rk = "workflow.version-created"
		case "mes.workflow.OperationAdded":
			rk = "workflow.operation-added"
		case "mes.workflow.OperationUpdated":
			rk = "workflow.operation-updated"
		case "mes.workflow.OperationRemoved":
			rk = "workflow.operation-removed"
		default:
			rk = ev.EventName()
		}

		outboxEvent := outbox.NewEvent(ev.EventName(), rk, payload)
		if err := s.outboxRepo.Save(ctx, outboxEvent); err != nil {
			s.log.Error("failed to save outbox event", logger.Err(err))
			return err
		}
	}
	return nil
}

func mapWorkflowToDTO(wf *entity.ProductionWorkflow) *dto.WorkflowDTO {
	ops := make([]dto.WorkflowOperationDTO, len(wf.Operations))
	for i, op := range wf.Operations {
		ops[i] = *mapOperationToDTO(&op)
	}

	return &dto.WorkflowDTO{
		ID:            wf.ID,
		WorkflowCode:  wf.WorkflowCode,
		WorkflowName:  wf.WorkflowName,
		Description:   wf.Description,
		ProductFamily: wf.ProductFamily,
		Version:       wf.Version,
		Status:        string(wf.Status),
		PublishedAt:   wf.PublishedAt,
		ArchivedAt:    wf.ArchivedAt,
		Revision:      wf.Revision,
		CreatedBy:     wf.CreatedBy,
		UpdatedBy:     wf.UpdatedBy,
		CreatedAt:     wf.CreatedAt,
		UpdatedAt:     wf.UpdatedAt,
		Operations:    ops,
	}
}

func mapOperationToDTO(op *entity.WorkflowOperation) *dto.WorkflowOperationDTO {
	return &dto.WorkflowOperationDTO{
		ID:                   op.ID,
		WorkflowID:           op.WorkflowID,
		Sequence:             op.Sequence,
		OperationType:        op.OperationType,
		StationType:          op.StationType,
		EstimatedDuration:    op.EstimatedDuration,
		RetryLimit:           op.RetryLimit,
		IsRequired:           op.IsRequired,
		Metadata:             op.Metadata,
		OperationName:        op.OperationName,
		RequiresStation:      op.RequiresStation,
		DefaultStationType:   op.DefaultStationType,
		QualityCheckRequired: op.QualityCheckRequired,
		IsFinalOperation:     op.IsFinalOperation,
		RequiredSkills:       op.RequiredSkills,
		CreatedAt:            op.CreatedAt,
		UpdatedAt:            op.UpdatedAt,
	}
}
