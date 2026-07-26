package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/planning/domain/entity"
)

var (
	ErrShiftNotFound         = errors.New("shift not found")
	ErrShiftTemplateNotFound = errors.New("shift template not found")
	ErrHolidayNotFound       = errors.New("holiday not found")
	ErrLeaveNotFound         = errors.New("leave request not found")
	ErrOvertimeNotFound      = errors.New("overtime request not found")
)

type ShiftFilter struct {
	StartDate time.Time
	EndDate   time.Time
}

type LeaveFilter struct {
	WorkerID *uuid.UUID
	Status   string
	Page     int
	PageSize int
}

type OvertimeFilter struct {
	WorkerID *uuid.UUID
	Status   string
	Page     int
	PageSize int
}

type ShiftRepository interface {
	Save(ctx context.Context, shift *entity.Shift) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Shift, error)
	FindByDateAndTemplate(ctx context.Context, date time.Time, templateID uuid.UUID) (*entity.Shift, error)
	List(ctx context.Context, filter ShiftFilter) ([]*entity.Shift, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type ShiftTemplateRepository interface {
	Save(ctx context.Context, tpl *entity.ShiftTemplate) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.ShiftTemplate, error)
	FindByName(ctx context.Context, name string) (*entity.ShiftTemplate, error)
	FindByCode(ctx context.Context, code string) (*entity.ShiftTemplate, error)
	List(ctx context.Context) ([]*entity.ShiftTemplate, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type HolidayRepository interface {
	Save(ctx context.Context, holiday *entity.Holiday) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Holiday, error)
	FindByDate(ctx context.Context, date time.Time) (*entity.Holiday, error)
	List(ctx context.Context, start, end time.Time) ([]*entity.Holiday, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type LeaveRepository interface {
	Save(ctx context.Context, leave *entity.Leave) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Leave, error)
	List(ctx context.Context, filter LeaveFilter) ([]*entity.Leave, int64, error)
	FindOverlap(ctx context.Context, workerID uuid.UUID, start, end time.Time) ([]*entity.Leave, error)
}

type OvertimeRepository interface {
	Save(ctx context.Context, ot *entity.Overtime) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Overtime, error)
	List(ctx context.Context, filter OvertimeFilter) ([]*entity.Overtime, int64, error)
}
