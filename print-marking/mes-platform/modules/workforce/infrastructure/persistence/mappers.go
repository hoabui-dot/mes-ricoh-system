package persistence

import (
	"github.com/nd/mes-platform/modules/workforce/domain/entity"
	"github.com/nd/mes-platform/modules/workforce/infrastructure/model"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Model → Entity Mappers ───────────────────────────────────────────────────

func modelToDepartment(m *model.DepartmentModel) *entity.Department {
	d := &entity.Department{
		Code:        m.Code,
		Name:        m.Name,
		Description: m.Description,
		ManagerID:   m.ManagerID,
		Status:      m.Status,
	}
	d.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return d
}

func modelToWorkshop(m *model.WorkshopModel) *entity.Workshop {
	w := &entity.Workshop{
		DepartmentID: m.DepartmentID,
		Code:         m.Code,
		Name:         m.Name,
		Factory:      m.Factory,
		Description:  m.Description,
		Status:       m.Status,
	}
	w.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return w
}

func modelToTeam(m *model.TeamModel) *entity.Team {
	t := &entity.Team{
		WorkshopID:  m.WorkshopID,
		Code:        m.Code,
		Name:        m.Name,
		LeaderID:    m.LeaderID,
		Description: m.Description,
		Status:      m.Status,
	}
	t.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return t
}

func modelToSkill(m *model.SkillModel) *entity.Skill {
	s := &entity.Skill{
		Name:        m.Name,
		Code:        m.Code,
		Description: m.Description,
	}
	s.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return s
}

func modelToCertificate(m *model.CertificateModel) *entity.Certificate {
	c := &entity.Certificate{
		WorkerID:          m.WorkerID,
		Name:              m.Name,
		IssuingAuthority:  m.IssuingAuthority,
		CertificateNumber: m.CertificateNumber,
		IssuedAt:          m.IssuedAt,
		ExpiresAt:         m.ExpiresAt,
		DocumentURL:       m.DocumentURL,
	}
	c.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return c
}

func modelToWorker(m *model.WorkerModel) *entity.Worker {
	w := &entity.Worker{
		UserID:         m.UserID,
		FirstName:      m.FirstName,
		LastName:       m.LastName,
		Email:          m.Email,
		Phone:          m.Phone,
		EmployeeCode:   m.EmployeeCode,
		EmployeeNumber: m.EmployeeNumber,
		Avatar:         m.Avatar,
		Gender:         m.Gender,
		Birthday:       m.Birthday,
		Address:        m.Address,
		EmploymentDate: m.EmploymentDate,
		DepartmentID:   m.DepartmentID,
		WorkshopID:     m.WorkshopID,
		TeamID:         m.TeamID,
		Position:       m.Position,
		Status:         entity.WorkerStatus(m.Status),
		Availability:   entity.WorkerAvailability(m.Availability),
		Notes:          m.Notes,
	}
	w.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
		DeletedAt: m.DeletedAt,
	}

	for _, sk := range m.Skills {
		w.Skills = append(w.Skills, entity.WorkerSkill{
			SkillID:          sk.SkillID,
			Skill:            modelToSkill(&sk.Skill),
			ProficiencyLevel: sk.ProficiencyLevel,
		})
	}

	for _, c := range m.Certificates {
		w.Certificates = append(w.Certificates, *modelToCertificate(&c))
	}

	return w
}

// ─── Entity → Model Mappers ───────────────────────────────────────────────────

func departmentToModel(e *entity.Department) *model.DepartmentModel {
	return &model.DepartmentModel{
		ID:          e.ID,
		Code:        e.Code,
		Name:        e.Name,
		Description: e.Description,
		ManagerID:   e.ManagerID,
		Status:      e.Status,
		CreatedAt:   e.CreatedAt,
		UpdatedAt:   e.UpdatedAt,
	}
}

func workshopToModel(e *entity.Workshop) *model.WorkshopModel {
	return &model.WorkshopModel{
		ID:           e.ID,
		DepartmentID: e.DepartmentID,
		Code:         e.Code,
		Name:         e.Name,
		Factory:      e.Factory,
		Description:  e.Description,
		Status:       e.Status,
		CreatedAt:    e.CreatedAt,
		UpdatedAt:    e.UpdatedAt,
	}
}

func teamToModel(e *entity.Team) *model.TeamModel {
	return &model.TeamModel{
		ID:          e.ID,
		WorkshopID:  e.WorkshopID,
		Code:        e.Code,
		Name:        e.Name,
		LeaderID:    e.LeaderID,
		Description: e.Description,
		Status:      e.Status,
		CreatedAt:   e.CreatedAt,
		UpdatedAt:   e.UpdatedAt,
	}
}

func skillToModel(e *entity.Skill) *model.SkillModel {
	return &model.SkillModel{
		ID:          e.ID,
		Name:        e.Name,
		Code:        e.Code,
		Description: e.Description,
		CreatedAt:   e.CreatedAt,
		UpdatedAt:   e.UpdatedAt,
	}
}

func certificateToModel(e *entity.Certificate) *model.CertificateModel {
	return &model.CertificateModel{
		ID:                e.ID,
		WorkerID:          e.WorkerID,
		Name:              e.Name,
		IssuingAuthority:  e.IssuingAuthority,
		CertificateNumber: e.CertificateNumber,
		IssuedAt:          e.IssuedAt,
		ExpiresAt:         e.ExpiresAt,
		DocumentURL:       e.DocumentURL,
		CreatedAt:         e.CreatedAt,
		UpdatedAt:         e.UpdatedAt,
	}
}

func workerToModel(e *entity.Worker) *model.WorkerModel {
	m := &model.WorkerModel{
		ID:             e.ID,
		UserID:         e.UserID,
		FirstName:      e.FirstName,
		LastName:       e.LastName,
		Email:          e.Email,
		Phone:          e.Phone,
		EmployeeCode:   e.EmployeeCode,
		EmployeeNumber: e.EmployeeNumber,
		Avatar:         e.Avatar,
		Gender:         e.Gender,
		Birthday:       e.Birthday,
		Address:        e.Address,
		EmploymentDate: e.EmploymentDate,
		DepartmentID:   e.DepartmentID,
		WorkshopID:     e.WorkshopID,
		TeamID:         e.TeamID,
		Position:       e.Position,
		Status:         string(e.Status),
		Availability:   string(e.Availability),
		Notes:          e.Notes,
		CreatedAt:      e.CreatedAt,
		UpdatedAt:      e.UpdatedAt,
		DeletedAt:      e.DeletedAt,
	}

	for _, sk := range e.Skills {
		m.Skills = append(m.Skills, model.SkillMatrixModel{
			WorkerID:         e.ID,
			SkillID:          sk.SkillID,
			ProficiencyLevel: sk.ProficiencyLevel,
		})
	}

	for _, cert := range e.Certificates {
		m.Certificates = append(m.Certificates, *certificateToModel(&cert))
	}

	return m
}
