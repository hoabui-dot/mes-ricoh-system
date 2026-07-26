package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Domain Events ────────────────────────────────────────────────────────────
// All workforce domain events follow the naming convention: mes.workforce.<EventName>

type WorkerCreatedEvent struct {
	domain.BaseDomainEvent
	WorkerID     uuid.UUID `json:"worker_id"`
	EmployeeCode string    `json:"employee_code"`
	Email        string    `json:"email"`
}

func NewWorkerCreatedEvent(workerID uuid.UUID, code, email string) WorkerCreatedEvent {
	return WorkerCreatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkerCreated"),
		WorkerID:        workerID,
		EmployeeCode:    code,
		Email:           email,
	}
}

type WorkerUpdatedEvent struct {
	domain.BaseDomainEvent
	WorkerID     uuid.UUID `json:"worker_id"`
	EmployeeCode string    `json:"employee_code"`
}

func NewWorkerUpdatedEvent(workerID uuid.UUID, code string) WorkerUpdatedEvent {
	return WorkerUpdatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkerUpdated"),
		WorkerID:        workerID,
		EmployeeCode:    code,
	}
}

type WorkerDeletedEvent struct {
	domain.BaseDomainEvent
	WorkerID uuid.UUID `json:"worker_id"`
}

func NewWorkerDeletedEvent(workerID uuid.UUID) WorkerDeletedEvent {
	return WorkerDeletedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkerDeleted"),
		WorkerID:        workerID,
	}
}

type WorkerRestoredEvent struct {
	domain.BaseDomainEvent
	WorkerID uuid.UUID `json:"worker_id"`
}

func NewWorkerRestoredEvent(workerID uuid.UUID) WorkerRestoredEvent {
	return WorkerRestoredEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkerRestored"),
		WorkerID:        workerID,
	}
}

type WorkerSkillEventData struct {
	SkillID          uuid.UUID `json:"skill_id"`
	ProficiencyLevel int       `json:"proficiency_level"`
}

type WorkerSkillsUpdatedEvent struct {
	domain.BaseDomainEvent
	WorkerID uuid.UUID              `json:"worker_id"`
	Skills   []WorkerSkillEventData `json:"skills"`
}

func NewWorkerSkillsUpdatedEvent(workerID uuid.UUID, skills []WorkerSkillEventData) WorkerSkillsUpdatedEvent {
	return WorkerSkillsUpdatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkerSkillsUpdated"),
		WorkerID:        workerID,
		Skills:          skills,
	}
}

type WorkerAvailabilityChangedEvent struct {
	domain.BaseDomainEvent
	WorkerID     uuid.UUID `json:"worker_id"`
	Availability string    `json:"availability"`
}

func NewWorkerAvailabilityChangedEvent(workerID uuid.UUID, availability string) WorkerAvailabilityChangedEvent {
	return WorkerAvailabilityChangedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkerAvailabilityChanged"),
		WorkerID:        workerID,
		Availability:    availability,
	}
}

type CertificateAddedEvent struct {
	domain.BaseDomainEvent
	WorkerID      uuid.UUID `json:"worker_id"`
	CertificateID uuid.UUID `json:"certificate_id"`
	Name          string    `json:"name"`
	ExpiresAt     time.Time `json:"expires_at"`
}

func NewCertificateAddedEvent(workerID, certID uuid.UUID, name string, expires time.Time) CertificateAddedEvent {
	return CertificateAddedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.CertificateAdded"),
		WorkerID:        workerID,
		CertificateID:   certID,
		Name:            name,
		ExpiresAt:       expires,
	}
}

type WorkerSkillAssignedEvent struct {
	domain.BaseDomainEvent
	WorkerID uuid.UUID `json:"worker_id"`
	SkillID  uuid.UUID `json:"skill_id"`
}

func NewWorkerSkillAssignedEvent(workerID, skillID uuid.UUID) WorkerSkillAssignedEvent {
	return WorkerSkillAssignedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkerSkillAssigned"),
		WorkerID:        workerID,
		SkillID:         skillID,
	}
}

type WorkerSkillRemovedEvent struct {
	domain.BaseDomainEvent
	WorkerID uuid.UUID `json:"worker_id"`
	SkillID  uuid.UUID `json:"skill_id"`
}

func NewWorkerSkillRemovedEvent(workerID, skillID uuid.UUID) WorkerSkillRemovedEvent {
	return WorkerSkillRemovedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkerSkillRemoved"),
		WorkerID:        workerID,
		SkillID:         skillID,
	}
}

type WorkerCertificationAssignedEvent struct {
	domain.BaseDomainEvent
	WorkerID      uuid.UUID `json:"worker_id"`
	CertificateID uuid.UUID `json:"certificate_id"`
}

func NewWorkerCertificationAssignedEvent(workerID, certID uuid.UUID) WorkerCertificationAssignedEvent {
	return WorkerCertificationAssignedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkerCertificationAssigned"),
		WorkerID:        workerID,
		CertificateID:   certID,
	}
}

type WorkerCertificationExpiredEvent struct {
	domain.BaseDomainEvent
	WorkerID      uuid.UUID `json:"worker_id"`
	CertificateID uuid.UUID `json:"certificate_id"`
}

func NewWorkerCertificationExpiredEvent(workerID, certID uuid.UUID) WorkerCertificationExpiredEvent {
	return WorkerCertificationExpiredEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkerCertificationExpired"),
		WorkerID:        workerID,
		CertificateID:   certID,
	}
}

type DepartmentCreatedEvent struct {
	domain.BaseDomainEvent
	DepartmentID uuid.UUID `json:"department_id"`
	Code         string    `json:"code"`
}

func NewDepartmentCreatedEvent(deptID uuid.UUID, code string) DepartmentCreatedEvent {
	return DepartmentCreatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.DepartmentCreated"),
		DepartmentID:    deptID,
		Code:            code,
	}
}

type WorkshopCreatedEvent struct {
	domain.BaseDomainEvent
	WorkshopID uuid.UUID `json:"workshop_id"`
	Code       string    `json:"code"`
}

func NewWorkshopCreatedEvent(wsID uuid.UUID, code string) WorkshopCreatedEvent {
	return WorkshopCreatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.WorkshopCreated"),
		WorkshopID:      wsID,
		Code:            code,
	}
}

type TeamCreatedEvent struct {
	domain.BaseDomainEvent
	TeamID uuid.UUID `json:"team_id"`
	Code   string    `json:"code"`
}

func NewTeamCreatedEvent(teamID uuid.UUID, code string) TeamCreatedEvent {
	return TeamCreatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.workforce.TeamCreated"),
		TeamID:          teamID,
		Code:            code,
	}
}
