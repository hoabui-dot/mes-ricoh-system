package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/workforce/domain/entity"
	"github.com/nd/mes-platform/shared/outbox"
)

var (
	ErrWorkerNotFound      = errors.New("worker not found")
	ErrDepartmentNotFound  = errors.New("department not found")
	ErrWorkshopNotFound    = errors.New("workshop not found")
	ErrTeamNotFound        = errors.New("team not found")
	ErrSkillNotFound       = errors.New("skill not found")
	ErrCertificateNotFound = errors.New("certificate not found")
)

type WorkerFilter struct {
	Search       string
	Status       string
	Availability string
	DepartmentID *uuid.UUID
	WorkshopID   *uuid.UUID
	TeamID       *uuid.UUID
	SkillID      *uuid.UUID
	Page         int
	PageSize     int
}

type WorkerRepository interface {
	Save(ctx context.Context, worker *entity.Worker) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Worker, error)
	FindByEmail(ctx context.Context, email string) (*entity.Worker, error)
	FindByEmployeeCode(ctx context.Context, code string) (*entity.Worker, error)
	List(ctx context.Context, filter WorkerFilter) ([]*entity.Worker, int64, error)
	Delete(ctx context.Context, id uuid.UUID) error
	Restore(ctx context.Context, id uuid.UUID) error
}

type OrgRepository interface {
	SaveDepartment(ctx context.Context, dept *entity.Department) error
	FindDepartmentByID(ctx context.Context, id uuid.UUID) (*entity.Department, error)
	ListDepartments(ctx context.Context) ([]*entity.Department, error)
	DeleteDepartment(ctx context.Context, id uuid.UUID) error

	SaveWorkshop(ctx context.Context, workshop *entity.Workshop) error
	FindWorkshopByID(ctx context.Context, id uuid.UUID) (*entity.Workshop, error)
	ListWorkshops(ctx context.Context, deptID *uuid.UUID) ([]*entity.Workshop, error)
	DeleteWorkshop(ctx context.Context, id uuid.UUID) error

	SaveTeam(ctx context.Context, team *entity.Team) error
	FindTeamByID(ctx context.Context, id uuid.UUID) (*entity.Team, error)
	ListTeams(ctx context.Context, workshopID *uuid.UUID) ([]*entity.Team, error)
	DeleteTeam(ctx context.Context, id uuid.UUID) error
}

type SkillRepository interface {
	Save(ctx context.Context, skill *entity.Skill) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Skill, error)
	FindByCode(ctx context.Context, code string) (*entity.Skill, error)
	List(ctx context.Context) ([]*entity.Skill, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type CertificateRepository interface {
	Save(ctx context.Context, cert *entity.Certificate) error
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Certificate, error)
	FindByWorkerID(ctx context.Context, workerID uuid.UUID) ([]*entity.Certificate, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type OutboxRepository interface {
	Save(ctx context.Context, event *outbox.Event) error
}
