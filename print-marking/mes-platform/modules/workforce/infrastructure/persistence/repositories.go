package persistence

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/workforce/domain/entity"
	"github.com/nd/mes-platform/modules/workforce/domain/repository"
	"github.com/nd/mes-platform/modules/workforce/infrastructure/model"
	"github.com/nd/mes-platform/shared/outbox"
	"gorm.io/gorm"
)

// ─── Worker Repository ────────────────────────────────────────────────────────

type GormWorkerRepository struct {
	db *gorm.DB
}

func NewGormWorkerRepository(db *gorm.DB) *GormWorkerRepository {
	return &GormWorkerRepository{db: db}
}

func (r *GormWorkerRepository) GetDB() *gorm.DB {
	return r.db
}

func (r *GormWorkerRepository) Save(ctx context.Context, worker *entity.Worker) error {
	m := workerToModel(worker)

	// Since we have associations (Skills, Certificates), we want to manage them properly.
	// We use transaction to delete old skills and replace them with new ones.
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Save main worker details
		if err := tx.Save(m).Error; err != nil {
			return err
		}

		// Delete old skills and write new ones
		if err := tx.Where("worker_id = ?", worker.ID).Delete(&model.SkillMatrixModel{}).Error; err != nil {
			return err
		}
		if len(m.Skills) > 0 {
			if err := tx.Create(&m.Skills).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

func (r *GormWorkerRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Worker, error) {
	var m model.WorkerModel
	err := r.db.WithContext(ctx).
		Preload("Skills.Skill").
		Preload("Certificates").
		Where("id = ? AND deleted_at IS NULL", id).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrWorkerNotFound
	}
	return modelToWorker(&m), err
}

func (r *GormWorkerRepository) FindByEmail(ctx context.Context, email string) (*entity.Worker, error) {
	var m model.WorkerModel
	err := r.db.WithContext(ctx).
		Preload("Skills.Skill").
		Preload("Certificates").
		Where("email = ? AND deleted_at IS NULL", email).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrWorkerNotFound
	}
	return modelToWorker(&m), err
}

func (r *GormWorkerRepository) FindByEmployeeCode(ctx context.Context, code string) (*entity.Worker, error) {
	var m model.WorkerModel
	err := r.db.WithContext(ctx).
		Preload("Skills.Skill").
		Preload("Certificates").
		Where("employee_code = ? AND deleted_at IS NULL", code).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrWorkerNotFound
	}
	return modelToWorker(&m), err
}

func (r *GormWorkerRepository) List(ctx context.Context, filter repository.WorkerFilter) ([]*entity.Worker, int64, error) {
	query := r.db.WithContext(ctx).Model(&model.WorkerModel{}).Where("deleted_at IS NULL")

	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Availability != "" {
		query = query.Where("availability = ?", filter.Availability)
	}
	if filter.DepartmentID != nil {
		query = query.Where("department_id = ?", *filter.DepartmentID)
	}
	if filter.WorkshopID != nil {
		query = query.Where("workshop_id = ?", *filter.WorkshopID)
	}
	if filter.TeamID != nil {
		query = query.Where("team_id = ?", *filter.TeamID)
	}
	if filter.SkillID != nil {
		query = query.Joins("JOIN workforce_skill_matrix sm ON sm.worker_id = workforce_workers.id").
			Where("sm.skill_id = ?", *filter.SkillID)
	}
	if filter.Search != "" {
		like := "%" + filter.Search + "%"
		query = query.Where("first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR employee_code LIKE ? OR employee_number LIKE ? OR phone LIKE ?", like, like, like, like, like, like)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (filter.Page - 1) * filter.PageSize
	var models []model.WorkerModel
	err := query.Preload("Skills.Skill").
		Preload("Certificates").
		Offset(offset).
		Limit(filter.PageSize).
		Order("created_at DESC").
		Find(&models).Error
	if err != nil {
		return nil, 0, err
	}

	workers := make([]*entity.Worker, len(models))
	for i, m := range models {
		workers[i] = modelToWorker(&m)
	}
	return workers, total, nil
}

func (r *GormWorkerRepository) Delete(ctx context.Context, id uuid.UUID) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&model.WorkerModel{}).
		Where("id = ?", id).Update("deleted_at", now).Error
}

func (r *GormWorkerRepository) Restore(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&model.WorkerModel{}).
		Where("id = ?", id).Update("deleted_at", nil).Error
}

// ─── Org Repository ───────────────────────────────────────────────────────────

type GormOrgRepository struct {
	db *gorm.DB
}

func NewGormOrgRepository(db *gorm.DB) *GormOrgRepository {
	return &GormOrgRepository{db: db}
}

func (r *GormOrgRepository) SaveDepartment(ctx context.Context, dept *entity.Department) error {
	m := departmentToModel(dept)
	return r.db.WithContext(ctx).Save(m).Error
}

func (r *GormOrgRepository) FindDepartmentByID(ctx context.Context, id uuid.UUID) (*entity.Department, error) {
	var m model.DepartmentModel
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrDepartmentNotFound
	}
	return modelToDepartment(&m), err
}

func (r *GormOrgRepository) ListDepartments(ctx context.Context) ([]*entity.Department, error) {
	var models []model.DepartmentModel
	if err := r.db.WithContext(ctx).Order("name").Find(&models).Error; err != nil {
		return nil, err
	}
	depts := make([]*entity.Department, len(models))
	for i, m := range models {
		depts[i] = modelToDepartment(&m)
	}
	return depts, nil
}

func (r *GormOrgRepository) DeleteDepartment(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.DepartmentModel{}, id).Error
}

func (r *GormOrgRepository) SaveWorkshop(ctx context.Context, ws *entity.Workshop) error {
	m := workshopToModel(ws)
	return r.db.WithContext(ctx).Save(m).Error
}

func (r *GormOrgRepository) FindWorkshopByID(ctx context.Context, id uuid.UUID) (*entity.Workshop, error) {
	var m model.WorkshopModel
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrWorkshopNotFound
	}
	return modelToWorkshop(&m), err
}

func (r *GormOrgRepository) ListWorkshops(ctx context.Context, deptID *uuid.UUID) ([]*entity.Workshop, error) {
	query := r.db.WithContext(ctx).Model(&model.WorkshopModel{})
	if deptID != nil {
		query = query.Where("department_id = ?", *deptID)
	}
	var models []model.WorkshopModel
	if err := query.Order("name").Find(&models).Error; err != nil {
		return nil, err
	}
	workshops := make([]*entity.Workshop, len(models))
	for i, m := range models {
		workshops[i] = modelToWorkshop(&m)
	}
	return workshops, nil
}

func (r *GormOrgRepository) DeleteWorkshop(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.WorkshopModel{}, id).Error
}

func (r *GormOrgRepository) SaveTeam(ctx context.Context, team *entity.Team) error {
	m := teamToModel(team)
	return r.db.WithContext(ctx).Save(m).Error
}

func (r *GormOrgRepository) FindTeamByID(ctx context.Context, id uuid.UUID) (*entity.Team, error) {
	var m model.TeamModel
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrTeamNotFound
	}
	return modelToTeam(&m), err
}

func (r *GormOrgRepository) ListTeams(ctx context.Context, workshopID *uuid.UUID) ([]*entity.Team, error) {
	query := r.db.WithContext(ctx).Model(&model.TeamModel{})
	if workshopID != nil {
		query = query.Where("workshop_id = ?", *workshopID)
	}
	var models []model.TeamModel
	if err := query.Order("name").Find(&models).Error; err != nil {
		return nil, err
	}
	teams := make([]*entity.Team, len(models))
	for i, m := range models {
		teams[i] = modelToTeam(&m)
	}
	return teams, nil
}

func (r *GormOrgRepository) DeleteTeam(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.TeamModel{}, id).Error
}

// ─── Skill Repository ──────────────────────────────────────────────────────────

type GormSkillRepository struct {
	db *gorm.DB
}

func NewGormSkillRepository(db *gorm.DB) *GormSkillRepository {
	return &GormSkillRepository{db: db}
}

func (r *GormSkillRepository) Save(ctx context.Context, skill *entity.Skill) error {
	m := skillToModel(skill)
	return r.db.WithContext(ctx).Save(m).Error
}

func (r *GormSkillRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Skill, error) {
	var m model.SkillModel
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrSkillNotFound
	}
	return modelToSkill(&m), err
}

func (r *GormSkillRepository) FindByCode(ctx context.Context, code string) (*entity.Skill, error) {
	var m model.SkillModel
	err := r.db.WithContext(ctx).Where("code = ?", code).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrSkillNotFound
	}
	return modelToSkill(&m), err
}

func (r *GormSkillRepository) List(ctx context.Context) ([]*entity.Skill, error) {
	var models []model.SkillModel
	if err := r.db.WithContext(ctx).Order("name").Find(&models).Error; err != nil {
		return nil, err
	}
	skills := make([]*entity.Skill, len(models))
	for i, m := range models {
		skills[i] = modelToSkill(&m)
	}
	return skills, nil
}

func (r *GormSkillRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.SkillModel{}, id).Error
}

// ─── Certificate Repository ───────────────────────────────────────────────────

type GormCertificateRepository struct {
	db *gorm.DB
}

func NewGormCertificateRepository(db *gorm.DB) *GormCertificateRepository {
	return &GormCertificateRepository{db: db}
}

func (r *GormCertificateRepository) Save(ctx context.Context, cert *entity.Certificate) error {
	m := certificateToModel(cert)
	return r.db.WithContext(ctx).Save(m).Error
}

func (r *GormCertificateRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Certificate, error) {
	var m model.CertificateModel
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrCertificateNotFound
	}
	return modelToCertificate(&m), err
}

func (r *GormCertificateRepository) FindByWorkerID(ctx context.Context, workerID uuid.UUID) ([]*entity.Certificate, error) {
	var models []model.CertificateModel
	err := r.db.WithContext(ctx).Where("worker_id = ?", workerID).Order("expires_at DESC").Find(&models).Error
	if err != nil {
		return nil, err
	}
	certs := make([]*entity.Certificate, len(models))
	for i, m := range models {
		certs[i] = modelToCertificate(&m)
	}
	return certs, nil
}

func (r *GormCertificateRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.CertificateModel{}, id).Error
}

// ─── Outbox Repository ────────────────────────────────────────────────────────

type GormOutboxRepository struct {
	db *gorm.DB
}

func NewGormOutboxRepository(db *gorm.DB) *GormOutboxRepository {
	return &GormOutboxRepository{db: db}
}

func (r *GormOutboxRepository) Save(ctx context.Context, event *outbox.Event) error {
	m := &model.OutboxEventModel{
		ID:         event.ID,
		EventName:  event.EventName,
		RoutingKey: event.RoutingKey,
		Payload:    event.Payload,
		Status:     string(event.Status),
		RetryCount: event.RetryCount,
		Error:      event.Error,
		CreatedAt:  event.CreatedAt,
		UpdatedAt:  event.UpdatedAt,
	}
	return r.db.WithContext(ctx).Create(m).Error
}
