package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/workforce/application/dto"
	"github.com/nd/mes-platform/modules/workforce/domain/entity"
	"github.com/nd/mes-platform/modules/workforce/domain/repository"
	workforcepersistence "github.com/nd/mes-platform/modules/workforce/infrastructure/persistence"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/domain"
	"github.com/nd/mes-platform/shared/outbox"
)

var (
	ErrNotFound   = errors.New("resource not found")
	ErrConflict   = errors.New("resource conflict")
	ErrValidation = errors.New("validation failed")
)

type WorkforceService struct {
	workerRepo repository.WorkerRepository
	orgRepo    repository.OrgRepository
	skillRepo  repository.SkillRepository
	certRepo   repository.CertificateRepository
	outboxRepo repository.OutboxRepository
	log        *logger.Logger
}

func NewWorkforceService(
	workerRepo repository.WorkerRepository,
	orgRepo repository.OrgRepository,
	skillRepo repository.SkillRepository,
	certRepo repository.CertificateRepository,
	outboxRepo repository.OutboxRepository,
	log *logger.Logger,
) *WorkforceService {
	return &WorkforceService{
		workerRepo: workerRepo,
		orgRepo:    orgRepo,
		skillRepo:  skillRepo,
		certRepo:   certRepo,
		outboxRepo: outboxRepo,
		log:        log.With(logger.Module("workforce")),
	}
}

// ─── Worker Use Cases ──────────────────────────────────────────────────────────

func (s *WorkforceService) CreateWorker(ctx context.Context, req dto.CreateWorkerRequest) (*dto.WorkerDTO, error) {
	if exists, _ := s.workerRepo.FindByEmail(ctx, req.Email); exists != nil {
		return nil, fmt.Errorf("%w: employee with email %s already exists", ErrConflict, req.Email)
	}
	if exists, _ := s.workerRepo.FindByEmployeeCode(ctx, req.EmployeeCode); exists != nil {
		return nil, fmt.Errorf("%w: employee with code %s already exists", ErrConflict, req.EmployeeCode)
	}

	var userID *uuid.UUID
	if req.UserID != nil && *req.UserID != "" {
		id, err := uuid.Parse(*req.UserID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid user_id", ErrValidation)
		}
		userID = &id
	}

	var deptID, wsID, teamID *uuid.UUID
	if req.DepartmentID != nil && *req.DepartmentID != "" {
		id, err := uuid.Parse(*req.DepartmentID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid department_id", ErrValidation)
		}
		if _, err := s.orgRepo.FindDepartmentByID(ctx, id); err != nil {
			return nil, fmt.Errorf("%w: department not found", ErrNotFound)
		}
		deptID = &id
	}

	if req.WorkshopID != nil && *req.WorkshopID != "" {
		id, err := uuid.Parse(*req.WorkshopID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid workshop_id", ErrValidation)
		}
		if _, err := s.orgRepo.FindWorkshopByID(ctx, id); err != nil {
			return nil, fmt.Errorf("%w: workshop not found", ErrNotFound)
		}
		wsID = &id
	}

	if req.TeamID != nil && *req.TeamID != "" {
		id, err := uuid.Parse(*req.TeamID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid team_id", ErrValidation)
		}
		if _, err := s.orgRepo.FindTeamByID(ctx, id); err != nil {
			return nil, fmt.Errorf("%w: team not found", ErrNotFound)
		}
		teamID = &id
	}

	var birthday *time.Time
	if req.Birthday != nil && *req.Birthday != "" {
		t, err := time.Parse("2006-01-02", *req.Birthday)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid birthday", ErrValidation)
		}
		birthday = &t
	}

	var employmentDate *time.Time
	if req.EmploymentDate != nil && *req.EmploymentDate != "" {
		t, err := time.Parse(time.RFC3339, *req.EmploymentDate)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid employment date", ErrValidation)
		}
		employmentDate = &t
	}

	worker, err := entity.NewWorker(
		userID, req.FirstName, req.LastName, req.Email, req.Phone, req.EmployeeCode,
		req.EmployeeNumber, req.Avatar, req.Gender, birthday, req.Address, employmentDate,
		deptID, wsID, teamID, req.Position, req.Notes,
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.workerRepo.Save(ctx, worker); err != nil {
		return nil, err
	}

	_ = s.publishEvents(ctx, worker.PullEvents())
	return mapWorkerToDTO(worker), nil
}

func (s *WorkforceService) UpdateWorker(ctx context.Context, id uuid.UUID, req dto.UpdateWorkerRequest) (*dto.WorkerDTO, error) {
	worker, err := s.workerRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	var deptID, wsID, teamID *uuid.UUID
	if req.DepartmentID != nil && *req.DepartmentID != "" {
		did, err := uuid.Parse(*req.DepartmentID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid department_id", ErrValidation)
		}
		if _, err := s.orgRepo.FindDepartmentByID(ctx, did); err != nil {
			return nil, fmt.Errorf("%w: department not found", ErrNotFound)
		}
		deptID = &did
	}
	if req.WorkshopID != nil && *req.WorkshopID != "" {
		wid, err := uuid.Parse(*req.WorkshopID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid workshop_id", ErrValidation)
		}
		if _, err := s.orgRepo.FindWorkshopByID(ctx, wid); err != nil {
			return nil, fmt.Errorf("%w: workshop not found", ErrNotFound)
		}
		wsID = &wid
	}
	if req.TeamID != nil && *req.TeamID != "" {
		tid, err := uuid.Parse(*req.TeamID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid team_id", ErrValidation)
		}
		if _, err := s.orgRepo.FindTeamByID(ctx, tid); err != nil {
			return nil, fmt.Errorf("%w: team not found", ErrNotFound)
		}
		teamID = &tid
	}

	var birthday *time.Time
	if req.Birthday != nil && *req.Birthday != "" {
		t, err := time.Parse("2006-01-02", *req.Birthday)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid birthday", ErrValidation)
		}
		birthday = &t
	}

	var employmentDate *time.Time
	if req.EmploymentDate != nil && *req.EmploymentDate != "" {
		t, err := time.Parse(time.RFC3339, *req.EmploymentDate)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid employment date", ErrValidation)
		}
		employmentDate = &t
	}

	worker.FirstName = req.FirstName
	worker.LastName = req.LastName
	worker.Phone = req.Phone
	worker.EmployeeNumber = req.EmployeeNumber
	worker.Avatar = req.Avatar
	worker.Gender = req.Gender
	worker.Birthday = birthday
	worker.Address = req.Address
	worker.EmploymentDate = employmentDate
	worker.DepartmentID = deptID
	worker.WorkshopID = wsID
	worker.TeamID = teamID
	worker.Position = req.Position
	worker.Notes = req.Notes

	if err := worker.UpdateStatus(entity.WorkerStatus(req.Status)); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.workerRepo.Save(ctx, worker); err != nil {
		return nil, err
	}

	evt := entity.NewWorkerUpdatedEvent(worker.ID, worker.EmployeeCode)
	_ = s.publishEvents(ctx, append(worker.PullEvents(), evt))
	return mapWorkerToDTO(worker), nil
}

func (s *WorkforceService) UpdateAvailability(ctx context.Context, id uuid.UUID, req dto.UpdateAvailabilityRequest) error {
	worker, err := s.workerRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}

	if err := worker.UpdateAvailability(entity.WorkerAvailability(req.Availability)); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.workerRepo.Save(ctx, worker); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, worker.PullEvents())
	return nil
}

func (s *WorkforceService) GetWorker(ctx context.Context, id uuid.UUID) (*dto.WorkerDTO, error) {
	worker, err := s.workerRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	return mapWorkerToDTO(worker), nil
}

func (s *WorkforceService) ListWorkers(ctx context.Context, filter repository.WorkerFilter) ([]*dto.WorkerDTO, int64, error) {
	workers, total, err := s.workerRepo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	dtos := make([]*dto.WorkerDTO, len(workers))
	for i, w := range workers {
		dtos[i] = mapWorkerToDTO(w)
	}
	return dtos, total, nil
}

func (s *WorkforceService) DeleteWorker(ctx context.Context, id uuid.UUID) error {
	if _, err := s.workerRepo.FindByID(ctx, id); err != nil {
		return ErrNotFound
	}

	if err := s.workerRepo.Delete(ctx, id); err != nil {
		return err
	}

	evt := entity.NewWorkerDeletedEvent(id)
	_ = s.publishEvents(ctx, []domain.DomainEvent{evt})
	return nil
}

func (s *WorkforceService) RestoreWorker(ctx context.Context, id uuid.UUID) error {
	if err := s.workerRepo.Restore(ctx, id); err != nil {
		return err
	}

	evt := entity.NewWorkerRestoredEvent(id)
	_ = s.publishEvents(ctx, []domain.DomainEvent{evt})
	return nil
}

func (s *WorkforceService) UpdateWorkerSkills(ctx context.Context, id uuid.UUID, req dto.UpdateSkillsRequest) error {
	worker, err := s.workerRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}

	skills := make([]entity.WorkerSkill, len(req.Skills))
	for i, sk := range req.Skills {
		sid, err := uuid.Parse(sk.SkillID)
		if err != nil {
			return fmt.Errorf("%w: invalid skill ID", ErrValidation)
		}
		skillDef, err := s.skillRepo.FindByID(ctx, sid)
		if err != nil {
			return fmt.Errorf("%w: skill not found", ErrNotFound)
		}
		skills[i] = entity.WorkerSkill{
			SkillID:          sid,
			Skill:            skillDef,
			ProficiencyLevel: sk.ProficiencyLevel,
		}
	}

	// Guard against duplicates
	seen := make(map[uuid.UUID]bool)
	for _, sk := range skills {
		if seen[sk.SkillID] {
			return fmt.Errorf("%w: duplicate skill is not allowed", ErrValidation)
		}
		seen[sk.SkillID] = true
	}

	if err := worker.UpdateSkills(skills); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.workerRepo.Save(ctx, worker); err != nil {
		return err
	}

	// Also publish specific SkillAssigned/Removed events
	for _, sk := range skills {
		evt := entity.NewWorkerSkillAssignedEvent(worker.ID, sk.SkillID)
		_ = s.publishEvents(ctx, []domain.DomainEvent{evt})
	}

	_ = s.publishEvents(ctx, worker.PullEvents())
	return nil
}

func (s *WorkforceService) AddCertificate(ctx context.Context, id uuid.UUID, req dto.AddCertificateRequest) (*dto.CertificateDTO, error) {
	worker, err := s.workerRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	issued, err := time.Parse(time.RFC3339, req.IssuedAt)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid issued_at", ErrValidation)
	}

	expires, err := time.Parse(time.RFC3339, req.ExpiresAt)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid expires_at", ErrValidation)
	}

	cert, err := entity.NewCertificate(worker.ID, req.Name, req.IssuingAuthority, req.CertificateNumber, issued, expires, req.DocumentURL)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	worker.AddCertificate(*cert)

	if err := s.workerRepo.Save(ctx, worker); err != nil {
		return nil, err
	}

	evt := entity.NewWorkerCertificationAssignedEvent(worker.ID, cert.ID)
	_ = s.publishEvents(ctx, []domain.DomainEvent{evt})

	_ = s.publishEvents(ctx, worker.PullEvents())
	return mapCertificateToDTO(cert), nil
}

func (s *WorkforceService) ListWorkerCertificates(ctx context.Context, id uuid.UUID) ([]*dto.CertificateDTO, error) {
	certs, err := s.certRepo.FindByWorkerID(ctx, id)
	if err != nil {
		return nil, err
	}

	dtos := make([]*dto.CertificateDTO, len(certs))
	for i, c := range certs {
		dtos[i] = mapCertificateToDTO(c)
	}
	return dtos, nil
}

// ─── Skill Use Cases ───────────────────────────────────────────────────────────

func (s *WorkforceService) CreateSkill(ctx context.Context, req dto.CreateSkillRequest) (*dto.SkillDTO, error) {
	if exists, _ := s.skillRepo.FindByCode(ctx, req.Code); exists != nil {
		return nil, fmt.Errorf("%w: skill with code %s already exists", ErrConflict, req.Code)
	}

	skill, err := entity.NewSkill(req.Name, req.Code, req.Description)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.skillRepo.Save(ctx, skill); err != nil {
		return nil, err
	}

	return &dto.SkillDTO{ID: skill.ID, Code: skill.Code, Name: skill.Name, Description: skill.Description}, nil
}

func (s *WorkforceService) UpdateSkill(ctx context.Context, id uuid.UUID, req dto.UpdateSkillRequest) (*dto.SkillDTO, error) {
	skill, err := s.skillRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	skill.Name = req.Name
	skill.Description = req.Description

	if err := s.skillRepo.Save(ctx, skill); err != nil {
		return nil, err
	}

	return &dto.SkillDTO{ID: skill.ID, Code: skill.Code, Name: skill.Name, Description: skill.Description}, nil
}

func (s *WorkforceService) DeleteSkill(ctx context.Context, id uuid.UUID) error {
	// Cannot delete skill if worker references it
	var count int64
	if err := s.workerRepo.(*workforcepersistence.GormWorkerRepository).GetDB().Table("workforce_skill_matrix").
		Where("skill_id = ?", id).Count(&count).Error; err == nil && count > 0 {
		return fmt.Errorf("%w: cannot delete skill referenced by workers", ErrConflict)
	}

	if _, err := s.skillRepo.FindByID(ctx, id); err != nil {
		return ErrNotFound
	}

	return s.skillRepo.Delete(ctx, id)
}

func (s *WorkforceService) ListSkills(ctx context.Context) ([]*dto.SkillDTO, error) {
	skills, err := s.skillRepo.List(ctx)
	if err != nil {
		return nil, err
	}

	dtos := make([]*dto.SkillDTO, len(skills))
	for i, sk := range skills {
		dtos[i] = &dto.SkillDTO{ID: sk.ID, Code: sk.Code, Name: sk.Name, Description: sk.Description}
	}
	return dtos, nil
}

func (s *WorkforceService) GetSkill(ctx context.Context, id uuid.UUID) (*dto.SkillDTO, error) {
	skill, err := s.skillRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	return &dto.SkillDTO{ID: skill.ID, Code: skill.Code, Name: skill.Name, Description: skill.Description}, nil
}

// ─── Department Use Cases ──────────────────────────────────────────────────────

func (s *WorkforceService) CreateDepartment(ctx context.Context, req dto.CreateDepartmentRequest) (*dto.DepartmentDTO, error) {
	var managerID *uuid.UUID
	if req.ManagerID != nil && *req.ManagerID != "" {
		mid, err := uuid.Parse(*req.ManagerID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid manager_id", ErrValidation)
		}
		managerID = &mid
	}

	dept, err := entity.NewDepartment(req.Code, req.Name, req.Description, managerID, req.Status)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}
	if err := s.orgRepo.SaveDepartment(ctx, dept); err != nil {
		return nil, err
	}

	evt := entity.NewDepartmentCreatedEvent(dept.ID, dept.Code)
	_ = s.publishEvents(ctx, []domain.DomainEvent{evt})

	return &dto.DepartmentDTO{ID: dept.ID, Code: dept.Code, Name: dept.Name, Description: dept.Description, ManagerID: dept.ManagerID, Status: dept.Status}, nil
}

func (s *WorkforceService) UpdateDepartment(ctx context.Context, id uuid.UUID, req dto.UpdateDepartmentRequest) (*dto.DepartmentDTO, error) {
	dept, err := s.orgRepo.FindDepartmentByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	var managerID *uuid.UUID
	if req.ManagerID != nil && *req.ManagerID != "" {
		mid, err := uuid.Parse(*req.ManagerID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid manager_id", ErrValidation)
		}
		managerID = &mid
	}

	dept.Name = req.Name
	dept.Description = req.Description
	dept.ManagerID = managerID
	dept.Status = req.Status

	if err := s.orgRepo.SaveDepartment(ctx, dept); err != nil {
		return nil, err
	}

	return &dto.DepartmentDTO{ID: dept.ID, Code: dept.Code, Name: dept.Name, Description: dept.Description, ManagerID: dept.ManagerID, Status: dept.Status}, nil
}

func (s *WorkforceService) DeleteDepartment(ctx context.Context, id uuid.UUID) error {
	// Cannot delete department if workshop exists
	var count int64
	if err := s.workerRepo.(*workforcepersistence.GormWorkerRepository).GetDB().Table("workforce_workshops").
		Where("department_id = ?", id).Count(&count).Error; err == nil && count > 0 {
		return fmt.Errorf("%w: cannot delete department containing workshops", ErrConflict)
	}

	if _, err := s.orgRepo.FindDepartmentByID(ctx, id); err != nil {
		return ErrNotFound
	}

	return s.orgRepo.DeleteDepartment(ctx, id)
}

func (s *WorkforceService) ListDepartments(ctx context.Context) ([]*dto.DepartmentDTO, error) {
	depts, err := s.orgRepo.ListDepartments(ctx)
	if err != nil {
		return nil, err
	}
	dtos := make([]*dto.DepartmentDTO, len(depts))
	for i, d := range depts {
		dtos[i] = &dto.DepartmentDTO{ID: d.ID, Code: d.Code, Name: d.Name, Description: d.Description, ManagerID: d.ManagerID, Status: d.Status}
	}
	return dtos, nil
}

func (s *WorkforceService) GetDepartment(ctx context.Context, id uuid.UUID) (*dto.DepartmentDTO, error) {
	dept, err := s.orgRepo.FindDepartmentByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	return &dto.DepartmentDTO{ID: dept.ID, Code: dept.Code, Name: dept.Name, Description: dept.Description, ManagerID: dept.ManagerID, Status: dept.Status}, nil
}

// ─── Workshop Use Cases ────────────────────────────────────────────────────────

func (s *WorkforceService) CreateWorkshop(ctx context.Context, deptID uuid.UUID, req dto.CreateWorkshopRequest) (*dto.WorkshopDTO, error) {
	if _, err := s.orgRepo.FindDepartmentByID(ctx, deptID); err != nil {
		return nil, ErrNotFound
	}
	workshop, err := entity.NewWorkshop(deptID, req.Code, req.Name, req.Factory, req.Description, req.Status)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}
	if err := s.orgRepo.SaveWorkshop(ctx, workshop); err != nil {
		return nil, err
	}

	evt := entity.NewWorkshopCreatedEvent(workshop.ID, workshop.Code)
	_ = s.publishEvents(ctx, []domain.DomainEvent{evt})

	return &dto.WorkshopDTO{ID: workshop.ID, DepartmentID: workshop.DepartmentID, Code: workshop.Code, Name: workshop.Name, Factory: workshop.Factory, Description: workshop.Description, Status: workshop.Status}, nil
}

func (s *WorkforceService) UpdateWorkshop(ctx context.Context, id uuid.UUID, req dto.UpdateWorkshopRequest) (*dto.WorkshopDTO, error) {
	workshop, err := s.orgRepo.FindWorkshopByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	workshop.Name = req.Name
	workshop.Factory = req.Factory
	workshop.Description = req.Description
	workshop.Status = req.Status

	if err := s.orgRepo.SaveWorkshop(ctx, workshop); err != nil {
		return nil, err
	}

	return &dto.WorkshopDTO{ID: workshop.ID, DepartmentID: workshop.DepartmentID, Code: workshop.Code, Name: workshop.Name, Factory: workshop.Factory, Description: workshop.Description, Status: workshop.Status}, nil
}

func (s *WorkforceService) DeleteWorkshop(ctx context.Context, id uuid.UUID) error {
	// Cannot delete workshop if active workers exist
	var count int64
	if err := s.workerRepo.(*workforcepersistence.GormWorkerRepository).GetDB().Table("workforce_workers").
		Where("workshop_id = ? AND status = 'active' AND deleted_at IS NULL", id).Count(&count).Error; err == nil && count > 0 {
		return fmt.Errorf("%w: cannot delete workshop with active workers", ErrConflict)
	}

	if _, err := s.orgRepo.FindWorkshopByID(ctx, id); err != nil {
		return ErrNotFound
	}

	return s.orgRepo.DeleteWorkshop(ctx, id)
}

func (s *WorkforceService) ListWorkshops(ctx context.Context, deptID *uuid.UUID) ([]*dto.WorkshopDTO, error) {
	workshops, err := s.orgRepo.ListWorkshops(ctx, deptID)
	if err != nil {
		return nil, err
	}
	dtos := make([]*dto.WorkshopDTO, len(workshops))
	for i, w := range workshops {
		dtos[i] = &dto.WorkshopDTO{ID: w.ID, DepartmentID: w.DepartmentID, Code: w.Code, Name: w.Name, Factory: w.Factory, Description: w.Description, Status: w.Status}
	}
	return dtos, nil
}

func (s *WorkforceService) GetWorkshop(ctx context.Context, id uuid.UUID) (*dto.WorkshopDTO, error) {
	w, err := s.orgRepo.FindWorkshopByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	return &dto.WorkshopDTO{ID: w.ID, DepartmentID: w.DepartmentID, Code: w.Code, Name: w.Name, Factory: w.Factory, Description: w.Description, Status: w.Status}, nil
}

// ─── Team Use Cases ────────────────────────────────────────────────────────────

func (s *WorkforceService) CreateTeam(ctx context.Context, workshopID uuid.UUID, req dto.CreateTeamRequest) (*dto.TeamDTO, error) {
	if _, err := s.orgRepo.FindWorkshopByID(ctx, workshopID); err != nil {
		return nil, ErrNotFound
	}

	var leaderID *uuid.UUID
	if req.LeaderID != nil && *req.LeaderID != "" {
		lid, err := uuid.Parse(*req.LeaderID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid leader_id", ErrValidation)
		}
		leaderID = &lid
	}

	team, err := entity.NewTeam(workshopID, req.Code, req.Name, leaderID, req.Description, req.Status)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}
	if err := s.orgRepo.SaveTeam(ctx, team); err != nil {
		return nil, err
	}

	evt := entity.NewTeamCreatedEvent(team.ID, team.Code)
	_ = s.publishEvents(ctx, []domain.DomainEvent{evt})

	return &dto.TeamDTO{ID: team.ID, WorkshopID: team.WorkshopID, Code: team.Code, Name: team.Name, LeaderID: team.LeaderID, Description: team.Description, Status: team.Status}, nil
}

func (s *WorkforceService) UpdateTeam(ctx context.Context, id uuid.UUID, req dto.UpdateTeamRequest) (*dto.TeamDTO, error) {
	team, err := s.orgRepo.FindTeamByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	var leaderID *uuid.UUID
	if req.LeaderID != nil && *req.LeaderID != "" {
		lid, err := uuid.Parse(*req.LeaderID)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid leader_id", ErrValidation)
		}
		leaderID = &lid
	}

	team.Name = req.Name
	team.LeaderID = leaderID
	team.Description = req.Description
	team.Status = req.Status

	if err := s.orgRepo.SaveTeam(ctx, team); err != nil {
		return nil, err
	}

	return &dto.TeamDTO{ID: team.ID, WorkshopID: team.WorkshopID, Code: team.Code, Name: team.Name, LeaderID: team.LeaderID, Description: team.Description, Status: team.Status}, nil
}

func (s *WorkforceService) DeleteTeam(ctx context.Context, id uuid.UUID) error {
	if _, err := s.orgRepo.FindTeamByID(ctx, id); err != nil {
		return ErrNotFound
	}
	return s.orgRepo.DeleteTeam(ctx, id)
}

func (s *WorkforceService) ListTeams(ctx context.Context, workshopID *uuid.UUID) ([]*dto.TeamDTO, error) {
	teams, err := s.orgRepo.ListTeams(ctx, workshopID)
	if err != nil {
		return nil, err
	}
	dtos := make([]*dto.TeamDTO, len(teams))
	for i, t := range teams {
		dtos[i] = &dto.TeamDTO{ID: t.ID, WorkshopID: t.WorkshopID, Code: t.Code, Name: t.Name, LeaderID: t.LeaderID, Description: t.Description, Status: t.Status}
	}
	return dtos, nil
}

func (s *WorkforceService) GetTeam(ctx context.Context, id uuid.UUID) (*dto.TeamDTO, error) {
	t, err := s.orgRepo.FindTeamByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	return &dto.TeamDTO{ID: t.ID, WorkshopID: t.WorkshopID, Code: t.Code, Name: t.Name, LeaderID: t.LeaderID, Description: t.Description, Status: t.Status}, nil
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

func (s *WorkforceService) publishEvents(ctx context.Context, events []domain.DomainEvent) error {
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

func mapWorkerToDTO(w *entity.Worker) *dto.WorkerDTO {
	d := &dto.WorkerDTO{
		ID:             w.ID,
		UserID:         w.UserID,
		FirstName:      w.FirstName,
		LastName:       w.LastName,
		FullName:       w.GetFullName(),
		Email:          w.Email,
		Phone:          w.Phone,
		EmployeeCode:   w.EmployeeCode,
		EmployeeNumber: w.EmployeeNumber,
		Avatar:         w.Avatar,
		Gender:         w.Gender,
		Birthday:       w.Birthday,
		Address:        w.Address,
		EmploymentDate: w.EmploymentDate,
		DepartmentID:   w.DepartmentID,
		WorkshopID:     w.WorkshopID,
		TeamID:         w.TeamID,
		Position:       w.Position,
		Status:         string(w.Status),
		Availability:   string(w.Availability),
		Notes:          w.Notes,
		CreatedAt:      w.CreatedAt,
		UpdatedAt:      w.UpdatedAt,
	}

	for _, sk := range w.Skills {
		skillName := ""
		skillCode := ""
		if sk.Skill != nil {
			skillName = sk.Skill.Name
			skillCode = sk.Skill.Code
		}
		d.Skills = append(d.Skills, dto.WorkerSkillDTO{
			SkillID:          sk.SkillID,
			SkillName:        skillName,
			SkillCode:        skillCode,
			ProficiencyLevel: sk.ProficiencyLevel,
		})
	}
	return d
}

func mapCertificateToDTO(c *entity.Certificate) *dto.CertificateDTO {
	return &dto.CertificateDTO{
		ID:                c.ID,
		WorkerID:          c.WorkerID,
		Name:              c.Name,
		IssuingAuthority:  c.IssuingAuthority,
		CertificateNumber: c.CertificateNumber,
		IssuedAt:          c.IssuedAt,
		ExpiresAt:         c.ExpiresAt,
		DocumentURL:       c.DocumentURL,
		IsExpired:         c.IsExpired(),
	}
}
