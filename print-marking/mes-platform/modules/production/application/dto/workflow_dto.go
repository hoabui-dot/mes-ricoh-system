package dto

import (
	"time"

	"github.com/google/uuid"
)

type CreateWorkflowRequest struct {
	WorkflowCode  string `json:"workflowCode" binding:"required"`
	WorkflowName  string `json:"workflowName" binding:"required,max=200"`
	Description   string `json:"description" binding:"max=1000"`
	ProductFamily string `json:"productFamily" binding:"required"`
}

type UpdateWorkflowRequest struct {
	WorkflowName  string `json:"workflowName" binding:"required,max=200"`
	Description   string `json:"description" binding:"max=1000"`
	ProductFamily string `json:"productFamily" binding:"required"`
}

type AddOperationRequest struct {
	OperationType     string                 `json:"operationType" binding:"required"`
	StationType       string                 `json:"stationType" binding:"required"`
	EstimatedDuration int                    `json:"estimatedDuration" binding:"required,gt=0"`
	RetryLimit        int                    `json:"retryLimit" binding:"min=0,max=10"`
	IsRequired        *bool                  `json:"isRequired" binding:"required"`
	Metadata          map[string]interface{} `json:"metadata"`
}

type UpdateOperationRequest struct {
	OperationType     string                 `json:"operationType" binding:"required"`
	StationType       string                 `json:"stationType" binding:"required"`
	EstimatedDuration int                    `json:"estimatedDuration" binding:"required,gt=0"`
	RetryLimit        int                    `json:"retryLimit" binding:"min=0,max=10"`
	IsRequired        *bool                  `json:"isRequired" binding:"required"`
	Metadata          map[string]interface{} `json:"metadata"`
}

type MoveOperationRequest struct {
	NewSequence int `json:"newSequence" binding:"required,gt=0"`
}

type WorkflowOperationDTO struct {
	ID                   uuid.UUID              `json:"id"`
	WorkflowID           uuid.UUID              `json:"workflowId"`
	Sequence             int                    `json:"sequence"`
	OperationType        string                 `json:"operationType"`
	StationType          string                 `json:"stationType"`
	EstimatedDuration    int                    `json:"estimatedDuration"`
	RetryLimit           int                    `json:"retryLimit"`
	IsRequired           bool                   `json:"isRequired"`
	Metadata             map[string]interface{} `json:"metadata"`
	OperationName        string                 `json:"operationName"`
	RequiresStation      bool                   `json:"requiresStation"`
	DefaultStationType   string                 `json:"defaultStationType"`
	QualityCheckRequired bool                   `json:"qualityCheckRequired"`
	IsFinalOperation     bool                   `json:"isFinalOperation"`
	RequiredSkills       []string               `json:"requiredSkills"`
	CreatedAt            time.Time              `json:"createdAt"`
	UpdatedAt            time.Time              `json:"updatedAt"`
}

type WorkflowDTO struct {
	ID            uuid.UUID              `json:"id"`
	WorkflowCode  string                 `json:"workflowCode"`
	WorkflowName  string                 `json:"workflowName"`
	Description   string                 `json:"description"`
	ProductFamily string                 `json:"productFamily"`
	Version       int                    `json:"version"`
	Status        string                 `json:"status"`
	PublishedAt   *time.Time             `json:"publishedAt,omitempty"`
	ArchivedAt    *time.Time             `json:"archivedAt,omitempty"`
	Revision      int                    `json:"revision"`
	CreatedBy     string                 `json:"createdBy"`
	UpdatedBy     string                 `json:"updatedBy"`
	CreatedAt     time.Time              `json:"createdAt"`
	UpdatedAt     time.Time              `json:"updatedAt"`
	Operations    []WorkflowOperationDTO `json:"operations"`
}
