package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/production/domain/entity"
)

// ProductionWorkflowModel is the GORM model for production_workflows.
type ProductionWorkflowModel struct {
	ID            uuid.UUID                `gorm:"type:uuid;primaryKey"`
	WorkflowCode  string                   `gorm:"type:varchar(100);not null"`
	WorkflowName  string                   `gorm:"type:varchar(255);not null"`
	Description   string                   `gorm:"type:text"`
	ProductFamily string                   `gorm:"type:varchar(100);not null"`
	Version       int                      `gorm:"not null;default:1"`
	Status        string                   `gorm:"type:varchar(50);not null;default:'draft'"`
	PublishedAt   *time.Time               `gorm:"default:null"`
	ArchivedAt    *time.Time               `gorm:"default:null"`
	Revision      int                      `gorm:"not null;default:1"`
	CreatedBy     string                   `gorm:"type:varchar(100)"`
	UpdatedBy     string                   `gorm:"type:varchar(100)"`
	CreatedAt     time.Time                `gorm:"autoCreateTime"`
	UpdatedAt     time.Time                `gorm:"autoUpdateTime"`
	Operations    []WorkflowOperationModel `gorm:"foreignKey:WorkflowID;constraint:OnDelete:CASCADE"`
}

func (ProductionWorkflowModel) TableName() string { return "production_workflows" }

// WorkflowOperationModel is the GORM model for workflow_operations.
type WorkflowOperationModel struct {
	ID                   uuid.UUID `gorm:"type:uuid;primaryKey"`
	WorkflowID           uuid.UUID `gorm:"type:uuid;not null;index"`
	Sequence             int       `gorm:"not null"`
	OperationType        string    `gorm:"type:varchar(100);not null"`
	StationType          string    `gorm:"type:varchar(100);not null"`
	EstimatedDuration    int       `gorm:"not null;default:0"`
	RetryLimit           int       `gorm:"not null;default:0"`
	IsRequired           bool      `gorm:"not null;default:true"`
	MetadataJSON         string    `gorm:"type:text;not null;default:'{}'"` // JSON representation of metadata
	OperationName        string    `gorm:"type:varchar(255);not null;default:''"`
	RequiresStation      bool      `gorm:"not null;default:true"`
	DefaultStationType   string    `gorm:"type:varchar(100);not null;default:''"`
	QualityCheckRequired bool      `gorm:"not null;default:false"`
	IsFinalOperation     bool      `gorm:"not null;default:false"`
	RequiredSkillsJSON   string    `gorm:"type:text;not null;default:'[]'"`
	CreatedAt            time.Time `gorm:"autoCreateTime"`
	UpdatedAt            time.Time `gorm:"autoUpdateTime"`
}

func (WorkflowOperationModel) TableName() string { return "workflow_operations" }

// ModelToWorkflow converts DB model to domain entity.
func ModelToWorkflow(m *ProductionWorkflowModel) *entity.ProductionWorkflow {
	ops := make([]entity.WorkflowOperation, len(m.Operations))
	for i, op := range m.Operations {
		var meta map[string]interface{}
		_ = json.Unmarshal([]byte(op.MetadataJSON), &meta)
		if meta == nil {
			meta = make(map[string]interface{})
		}

		var skills []string
		_ = json.Unmarshal([]byte(op.RequiredSkillsJSON), &skills)
		if skills == nil {
			skills = []string{}
		}

		ops[i] = entity.WorkflowOperation{
			ID:                   op.ID,
			WorkflowID:           op.WorkflowID,
			Sequence:             op.Sequence,
			OperationType:        op.OperationType,
			StationType:          op.StationType,
			EstimatedDuration:    op.EstimatedDuration,
			RetryLimit:           op.RetryLimit,
			IsRequired:           op.IsRequired,
			Metadata:             meta,
			OperationName:        op.OperationName,
			RequiresStation:      op.RequiresStation,
			DefaultStationType:   op.DefaultStationType,
			QualityCheckRequired: op.QualityCheckRequired,
			IsFinalOperation:     op.IsFinalOperation,
			RequiredSkills:       skills,
			CreatedAt:            op.CreatedAt,
			UpdatedAt:            op.UpdatedAt,
		}
	}

	wf := &entity.ProductionWorkflow{
		WorkflowCode:  m.WorkflowCode,
		WorkflowName:  m.WorkflowName,
		Description:   m.Description,
		ProductFamily: m.ProductFamily,
		Version:       m.Version,
		Status:        entity.WorkflowStatus(m.Status),
		PublishedAt:   m.PublishedAt,
		ArchivedAt:    m.ArchivedAt,
		Revision:      m.Revision,
		CreatedBy:     m.CreatedBy,
		UpdatedBy:     m.UpdatedBy,
		Operations:    ops,
	}
	wf.ID = m.ID
	wf.CreatedAt = m.CreatedAt
	wf.UpdatedAt = m.UpdatedAt

	return wf
}

// WorkflowToModel converts domain entity to DB model.
func WorkflowToModel(wf *entity.ProductionWorkflow) *ProductionWorkflowModel {
	ops := make([]WorkflowOperationModel, len(wf.Operations))
	for i, op := range wf.Operations {
		metaBytes, _ := json.Marshal(op.Metadata)
		metaJSON := string(metaBytes)
		if metaJSON == "" || metaJSON == "null" {
			metaJSON = "{}"
		}

		skillsBytes, _ := json.Marshal(op.RequiredSkills)
		skillsJSON := string(skillsBytes)
		if skillsJSON == "" || skillsJSON == "null" {
			skillsJSON = "[]"
		}

		ops[i] = WorkflowOperationModel{
			ID:                   op.ID,
			WorkflowID:           wf.ID,
			Sequence:             op.Sequence,
			OperationType:        op.OperationType,
			StationType:          op.StationType,
			EstimatedDuration:    op.EstimatedDuration,
			RetryLimit:           op.RetryLimit,
			IsRequired:           op.IsRequired,
			MetadataJSON:         metaJSON,
			OperationName:        op.OperationName,
			RequiresStation:      op.RequiresStation,
			DefaultStationType:   op.DefaultStationType,
			QualityCheckRequired: op.QualityCheckRequired,
			IsFinalOperation:     op.IsFinalOperation,
			RequiredSkillsJSON:   skillsJSON,
			CreatedAt:            op.CreatedAt,
			UpdatedAt:            op.UpdatedAt,
		}
	}

	return &ProductionWorkflowModel{
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
