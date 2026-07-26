package model

import (
	"time"

	"github.com/google/uuid"
)

type DepartmentModel struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	Code        string     `gorm:"type:varchar(50);uniqueIndex;not null"`
	Name        string     `gorm:"type:varchar(100);uniqueIndex;not null"`
	Description string     `gorm:"type:varchar(255)"`
	ManagerID   *uuid.UUID `gorm:"type:uuid;index"`
	Status      string     `gorm:"type:varchar(50);not null;default:'active';index"`
	CreatedAt   time.Time  `gorm:"autoCreateTime"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime"`
}

func (DepartmentModel) TableName() string { return "workforce_departments" }

type WorkshopModel struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	DepartmentID uuid.UUID `gorm:"type:uuid;not null;index"`
	Code         string    `gorm:"type:varchar(50);uniqueIndex;not null"`
	Name         string    `gorm:"type:varchar(100);uniqueIndex;not null"`
	Factory      string    `gorm:"type:varchar(100);not null;default:'Main Factory'"`
	Description  string    `gorm:"type:varchar(255)"`
	Status       string    `gorm:"type:varchar(50);not null;default:'active';index"`
	CreatedAt    time.Time `gorm:"autoCreateTime"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime"`
}

func (WorkshopModel) TableName() string { return "workforce_workshops" }

type TeamModel struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	WorkshopID  uuid.UUID  `gorm:"type:uuid;not null;index"`
	Code        string     `gorm:"type:varchar(50);uniqueIndex;not null"`
	Name        string     `gorm:"type:varchar(100);uniqueIndex;not null"`
	LeaderID    *uuid.UUID `gorm:"type:uuid;index"`
	Description string     `gorm:"type:varchar(255)"`
	Status      string     `gorm:"type:varchar(50);not null;default:'active';index"`
	CreatedAt   time.Time  `gorm:"autoCreateTime"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime"`
}

func (TeamModel) TableName() string { return "workforce_teams" }

type WorkerModel struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey"`
	UserID         *uuid.UUID `gorm:"type:uuid;uniqueIndex"`
	FirstName      string     `gorm:"type:varchar(100);not null"`
	LastName       string     `gorm:"type:varchar(100);not null"`
	Email          string     `gorm:"type:varchar(255);uniqueIndex;not null"`
	Phone          string     `gorm:"type:varchar(20)"`
	EmployeeCode   string     `gorm:"type:varchar(50);uniqueIndex;not null"`
	EmployeeNumber string     `gorm:"type:varchar(50);uniqueIndex"`
	Avatar         string     `gorm:"type:varchar(255);not null;default:''"`
	Gender         string     `gorm:"type:varchar(20);not null;default:''"`
	Birthday       *time.Time `gorm:"type:date"`
	Address        string     `gorm:"type:varchar(255);not null;default:''"`
	EmploymentDate *time.Time `gorm:"type:timestamptz"`
	DepartmentID   *uuid.UUID `gorm:"type:uuid;index"`
	WorkshopID     *uuid.UUID `gorm:"type:uuid;index"`
	TeamID         *uuid.UUID `gorm:"type:uuid;index"`
	Position       string     `gorm:"type:varchar(100);not null;default:''"`
	Status         string     `gorm:"type:varchar(50);not null;default:'active';index"`
	Availability   string     `gorm:"type:varchar(50);not null;default:'available';index"`
	Notes          string     `gorm:"type:text;not null;default:''"`
	CreatedAt      time.Time  `gorm:"autoCreateTime"`
	UpdatedAt      time.Time  `gorm:"autoUpdateTime"`
	DeletedAt      *time.Time `gorm:"index"`

	// Associations
	Skills       []SkillMatrixModel `gorm:"foreignKey:WorkerID"`
	Certificates []CertificateModel `gorm:"foreignKey:WorkerID"`
}

func (WorkerModel) TableName() string { return "workforce_workers" }

type SkillModel struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	Name        string    `gorm:"type:varchar(100);uniqueIndex;not null"`
	Code        string    `gorm:"type:varchar(50);uniqueIndex;not null"`
	Description string    `gorm:"type:varchar(255)"`
	CreatedAt   time.Time `gorm:"autoCreateTime"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime"`
}

func (SkillModel) TableName() string { return "workforce_skills" }

type SkillMatrixModel struct {
	WorkerID         uuid.UUID  `gorm:"type:uuid;primaryKey"`
	SkillID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	ProficiencyLevel int        `gorm:"type:integer;not null;default:1"`
	UpdatedAt        time.Time  `gorm:"autoUpdateTime"`
	Skill            SkillModel `gorm:"foreignKey:SkillID"`
}

func (SkillMatrixModel) TableName() string { return "workforce_skill_matrix" }

type CertificateModel struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey"`
	WorkerID          uuid.UUID `gorm:"type:uuid;not null;index"`
	Name              string    `gorm:"type:varchar(100);not null"`
	IssuingAuthority  string    `gorm:"type:varchar(100);not null"`
	CertificateNumber string    `gorm:"type:varchar(100);uniqueIndex;not null"`
	IssuedAt          time.Time `gorm:"not null"`
	ExpiresAt         time.Time `gorm:"not null;index"`
	DocumentURL       string    `gorm:"type:varchar(255)"`
	CreatedAt         time.Time `gorm:"autoCreateTime"`
	UpdatedAt         time.Time `gorm:"autoUpdateTime"`
}

func (CertificateModel) TableName() string { return "workforce_certificates" }

type OutboxEventModel struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	EventName   string     `gorm:"type:varchar(255);not null;index"`
	RoutingKey  string     `gorm:"type:varchar(255);not null"`
	Payload     []byte     `gorm:"type:jsonb;not null"`
	Status      string     `gorm:"type:varchar(50);not null;default:'pending';index"`
	RetryCount  int        `gorm:"not null;default:0"`
	Error       string     `gorm:"type:text"`
	PublishedAt *time.Time `gorm:"index"`
	CreatedAt   time.Time  `gorm:"autoCreateTime;index"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime"`
}

func (OutboxEventModel) TableName() string { return "workforce_outbox_events" }
