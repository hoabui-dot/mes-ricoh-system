package persistence

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/planning/domain/entity"
	"github.com/nd/mes-platform/modules/planning/domain/repository"
	"github.com/nd/mes-platform/modules/planning/infrastructure/model"
	"github.com/nd/mes-platform/shared/outbox"
	"gorm.io/gorm"
)

// ─── Shift Repository ────────────────────────────────────────────────────────

type GormShiftRepository struct {
	db *gorm.DB
}

func NewGormShiftRepository(db *gorm.DB) *GormShiftRepository {
	return &GormShiftRepository{db: db}
}

func (r *GormShiftRepository) Save(ctx context.Context, shift *entity.Shift) error {
	m := shiftToModel(shift)

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(m).Error; err != nil {
			return err
		}

		// Sync Teams Assignment
		if err := tx.Where("shift_id = ?", shift.ID).Delete(&model.TeamAssignmentModel{}).Error; err != nil {
			return err
		}
		if len(m.Teams) > 0 {
			if err := tx.Create(&m.Teams).Error; err != nil {
				return err
			}
		}

		// Sync Workers Assignment
		if err := tx.Where("shift_id = ?", shift.ID).Delete(&model.WorkerAssignmentModel{}).Error; err != nil {
			return err
		}
		if len(m.Workers) > 0 {
			if err := tx.Create(&m.Workers).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

func (r *GormShiftRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Shift, error) {
	var m model.ShiftModel
	err := r.db.WithContext(ctx).
		Preload("ShiftTemplate").
		Preload("Teams").
		Preload("Workers").
		Where("id = ?", id).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrShiftNotFound
	}
	return modelToShift(&m), err
}

func (r *GormShiftRepository) FindByDateAndTemplate(ctx context.Context, date time.Time, templateID uuid.UUID) (*entity.Shift, error) {
	var m model.ShiftModel
	err := r.db.WithContext(ctx).
		Preload("ShiftTemplate").
		Preload("Teams").
		Preload("Workers").
		Where("date = ? AND shift_template_id = ?", date, templateID).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrShiftNotFound
	}
	return modelToShift(&m), err
}

func (r *GormShiftRepository) List(ctx context.Context, filter repository.ShiftFilter) ([]*entity.Shift, error) {
	var models []model.ShiftModel
	err := r.db.WithContext(ctx).
		Preload("ShiftTemplate").
		Preload("Teams").
		Preload("Workers").
		Where("date >= ? AND date <= ?", filter.StartDate, filter.EndDate).
		Order("date ASC").
		Find(&models).Error
	if err != nil {
		return nil, err
	}

	shifts := make([]*entity.Shift, len(models))
	for i, m := range models {
		shifts[i] = modelToShift(&m)
	}
	return shifts, nil
}

func (r *GormShiftRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.ShiftModel{}, id).Error
}

// ─── Shift Template Repository ────────────────────────────────────────────────

type GormShiftTemplateRepository struct {
	db *gorm.DB
}

func NewGormShiftTemplateRepository(db *gorm.DB) *GormShiftTemplateRepository {
	return &GormShiftTemplateRepository{db: db}
}

func (r *GormShiftTemplateRepository) Save(ctx context.Context, tpl *entity.ShiftTemplate) error {
	m := shiftTemplateToModel(tpl)
	return r.db.WithContext(ctx).Save(m).Error
}

func (r *GormShiftTemplateRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.ShiftTemplate, error) {
	var m model.ShiftTemplateModel
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrShiftTemplateNotFound
	}
	return modelToShiftTemplate(&m), err
}

func (r *GormShiftTemplateRepository) FindByName(ctx context.Context, name string) (*entity.ShiftTemplate, error) {
	var m model.ShiftTemplateModel
	err := r.db.WithContext(ctx).Where("name = ?", name).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrShiftTemplateNotFound
	}
	return modelToShiftTemplate(&m), err
}

func (r *GormShiftTemplateRepository) FindByCode(ctx context.Context, code string) (*entity.ShiftTemplate, error) {
	var m model.ShiftTemplateModel
	err := r.db.WithContext(ctx).Where("code = ?", code).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrShiftTemplateNotFound
	}
	return modelToShiftTemplate(&m), err
}

func (r *GormShiftTemplateRepository) List(ctx context.Context) ([]*entity.ShiftTemplate, error) {
	var models []model.ShiftTemplateModel
	if err := r.db.WithContext(ctx).Order("name").Find(&models).Error; err != nil {
		return nil, err
	}

	tpls := make([]*entity.ShiftTemplate, len(models))
	for i, m := range models {
		tpls[i] = modelToShiftTemplate(&m)
	}
	return tpls, nil
}

func (r *GormShiftTemplateRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.ShiftTemplateModel{}, id).Error
}

// ─── Holiday Repository ───────────────────────────────────────────────────────

type GormHolidayRepository struct {
	db *gorm.DB
}

func NewGormHolidayRepository(db *gorm.DB) *GormHolidayRepository {
	return &GormHolidayRepository{db: db}
}

func (r *GormHolidayRepository) Save(ctx context.Context, holiday *entity.Holiday) error {
	m := holidayToModel(holiday)
	return r.db.WithContext(ctx).Save(m).Error
}

func (r *GormHolidayRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Holiday, error) {
	var m model.HolidayModel
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrHolidayNotFound
	}
	return modelToHoliday(&m), err
}

func (r *GormHolidayRepository) FindByDate(ctx context.Context, date time.Time) (*entity.Holiday, error) {
	var m model.HolidayModel
	err := r.db.WithContext(ctx).Where("date = ?", date).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrHolidayNotFound
	}
	return modelToHoliday(&m), err
}

func (r *GormHolidayRepository) List(ctx context.Context, start, end time.Time) ([]*entity.Holiday, error) {
	var models []model.HolidayModel
	err := r.db.WithContext(ctx).
		Where("date >= ? AND date <= ?", start, end).
		Order("date ASC").
		Find(&models).Error
	if err != nil {
		return nil, err
	}

	holidays := make([]*entity.Holiday, len(models))
	for i, m := range models {
		holidays[i] = modelToHoliday(&m)
	}
	return holidays, nil
}

func (r *GormHolidayRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.HolidayModel{}, id).Error
}

// ─── Leave Repository ─────────────────────────────────────────────────────────

type GormLeaveRepository struct {
	db *gorm.DB
}

func NewGormLeaveRepository(db *gorm.DB) *GormLeaveRepository {
	return &GormLeaveRepository{db: db}
}

func (r *GormLeaveRepository) Save(ctx context.Context, leave *entity.Leave) error {
	m := leaveToModel(leave)
	return r.db.WithContext(ctx).Save(m).Error
}

func (r *GormLeaveRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Leave, error) {
	var m model.LeaveModel
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrLeaveNotFound
	}
	return modelToLeave(&m), err
}

func (r *GormLeaveRepository) List(ctx context.Context, filter repository.LeaveFilter) ([]*entity.Leave, int64, error) {
	query := r.db.WithContext(ctx).Model(&model.LeaveModel{})

	if filter.WorkerID != nil {
		query = query.Where("worker_id = ?", *filter.WorkerID)
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page := filter.Page
	pageSize := filter.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	var models []model.LeaveModel
	err := query.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&models).Error
	if err != nil {
		return nil, 0, err
	}

	leaves := make([]*entity.Leave, len(models))
	for i, m := range models {
		leaves[i] = modelToLeave(&m)
	}
	return leaves, total, nil
}

func (r *GormLeaveRepository) FindOverlap(ctx context.Context, workerID uuid.UUID, start, end time.Time) ([]*entity.Leave, error) {
	var models []model.LeaveModel
	// overlap conditions: start_date <= end AND end_date >= start
	err := r.db.WithContext(ctx).
		Where("worker_id = ? AND start_date <= ? AND end_date >= ?", workerID, end, start).
		Find(&models).Error
	if err != nil {
		return nil, err
	}

	leaves := make([]*entity.Leave, len(models))
	for i, m := range models {
		leaves[i] = modelToLeave(&m)
	}
	return leaves, nil
}

// ─── Overtime Repository ──────────────────────────────────────────────────────

type GormOvertimeRepository struct {
	db *gorm.DB
}

func NewGormOvertimeRepository(db *gorm.DB) *GormOvertimeRepository {
	return &GormOvertimeRepository{db: db}
}

func (r *GormOvertimeRepository) Save(ctx context.Context, ot *entity.Overtime) error {
	m := overtimeToModel(ot)
	return r.db.WithContext(ctx).Save(m).Error
}

func (r *GormOvertimeRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Overtime, error) {
	var m model.OvertimeModel
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrOvertimeNotFound
	}
	return modelToOvertime(&m), err
}

func (r *GormOvertimeRepository) List(ctx context.Context, filter repository.OvertimeFilter) ([]*entity.Overtime, int64, error) {
	query := r.db.WithContext(ctx).Model(&model.OvertimeModel{})

	if filter.WorkerID != nil {
		query = query.Where("worker_id = ?", *filter.WorkerID)
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page := filter.Page
	pageSize := filter.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	var models []model.OvertimeModel
	err := query.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&models).Error
	if err != nil {
		return nil, 0, err
	}

	overtimes := make([]*entity.Overtime, len(models))
	for i, m := range models {
		overtimes[i] = modelToOvertime(&m)
	}
	return overtimes, total, nil
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
