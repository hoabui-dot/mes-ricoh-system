package entity

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// WorkflowStatus represents the workflow lifecycle status.
type WorkflowStatus string

const (
	WorkflowStatusDraft     WorkflowStatus = "draft"
	WorkflowStatusReady     WorkflowStatus = "ready"
	WorkflowStatusPublished WorkflowStatus = "published"
	WorkflowStatusArchived  WorkflowStatus = "archived"
)

// WorkflowOperation represents an ordered manufacturing operation within a workflow.
type WorkflowOperation struct {
	ID                   uuid.UUID              `json:"id"`
	WorkflowID           uuid.UUID              `json:"workflow_id"`
	Sequence             int                    `json:"sequence"`
	OperationType        string                 `json:"operation_type"`
	StationType          string                 `json:"station_type"`
	EstimatedDuration    int                    `json:"estimated_duration"` // in seconds
	RetryLimit           int                    `json:"retry_limit"`
	IsRequired           bool                   `json:"is_required"`
	Metadata             map[string]interface{} `json:"metadata"`
	OperationName        string                 `json:"operation_name"`
	RequiresStation      bool                   `json:"requires_station"`
	DefaultStationType   string                 `json:"default_station_type"`
	QualityCheckRequired bool                   `json:"quality_check_required"`
	IsFinalOperation     bool                   `json:"is_final_operation"`
	RequiredSkills       []string               `json:"required_skills"`
	CreatedAt            time.Time              `json:"created_at"`
	UpdatedAt            time.Time              `json:"updated_at"`
}

// ProductionWorkflow is the Aggregate Root representing a manufacturing process template.
type ProductionWorkflow struct {
	domain.AggregateRoot
	WorkflowCode  string              `json:"workflow_code"`
	WorkflowName  string              `json:"workflow_name"`
	Description   string              `json:"description"`
	ProductFamily string              `json:"product_family"`
	Version       int                 `json:"version"`
	Status        WorkflowStatus      `json:"status"`
	PublishedAt   *time.Time          `json:"published_at"`
	ArchivedAt    *time.Time          `json:"archived_at"`
	Revision      int                 `json:"revision"`
	CreatedBy     string              `json:"created_by"`
	UpdatedBy     string              `json:"updated_by"`
	Operations    []WorkflowOperation `json:"operations"`
}

// NewProductionWorkflow creates a new workflow template in Draft status.
func NewProductionWorkflow(code, name, desc, family, user string) (*ProductionWorkflow, error) {
	cleanCode := strings.ToUpper(strings.TrimSpace(code))
	if cleanCode == "" {
		return nil, errors.New("workflow code is required")
	}
	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		return nil, errors.New("workflow name is required")
	}
	cleanFamily := strings.TrimSpace(family)
	if cleanFamily == "" {
		return nil, errors.New("product family is required")
	}

	wf := &ProductionWorkflow{
		WorkflowCode:  cleanCode,
		WorkflowName:  cleanName,
		Description:   strings.TrimSpace(desc),
		ProductFamily: cleanFamily,
		Version:       1,
		Status:        WorkflowStatusDraft,
		Revision:      1,
		CreatedBy:     user,
		UpdatedBy:     user,
		Operations:    make([]WorkflowOperation, 0),
	}
	wf.BaseEntity = domain.NewBaseEntity()

	wf.RecordEvent(NewWorkflowCreatedEvent(wf.ID, wf.WorkflowCode, wf.Version, user))
	return wf, nil
}

// Rename updates the workflow name and description (only if Draft/Ready).
func (wf *ProductionWorkflow) UpdateBasicInfo(name, desc, family, user string) error {
	if wf.Status == WorkflowStatusPublished || wf.Status == WorkflowStatusArchived {
		return fmt.Errorf("cannot modify workflow in %s status", wf.Status)
	}
	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		return errors.New("workflow name is required")
	}
	cleanFamily := strings.TrimSpace(family)
	if cleanFamily == "" {
		return errors.New("product family is required")
	}

	wf.WorkflowName = cleanName
	wf.Description = strings.TrimSpace(desc)
	wf.ProductFamily = cleanFamily
	wf.UpdatedBy = user
	wf.UpdatedAt = time.Now().UTC()
	wf.Revision++
	if wf.Status == WorkflowStatusReady {
		wf.Status = WorkflowStatusDraft
	}

	wf.RecordEvent(NewWorkflowUpdatedEvent(wf.ID, wf.WorkflowCode, wf.Version, user))
	return nil
}

// AddOperation appends or inserts an operation.
func (wf *ProductionWorkflow) AddOperation(opType, stationType string, duration, retry int, isRequired bool, metadata map[string]interface{}, user string) (*WorkflowOperation, error) {
	if wf.Status == WorkflowStatusPublished || wf.Status == WorkflowStatusArchived {
		return nil, fmt.Errorf("cannot modify workflow operations in %s status", wf.Status)
	}

	// Calculate sequence: start at 10, increment by 10
	seq := 10
	if len(wf.Operations) > 0 {
		seq = wf.Operations[len(wf.Operations)-1].Sequence + 10
	}

	if duration <= 0 {
		return nil, errors.New("estimated duration must be greater than 0 seconds")
	}
	if retry < 0 || retry > 10 {
		return nil, errors.New("retry limit must be between 0 and 10")
	}

	now := time.Now().UTC()
	op := WorkflowOperation{
		ID:                   uuid.New(),
		WorkflowID:           wf.ID,
		Sequence:             seq,
		OperationType:        opType,
		StationType:          stationType,
		EstimatedDuration:    duration,
		RetryLimit:           retry,
		IsRequired:           isRequired,
		Metadata:             metadata,
		OperationName:        opType,
		RequiresStation:      true,
		DefaultStationType:   stationType,
		QualityCheckRequired: false,
		IsFinalOperation:     false,
		RequiredSkills:       []string{},
		CreatedAt:            now,
		UpdatedAt:            now,
	}

	wf.Operations = append(wf.Operations, op)
	wf.UpdatedBy = user
	wf.UpdatedAt = now
	wf.Revision++
	wf.Status = WorkflowStatusDraft

	wf.RecordEvent(NewOperationAddedEvent(wf.ID, wf.WorkflowCode, wf.Version, op.ID, op.Sequence, user))
	return &op, nil
}

// RemoveOperation deletes an operation.
func (wf *ProductionWorkflow) RemoveOperation(opID uuid.UUID, user string) error {
	if wf.Status == WorkflowStatusPublished || wf.Status == WorkflowStatusArchived {
		return fmt.Errorf("cannot modify workflow operations in %s status", wf.Status)
	}

	foundIdx := -1
	for i, op := range wf.Operations {
		if op.ID == opID {
			foundIdx = i
			break
		}
	}
	if foundIdx == -1 {
		return errors.New("operation not found")
	}

	removedOp := wf.Operations[foundIdx]
	wf.Operations = append(wf.Operations[:foundIdx], wf.Operations[foundIdx+1:]...)
	
	// Reorder sequence numbers sequentially to maintain clean increment increments
	for i := range wf.Operations {
		wf.Operations[i].Sequence = (i + 1) * 10
		wf.Operations[i].UpdatedAt = time.Now().UTC()
	}

	wf.UpdatedBy = user
	wf.UpdatedAt = time.Now().UTC()
	wf.Revision++
	wf.Status = WorkflowStatusDraft

	wf.RecordEvent(NewOperationRemovedEvent(wf.ID, wf.WorkflowCode, wf.Version, removedOp.ID, removedOp.Sequence, user))
	return nil
}

// UpdateOperation modifies properties of an operation.
func (wf *ProductionWorkflow) UpdateOperation(opID uuid.UUID, opType, stationType string, duration, retry int, isRequired bool, metadata map[string]interface{}, user string) error {
	if wf.Status == WorkflowStatusPublished || wf.Status == WorkflowStatusArchived {
		return fmt.Errorf("cannot modify workflow operations in %s status", wf.Status)
	}

	foundIdx := -1
	for i, op := range wf.Operations {
		if op.ID == opID {
			foundIdx = i
			break
		}
	}
	if foundIdx == -1 {
		return errors.New("operation not found")
	}

	if duration <= 0 {
		return errors.New("estimated duration must be greater than 0 seconds")
	}
	if retry < 0 || retry > 10 {
		return errors.New("retry limit must be between 0 and 10")
	}

	wf.Operations[foundIdx].OperationType = opType
	wf.Operations[foundIdx].StationType = stationType
	wf.Operations[foundIdx].EstimatedDuration = duration
	wf.Operations[foundIdx].RetryLimit = retry
	wf.Operations[foundIdx].IsRequired = isRequired
	wf.Operations[foundIdx].Metadata = metadata
	wf.Operations[foundIdx].UpdatedAt = time.Now().UTC()

	wf.UpdatedBy = user
	wf.UpdatedAt = time.Now().UTC()
	wf.Revision++
	wf.Status = WorkflowStatusDraft

	op := wf.Operations[foundIdx]
	wf.RecordEvent(NewOperationUpdatedEvent(wf.ID, wf.WorkflowCode, wf.Version, op.ID, op.Sequence, user))
	return nil
}

// MoveOperation reorders sequences by shifting sequence numbers.
func (wf *ProductionWorkflow) MoveOperation(opID uuid.UUID, newSeq int, user string) error {
	if wf.Status == WorkflowStatusPublished || wf.Status == WorkflowStatusArchived {
		return fmt.Errorf("cannot modify workflow operations in %s status", wf.Status)
	}

	if newSeq <= 0 || newSeq%10 != 0 {
		return errors.New("sequence must be positive and multiple of 10")
	}

	foundIdx := -1
	for i, op := range wf.Operations {
		if op.ID == opID {
			foundIdx = i
			break
		}
	}
	if foundIdx == -1 {
		return errors.New("operation not found")
	}

	targetOp := wf.Operations[foundIdx]
	
	// Create temporary list excluding the moved operation
	tempOps := append([]WorkflowOperation{}, wf.Operations[:foundIdx]...)
	tempOps = append(tempOps, wf.Operations[foundIdx+1:]...)

	// Insert moved operation at correct position based on newSeq
	insertIdx := len(tempOps)
	for i, op := range tempOps {
		if op.Sequence >= newSeq {
			insertIdx = i
			break
		}
	}

	// Re-insert target
	tempOps = append(tempOps[:insertIdx], append([]WorkflowOperation{targetOp}, tempOps[insertIdx:]...)...)

	// Reassign clean sequences sequentially
	for i := range tempOps {
		tempOps[i].Sequence = (i + 1) * 10
		tempOps[i].UpdatedAt = time.Now().UTC()
	}

	wf.Operations = tempOps
	wf.UpdatedBy = user
	wf.UpdatedAt = time.Now().UTC()
	wf.Revision++
	wf.Status = WorkflowStatusDraft

	wf.RecordEvent(NewOperationMovedEvent(wf.ID, wf.WorkflowCode, wf.Version, targetOp.ID, targetOp.Sequence, user))
	return nil
}

// Validate validates the workflow structure and updates status to Ready if successful.
func (wf *ProductionWorkflow) Validate() []string {
	var errs []string

	if strings.TrimSpace(wf.WorkflowName) == "" {
		errs = append(errs, "Workflow name cannot be empty")
	}
	if strings.TrimSpace(wf.WorkflowCode) == "" {
		errs = append(errs, "Workflow code cannot be empty")
	}
	if len(wf.Operations) == 0 {
		errs = append(errs, "Workflow must contain at least one operation")
	}

	seqMap := make(map[int]bool)
	validOperationTypes := map[string]bool{
		"PRINT":            true,
		"MARK":             true,
		"PRINT_AND_MARK":   true,
		"VISION_VERIFY":    true,
		"PLC_REJECT":       true,
		"WAIT":             true,
		"MANUAL_APPROVAL":  true,
	}

	validStationTypes := map[string]bool{
		"PRINT_STATION":    true,
		"LASER_STATION":    true,
		"COMBINED_STATION": true,
		"VISION_STATION":   true,
		"PLC_STATION":      true,
	}

	for _, op := range wf.Operations {
		if seqMap[op.Sequence] {
			errs = append(errs, fmt.Sprintf("Duplicate operation sequence: %d", op.Sequence))
		}
		seqMap[op.Sequence] = true

		if op.Sequence <= 0 {
			errs = append(errs, fmt.Sprintf("Invalid operation sequence: %d (must be > 0)", op.Sequence))
		}

		if !validOperationTypes[op.OperationType] {
			errs = append(errs, fmt.Sprintf("Unsupported operation type: %s in sequence %d", op.OperationType, op.Sequence))
		}

		if !validStationTypes[op.StationType] {
			errs = append(errs, fmt.Sprintf("Unsupported station type: %s in sequence %d", op.StationType, op.Sequence))
		}

		if op.EstimatedDuration <= 0 {
			errs = append(errs, fmt.Sprintf("Estimated duration must be positive in sequence %d", op.Sequence))
		}

		if op.RetryLimit < 0 || op.RetryLimit > 10 {
			errs = append(errs, fmt.Sprintf("Retry limit must be between 0 and 10 in sequence %d", op.Sequence))
		}
	}

	if len(errs) == 0 {
		if wf.Status == WorkflowStatusDraft {
			wf.Status = WorkflowStatusReady
			wf.UpdatedAt = time.Now().UTC()
		}
		wf.RecordEvent(NewWorkflowValidatedEvent(wf.ID, wf.WorkflowCode, wf.Version, wf.UpdatedBy))
	}

	return errs
}

// Publish publishes a ready workflow.
func (wf *ProductionWorkflow) Publish(user string) error {
	if wf.Status != WorkflowStatusReady {
		return fmt.Errorf("only Ready workflows can be published, current: %s", wf.Status)
	}

	now := time.Now().UTC()
	wf.Status = WorkflowStatusPublished
	wf.PublishedAt = &now
	wf.UpdatedBy = user
	wf.UpdatedAt = now
	wf.Revision++

	wf.RecordEvent(NewWorkflowPublishedEvent(wf.ID, wf.WorkflowCode, wf.Version, user))
	return nil
}

// Archive archives a published workflow.
func (wf *ProductionWorkflow) Archive(user string) error {
	if wf.Status != WorkflowStatusPublished {
		return fmt.Errorf("only Published workflows can be archived, current: %s", wf.Status)
	}

	now := time.Now().UTC()
	wf.Status = WorkflowStatusArchived
	wf.ArchivedAt = &now
	wf.UpdatedBy = user
	wf.UpdatedAt = now
	wf.Revision++

	wf.RecordEvent(NewWorkflowArchivedEvent(wf.ID, wf.WorkflowCode, wf.Version, user))
	return nil
}

// Clone creates a new version of this workflow in Draft status.
func (wf *ProductionWorkflow) Clone(newVersion int, user string) (*ProductionWorkflow, error) {
	if wf.Status != WorkflowStatusPublished {
		return nil, fmt.Errorf("only Published workflows can be cloned to next version, current: %s", wf.Status)
	}

	now := time.Now().UTC()
	cloned := &ProductionWorkflow{
		WorkflowCode:  wf.WorkflowCode,
		WorkflowName:  wf.WorkflowName,
		Description:   wf.Description,
		ProductFamily: wf.ProductFamily,
		Version:       newVersion,
		Status:        WorkflowStatusDraft,
		Revision:      1,
		CreatedBy:     user,
		UpdatedBy:     user,
		Operations:    make([]WorkflowOperation, len(wf.Operations)),
	}
	cloned.BaseEntity = domain.NewBaseEntity()

	for i, op := range wf.Operations {
		cloned.Operations[i] = WorkflowOperation{
			ID:                uuid.New(),
			WorkflowID:        cloned.ID,
			Sequence:          op.Sequence,
			OperationType:     op.OperationType,
			StationType:       op.StationType,
			EstimatedDuration: op.EstimatedDuration,
			RetryLimit:        op.RetryLimit,
			IsRequired:        op.IsRequired,
			Metadata:          op.Metadata,
			CreatedAt:         now,
			UpdatedAt:         now,
		}
	}

	cloned.RecordEvent(NewWorkflowVersionCreatedEvent(cloned.ID, cloned.WorkflowCode, cloned.Version, user))
	return cloned, nil
}
