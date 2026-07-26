package dto

import (
	"time"

	"github.com/google/uuid"
)

// ─── Worker DTOs ──────────────────────────────────────────────────────────────

type CreateWorkerRequest struct {
	UserID         *string `json:"user_id" binding:"omitempty,uuid"`
	FirstName      string  `json:"first_name" binding:"required,min=1,max=100"`
	LastName       string  `json:"last_name" binding:"required,min=1,max=100"`
	Email          string  `json:"email" binding:"required,email"`
	Phone          string  `json:"phone" binding:"max=20"`
	EmployeeCode   string  `json:"employee_code" binding:"required,min=2,max=50"`
	EmployeeNumber string  `json:"employee_number" binding:"omitempty,max=50"`
	Avatar         string  `json:"avatar" binding:"max=255"`
	Gender         string  `json:"gender" binding:"max=20"`
	Birthday       *string `json:"birthday" binding:"omitempty,datetime=2006-01-02"`
	Address        string  `json:"address" binding:"max=255"`
	EmploymentDate *string `json:"employment_date" binding:"omitempty,datetime=2006-01-02T15:04:05Z07:00"`
	DepartmentID   *string `json:"department_id" binding:"omitempty,uuid"`
	WorkshopID     *string `json:"workshop_id" binding:"omitempty,uuid"`
	TeamID         *string `json:"team_id" binding:"omitempty,uuid"`
	Position       string  `json:"position" binding:"max=100"`
	Notes          string  `json:"notes" binding:"max=1000"`
}

type UpdateWorkerRequest struct {
	FirstName      string  `json:"first_name" binding:"required,min=1,max=100"`
	LastName       string  `json:"last_name" binding:"required,min=1,max=100"`
	Phone          string  `json:"phone" binding:"max=20"`
	EmployeeNumber string  `json:"employee_number" binding:"omitempty,max=50"`
	Avatar         string  `json:"avatar" binding:"max=255"`
	Gender         string  `json:"gender" binding:"max=20"`
	Birthday       *string `json:"birthday" binding:"omitempty,datetime=2006-01-02"`
	Address        string  `json:"address" binding:"max=255"`
	EmploymentDate *string `json:"employment_date" binding:"omitempty,datetime=2006-01-02T15:04:05Z07:00"`
	DepartmentID   *string `json:"department_id" binding:"omitempty,uuid"`
	WorkshopID     *string `json:"workshop_id" binding:"omitempty,uuid"`
	TeamID         *string `json:"team_id" binding:"omitempty,uuid"`
	Position       string  `json:"position" binding:"max=100"`
	Status         string  `json:"status" binding:"required,oneof=active probation suspended resigned retired inactive terminated"`
	Notes          string  `json:"notes" binding:"max=1000"`
}

type UpdateAvailabilityRequest struct {
	Availability string `json:"availability" binding:"required,oneof=available busy on_leave sick_leave training overtime offline suspended"`
}

type WorkerDTO struct {
	ID             uuid.UUID        `json:"id"`
	UserID         *uuid.UUID       `json:"user_id,omitempty"`
	FirstName      string           `json:"first_name"`
	LastName       string           `json:"last_name"`
	FullName       string           `json:"full_name"`
	Email          string           `json:"email"`
	Phone          string           `json:"phone"`
	EmployeeCode   string           `json:"employee_code"`
	EmployeeNumber string           `json:"employee_number"`
	Avatar         string           `json:"avatar"`
	Gender         string           `json:"gender"`
	Birthday       *time.Time       `json:"birthday,omitempty"`
	Address        string           `json:"address"`
	EmploymentDate *time.Time       `json:"employment_date,omitempty"`
	DepartmentID   *uuid.UUID       `json:"department_id,omitempty"`
	WorkshopID     *uuid.UUID       `json:"workshop_id,omitempty"`
	TeamID         *uuid.UUID       `json:"team_id,omitempty"`
	Position       string           `json:"position"`
	Status         string           `json:"status"`
	Availability   string           `json:"availability"`
	Notes          string           `json:"notes"`
	Skills         []WorkerSkillDTO `json:"skills,omitempty"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
}

type WorkerSkillDTO struct {
	SkillID          uuid.UUID `json:"skill_id"`
	SkillName        string    `json:"skill_name"`
	SkillCode        string    `json:"skill_code"`
	ProficiencyLevel int       `json:"proficiency_level"`
}

// ─── Skill DTOs ───────────────────────────────────────────────────────────────

type CreateSkillRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=100"`
	Code        string `json:"code" binding:"required,min=2,max=50"`
	Description string `json:"description" binding:"max=255"`
}

type UpdateSkillRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=100"`
	Description string `json:"description" binding:"max=255"`
}

type SkillDTO struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Code        string    `json:"code"`
	Description string    `json:"description"`
}

type SkillMatrixItem struct {
	SkillID          string `json:"skill_id" binding:"required,uuid"`
	ProficiencyLevel int    `json:"proficiency_level" binding:"required,min=1,max=4"`
}

type UpdateSkillsRequest struct {
	Skills []SkillMatrixItem `json:"skills" binding:"required,dive"`
}

// ─── Certificate DTOs ─────────────────────────────────────────────────────────

type AddCertificateRequest struct {
	Name              string `json:"name" binding:"required,min=2,max=100"`
	IssuingAuthority  string `json:"issuing_authority" binding:"required,min=2,max=100"`
	CertificateNumber string `json:"certificate_number" binding:"required,min=2,max=100"`
	IssuedAt          string `json:"issued_at" binding:"required,datetime=2006-01-02T15:04:05Z"`
	ExpiresAt         string `json:"expires_at" binding:"required,datetime=2006-01-02T15:04:05Z"`
	DocumentURL       string `json:"document_url" binding:"omitempty,url"`
}

type CertificateDTO struct {
	ID                uuid.UUID `json:"id"`
	WorkerID          uuid.UUID `json:"worker_id"`
	Name              string    `json:"name"`
	IssuingAuthority  string    `json:"issuing_authority"`
	CertificateNumber string    `json:"certificate_number"`
	IssuedAt          time.Time `json:"issued_at"`
	ExpiresAt         time.Time `json:"expires_at"`
	DocumentURL       string    `json:"document_url"`
	IsExpired         bool      `json:"is_expired"`
}

// ─── Org DTOs ─────────────────────────────────────────────────────────────────

type CreateDepartmentRequest struct {
	Code        string  `json:"code" binding:"required,min=2,max=50"`
	Name        string  `json:"name" binding:"required,min=1,max=100"`
	Description string  `json:"description" binding:"max=255"`
	ManagerID   *string `json:"manager_id" binding:"omitempty,uuid"`
	Status      string  `json:"status" binding:"omitempty,oneof=active inactive"`
}

type UpdateDepartmentRequest struct {
	Name        string  `json:"name" binding:"required,min=1,max=100"`
	Description string  `json:"description" binding:"max=255"`
	ManagerID   *string `json:"manager_id" binding:"omitempty,uuid"`
	Status      string  `json:"status" binding:"required,oneof=active inactive"`
}

type DepartmentDTO struct {
	ID          uuid.UUID  `json:"id"`
	Code        string     `json:"code"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	ManagerID   *uuid.UUID `json:"manager_id,omitempty"`
	Status      string     `json:"status"`
}

type CreateWorkshopRequest struct {
	Code         string `json:"code" binding:"required,min=2,max=50"`
	Name         string `json:"name" binding:"required,min=1,max=100"`
	Factory      string `json:"factory" binding:"omitempty,max=100"`
	Description  string `json:"description" binding:"max=255"`
	Status       string `json:"status" binding:"omitempty,oneof=active inactive"`
}

type UpdateWorkshopRequest struct {
	Name         string `json:"name" binding:"required,min=1,max=100"`
	Factory      string `json:"factory" binding:"omitempty,max=100"`
	Description  string `json:"description" binding:"max=255"`
	Status       string `json:"status" binding:"required,oneof=active inactive"`
}

type WorkshopDTO struct {
	ID           uuid.UUID `json:"id"`
	DepartmentID uuid.UUID `json:"department_id"`
	Code         string    `json:"code"`
	Name         string    `json:"name"`
	Factory      string    `json:"factory"`
	Description  string    `json:"description"`
	Status       string    `json:"status"`
}

type CreateTeamRequest struct {
	Code        string  `json:"code" binding:"required,min=2,max=50"`
	Name        string  `json:"name" binding:"required,min=1,max=100"`
	LeaderID    *string `json:"leader_id" binding:"omitempty,uuid"`
	Description string  `json:"description" binding:"max=255"`
	Status      string  `json:"status" binding:"omitempty,oneof=active inactive"`
}

type UpdateTeamRequest struct {
	Name        string  `json:"name" binding:"required,min=1,max=100"`
	LeaderID    *string `json:"leader_id" binding:"omitempty,uuid"`
	Description string  `json:"description" binding:"max=255"`
	Status      string  `json:"status" binding:"required,oneof=active inactive"`
}

type TeamDTO struct {
	ID          uuid.UUID  `json:"id"`
	WorkshopID  uuid.UUID  `json:"workshop_id"`
	Code        string     `json:"code"`
	Name        string     `json:"name"`
	LeaderID    *uuid.UUID `json:"leader_id,omitempty"`
	Description string     `json:"description"`
	Status      string     `json:"status"`
}
