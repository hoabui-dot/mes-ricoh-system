package entity

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// WorkerStatus represents the employment state of a worker.
type WorkerStatus string

const (
	WorkerStatusActive     WorkerStatus = "active"
	WorkerStatusProbation  WorkerStatus = "probation"
	WorkerStatusSuspended  WorkerStatus = "suspended"
	WorkerStatusResigned   WorkerStatus = "resigned"
	WorkerStatusRetired    WorkerStatus = "retired"
	WorkerStatusInactive   WorkerStatus = "inactive"
	WorkerStatusTerminated WorkerStatus = "terminated"
)

// WorkerAvailability represents the availability state of a worker for assignments.
type WorkerAvailability string

const (
	WorkerAvailabilityAvailable WorkerAvailability = "available"
	WorkerAvailabilityBusy      WorkerAvailability = "busy"
	WorkerAvailabilityOnLeave   WorkerAvailability = "on_leave"
	WorkerAvailabilitySickLeave WorkerAvailability = "sick_leave"
	WorkerAvailabilityTraining  WorkerAvailability = "training"
	WorkerAvailabilityOvertime  WorkerAvailability = "overtime"
	WorkerAvailabilityOffline   WorkerAvailability = "offline"
	WorkerAvailabilitySuspended WorkerAvailability = "suspended"
)

// ─── Department ──────────────────────────────────────────────────────────────

type Department struct {
	domain.BaseEntity
	Code        string
	Name        string
	Description string
	ManagerID   *uuid.UUID
	Status      string
}

func NewDepartment(code, name, description string, managerID *uuid.UUID, status string) (*Department, error) {
	if strings.TrimSpace(code) == "" {
		return nil, errors.New("department code is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("department name is required")
	}
	if status == "" {
		status = "active"
	}
	return &Department{
		BaseEntity:  domain.NewBaseEntity(),
		Code:        strings.ToUpper(strings.TrimSpace(code)),
		Name:        strings.TrimSpace(name),
		Description: description,
		ManagerID:   managerID,
		Status:      status,
	}, nil
}

// ─── Workshop ────────────────────────────────────────────────────────────────

type Workshop struct {
	domain.BaseEntity
	DepartmentID uuid.UUID
	Code         string
	Name         string
	Factory      string
	Description  string
	Status       string
}

func NewWorkshop(deptID uuid.UUID, code, name, factory, description, status string) (*Workshop, error) {
	if strings.TrimSpace(code) == "" {
		return nil, errors.New("workshop code is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("workshop name is required")
	}
	if factory == "" {
		factory = "Main Factory"
	}
	if status == "" {
		status = "active"
	}
	return &Workshop{
		BaseEntity:   domain.NewBaseEntity(),
		DepartmentID: deptID,
		Code:         strings.ToUpper(strings.TrimSpace(code)),
		Name:         strings.TrimSpace(name),
		Factory:      factory,
		Description:  description,
		Status:       status,
	}, nil
}

// ─── Team ────────────────────────────────────────────────────────────────────

type Team struct {
	domain.BaseEntity
	WorkshopID  uuid.UUID
	Code        string
	Name        string
	LeaderID    *uuid.UUID
	Description string
	Status      string
}

func NewTeam(workshopID uuid.UUID, code, name string, leaderID *uuid.UUID, description, status string) (*Team, error) {
	if strings.TrimSpace(code) == "" {
		return nil, errors.New("team code is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("team name is required")
	}
	if status == "" {
		status = "active"
	}
	return &Team{
		BaseEntity:  domain.NewBaseEntity(),
		WorkshopID:  workshopID,
		Code:        strings.ToUpper(strings.TrimSpace(code)),
		Name:        strings.TrimSpace(name),
		LeaderID:    leaderID,
		Description: description,
		Status:      status,
	}, nil
}

// ─── Skill ───────────────────────────────────────────────────────────────────

type Skill struct {
	domain.BaseEntity
	Name        string
	Code        string
	Description string
}

func NewSkill(name, code, description string) (*Skill, error) {
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("skill name is required")
	}
	if strings.TrimSpace(code) == "" {
		return nil, errors.New("skill code is required")
	}
	return &Skill{
		BaseEntity:  domain.NewBaseEntity(),
		Name:        strings.TrimSpace(name),
		Code:        strings.ToUpper(strings.TrimSpace(code)),
		Description: description,
	}, nil
}

// ─── Certificate ─────────────────────────────────────────────────────────────

type Certificate struct {
	domain.BaseEntity
	WorkerID          uuid.UUID
	Name              string
	IssuingAuthority  string
	CertificateNumber string
	IssuedAt          time.Time
	ExpiresAt         time.Time
	DocumentURL       string
}

func NewCertificate(workerID uuid.UUID, name, authority, certNum string, issued, expires time.Time, docURL string) (*Certificate, error) {
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("certificate name is required")
	}
	if strings.TrimSpace(authority) == "" {
		return nil, errors.New("issuing authority is required")
	}
	if strings.TrimSpace(certNum) == "" {
		return nil, errors.New("certificate number is required")
	}
	if expires.Before(issued) {
		return nil, errors.New("expiry date cannot be before issued date")
	}
	return &Certificate{
		BaseEntity:        domain.NewBaseEntity(),
		WorkerID:          workerID,
		Name:              strings.TrimSpace(name),
		IssuingAuthority:  strings.TrimSpace(authority),
		CertificateNumber: strings.TrimSpace(certNum),
		IssuedAt:          issued,
		ExpiresAt:         expires,
		DocumentURL:       docURL,
	}, nil
}

// IsExpired checks if the certificate is expired.
func (c *Certificate) IsExpired() bool {
	return time.Now().UTC().After(c.ExpiresAt)
}

// ─── Worker Skill (Proficiency) ──────────────────────────────────────────────

type WorkerSkill struct {
	SkillID          uuid.UUID
	Skill            *Skill
	ProficiencyLevel int // 1 to 4
}

// ─── Worker (Aggregate Root) ──────────────────────────────────────────────────

type Worker struct {
	domain.AggregateRoot
	UserID         *uuid.UUID // Optional link to identity_users
	FirstName      string
	LastName       string
	Email          string
	Phone          string
	EmployeeCode   string
	EmployeeNumber string
	Avatar         string
	Gender         string
	Birthday       *time.Time
	Address        string
	EmploymentDate *time.Time
	DepartmentID   *uuid.UUID
	WorkshopID     *uuid.UUID
	TeamID         *uuid.UUID
	Position       string
	Status         WorkerStatus
	Availability   WorkerAvailability
	Notes          string
	Skills         []WorkerSkill
	Certificates   []Certificate
}

func NewWorker(
	userID *uuid.UUID,
	firstName, lastName, email, phone, empCode, empNum, avatar, gender string,
	birthday *time.Time,
	address string,
	employmentDate *time.Time,
	deptID, workshopID, teamID *uuid.UUID,
	position, notes string,
) (*Worker, error) {
	if strings.TrimSpace(firstName) == "" {
		return nil, errors.New("first name is required")
	}
	if strings.TrimSpace(lastName) == "" {
		return nil, errors.New("last name is required")
	}
	if strings.TrimSpace(email) == "" {
		return nil, errors.New("email is required")
	}
	if strings.TrimSpace(empCode) == "" {
		return nil, errors.New("employee code is required")
	}

	w := &Worker{
		AggregateRoot:  domain.AggregateRoot{},
		UserID:         userID,
		FirstName:      strings.TrimSpace(firstName),
		LastName:       strings.TrimSpace(lastName),
		Email:          strings.ToLower(strings.TrimSpace(email)),
		Phone:          strings.TrimSpace(phone),
		EmployeeCode:   strings.ToUpper(strings.TrimSpace(empCode)),
		EmployeeNumber: strings.TrimSpace(empNum),
		Avatar:         avatar,
		Gender:         gender,
		Birthday:       birthday,
		Address:        address,
		EmploymentDate: employmentDate,
		DepartmentID:   deptID,
		WorkshopID:     workshopID,
		TeamID:         teamID,
		Position:       position,
		Status:         WorkerStatusActive,
		Availability:   WorkerAvailabilityAvailable,
		Notes:          notes,
	}
	w.BaseEntity = domain.NewBaseEntity()

	w.RecordEvent(NewWorkerCreatedEvent(w.ID, w.EmployeeCode, w.Email))
	return w, nil
}

// UpdateSkills updates the worker's skills proficiency mapping.
func (w *Worker) UpdateSkills(skills []WorkerSkill) error {
	for _, s := range skills {
		if s.ProficiencyLevel < 1 || s.ProficiencyLevel > 4 {
			return errors.New("proficiency level must be between 1 and 4")
		}
	}
	w.Skills = skills
	w.Touch()

	skillDTOs := make([]WorkerSkillEventData, len(skills))
	for i, s := range skills {
		skillDTOs[i] = WorkerSkillEventData{
			SkillID:          s.SkillID,
			ProficiencyLevel: s.ProficiencyLevel,
		}
	}
	w.RecordEvent(NewWorkerSkillsUpdatedEvent(w.ID, skillDTOs))
	return nil
}

// AddCertificate adds a certificate to the worker.
func (w *Worker) AddCertificate(cert Certificate) {
	w.Certificates = append(w.Certificates, cert)
	w.Touch()
	w.RecordEvent(NewCertificateAddedEvent(w.ID, cert.ID, cert.Name, cert.ExpiresAt))
}

// UpdateAvailability sets the availability status of the worker.
func (w *Worker) UpdateAvailability(availability WorkerAvailability) error {
	switch availability {
	case WorkerAvailabilityAvailable, WorkerAvailabilityBusy, WorkerAvailabilityOnLeave,
		WorkerAvailabilitySickLeave, WorkerAvailabilityTraining, WorkerAvailabilityOvertime,
		WorkerAvailabilityOffline, WorkerAvailabilitySuspended:
		w.Availability = availability
		w.Touch()
		w.RecordEvent(NewWorkerAvailabilityChangedEvent(w.ID, string(availability)))
		return nil
	default:
		return errors.New("invalid availability status")
	}
}

// UpdateStatus sets the employment status of the worker.
func (w *Worker) UpdateStatus(status WorkerStatus) error {
	switch status {
	case WorkerStatusActive, WorkerStatusProbation, WorkerStatusSuspended,
		WorkerStatusResigned, WorkerStatusRetired, WorkerStatusInactive, WorkerStatusTerminated:
		w.Status = status
		w.Touch()
		return nil
	default:
		return errors.New("invalid employment status")
	}
}

// GetFullName returns the combined first and last name.
func (w *Worker) GetFullName() string {
	return w.FirstName + " " + w.LastName
}
