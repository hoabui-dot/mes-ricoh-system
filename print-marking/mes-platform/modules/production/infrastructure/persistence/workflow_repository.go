package persistence

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/production/domain/entity"
	"github.com/nd/mes-platform/modules/production/domain/repository"
	"github.com/nd/mes-platform/modules/production/infrastructure/model"
	"gorm.io/gorm"
)

type GormWorkflowRepository struct {
	db *gorm.DB
}

func NewGormWorkflowRepository(db *gorm.DB) *GormWorkflowRepository {
	return &GormWorkflowRepository{db: db}
}

// Save inserts or updates a workflow aggregate root along with all operations within a transaction.
func (r *GormWorkflowRepository) Save(ctx context.Context, wf *entity.ProductionWorkflow) error {
	m := model.WorkflowToModel(wf)
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Save the workflow header
		if err := tx.Save(&model.ProductionWorkflowModel{
			ID:            m.ID,
			WorkflowCode:  m.WorkflowCode,
			WorkflowName:  m.WorkflowName,
			Description:   m.Description,
			ProductFamily: m.ProductFamily,
			Version:       m.Version,
			Status:        m.Status,
			PublishedAt:   m.PublishedAt,
			ArchivedAt:    m.ArchivedAt,
			Revision:      m.Revision,
			CreatedBy:     m.CreatedBy,
			UpdatedBy:     m.UpdatedBy,
			CreatedAt:     m.CreatedAt,
			UpdatedAt:     m.UpdatedAt,
		}).Error; err != nil {
			return err
		}

		// Delete existing operations
		if err := tx.Where("workflow_id = ?", m.ID).Delete(&model.WorkflowOperationModel{}).Error; err != nil {
			return err
		}

		// Insert new operations
		if len(m.Operations) > 0 {
			if err := tx.Create(&m.Operations).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

// FindByID retrieves a workflow by ID.
func (r *GormWorkflowRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.ProductionWorkflow, error) {
	var m model.ProductionWorkflowModel
	err := r.db.WithContext(ctx).
		Preload("Operations", func(db *gorm.DB) *gorm.DB {
			return db.Order("sequence ASC")
		}).
		Where("id = ?", id).
		First(&m).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrWorkflowNotFound
	}
	if err != nil {
		return nil, err
	}
	return model.ModelToWorkflow(&m), nil
}

// FindByCodeAndVersion retrieves a workflow by its unique code and version combination.
func (r *GormWorkflowRepository) FindByCodeAndVersion(ctx context.Context, code string, version int) (*entity.ProductionWorkflow, error) {
	var m model.ProductionWorkflowModel
	err := r.db.WithContext(ctx).
		Preload("Operations", func(db *gorm.DB) *gorm.DB {
			return db.Order("sequence ASC")
		}).
		Where("workflow_code = ? AND version = ?", code, version).
		First(&m).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrWorkflowNotFound
	}
	if err != nil {
		return nil, err
	}
	return model.ModelToWorkflow(&m), nil
}

// FindPublishedByCode retrieves the published version of a workflow code.
func (r *GormWorkflowRepository) FindPublishedByCode(ctx context.Context, code string) (*entity.ProductionWorkflow, error) {
	var m model.ProductionWorkflowModel
	err := r.db.WithContext(ctx).
		Preload("Operations", func(db *gorm.DB) *gorm.DB {
			return db.Order("sequence ASC")
		}).
		Where("workflow_code = ? AND status = ?", code, string(entity.WorkflowStatusPublished)).
		First(&m).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrWorkflowNotFound
	}
	if err != nil {
		return nil, err
	}
	return model.ModelToWorkflow(&m), nil
}

// List searches and lists workflows with filters and pagination.
func (r *GormWorkflowRepository) List(ctx context.Context, filter repository.WorkflowFilter) ([]*entity.ProductionWorkflow, int64, error) {
	var models []model.ProductionWorkflowModel
	var total int64

	query := r.db.WithContext(ctx).Model(&model.ProductionWorkflowModel{})

	if filter.Keyword != "" {
		keyword := "%" + filter.Keyword + "%"
		query = query.Where("workflow_code ILIKE ? OR workflow_name ILIKE ?", keyword, keyword)
	}

	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}

	if filter.ProductFamily != "" {
		query = query.Where("product_family = ?", filter.ProductFamily)
	}

	if filter.Version > 0 {
		query = query.Where("version = ?", filter.Version)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Pagination
	page := filter.Page
	pageSize := filter.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	offset := (page - 1) * pageSize

	err := query.
		Preload("Operations", func(db *gorm.DB) *gorm.DB {
			return db.Order("sequence ASC")
		}).
		Order("product_family ASC, workflow_name ASC, version DESC").
		Limit(pageSize).
		Offset(offset).
		Find(&models).Error

	if err != nil {
		return nil, 0, err
	}

	workflows := make([]*entity.ProductionWorkflow, len(models))
	for i, m := range models {
		workflows[i] = model.ModelToWorkflow(&m)
	}

	return workflows, total, nil
}
