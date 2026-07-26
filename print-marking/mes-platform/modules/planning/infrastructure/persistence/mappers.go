package persistence

import (
	"github.com/nd/mes-platform/modules/planning/domain/entity"
	"github.com/nd/mes-platform/modules/planning/infrastructure/model"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Model → Entity Mappers ───────────────────────────────────────────────────

func modelToShiftTemplate(m *model.ShiftTemplateModel) *entity.ShiftTemplate {
	t := &entity.ShiftTemplate{
		Code:         m.Code,
		Name:         m.Name,
		Description:  m.Description,
		StartTime:    m.StartTime,
		EndTime:      m.EndTime,
		BreakStart:   m.BreakStart,
		BreakEnd:     m.BreakEnd,
		WorkingHours: m.WorkingHours,
		CrossDay:     m.CrossDay,
		Color:        m.Color,
		Status:       m.Status,
	}
	t.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return t
}

func modelToShift(m *model.ShiftModel) *entity.Shift {
	s := &entity.Shift{
		ShiftTemplateID: m.ShiftTemplateID,
		Date:            m.Date,
	}
	s.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	if m.ShiftTemplate.ID != [16]byte{} {
		s.ShiftTemplate = modelToShiftTemplate(&m.ShiftTemplate)
	}

	for _, t := range m.Teams {
		s.Teams = append(s.Teams, entity.TeamAssignment{
			ID:        t.ID,
			ShiftID:   t.ShiftID,
			TeamID:    t.TeamID,
			CreatedAt: t.CreatedAt,
		})
	}
	for _, w := range m.Workers {
		s.Workers = append(s.Workers, entity.WorkerAssignment{
			ID:        w.ID,
			ShiftID:   w.ShiftID,
			WorkerID:  w.WorkerID,
			Role:      w.Role,
			CreatedAt: w.CreatedAt,
		})
	}

	return s
}

func modelToHoliday(m *model.HolidayModel) *entity.Holiday {
	h := &entity.Holiday{
		Date:        m.Date,
		Name:        m.Name,
		Description: m.Description,
	}
	h.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return h
}

func modelToLeave(m *model.LeaveModel) *entity.Leave {
	l := &entity.Leave{
		WorkerID:   m.WorkerID,
		StartDate:  m.StartDate,
		EndDate:    m.EndDate,
		Status:     entity.LeaveStatus(m.Status),
		Reason:     m.Reason,
		ApprovedBy: m.ApprovedBy,
	}
	l.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return l
}

func modelToOvertime(m *model.OvertimeModel) *entity.Overtime {
	ot := &entity.Overtime{
		WorkerID:   m.WorkerID,
		Date:       m.Date,
		Hours:      m.Hours,
		Status:     entity.OvertimeStatus(m.Status),
		Reason:     m.Reason,
		ApprovedBy: m.ApprovedBy,
	}
	ot.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return ot
}

// ─── Entity → Model Mappers ───────────────────────────────────────────────────

func shiftTemplateToModel(e *entity.ShiftTemplate) *model.ShiftTemplateModel {
	return &model.ShiftTemplateModel{
		ID:           e.ID,
		Code:         e.Code,
		Name:         e.Name,
		Description:  e.Description,
		StartTime:    e.StartTime,
		EndTime:      e.EndTime,
		BreakStart:   e.BreakStart,
		BreakEnd:     e.BreakEnd,
		WorkingHours: e.WorkingHours,
		CrossDay:     e.CrossDay,
		Color:        e.Color,
		Status:       e.Status,
		CreatedAt:    e.CreatedAt,
		UpdatedAt:    e.UpdatedAt,
	}
}

func shiftToModel(e *entity.Shift) *model.ShiftModel {
	m := &model.ShiftModel{
		ID:              e.ID,
		ShiftTemplateID: e.ShiftTemplateID,
		Date:            e.Date,
		CreatedAt:       e.CreatedAt,
		UpdatedAt:       e.UpdatedAt,
	}

	for _, t := range e.Teams {
		m.Teams = append(m.Teams, model.TeamAssignmentModel{
			ID:        t.ID,
			ShiftID:   t.ShiftID,
			TeamID:    t.TeamID,
			CreatedAt: t.CreatedAt,
		})
	}
	for _, w := range e.Workers {
		m.Workers = append(m.Workers, model.WorkerAssignmentModel{
			ID:        w.ID,
			ShiftID:   w.ShiftID,
			WorkerID:  w.WorkerID,
			Role:      w.Role,
			CreatedAt: w.CreatedAt,
		})
	}

	return m
}

func holidayToModel(e *entity.Holiday) *model.HolidayModel {
	return &model.HolidayModel{
		ID:          e.ID,
		Date:        e.Date,
		Name:        e.Name,
		Description: e.Description,
		CreatedAt:   e.CreatedAt,
		UpdatedAt:   e.UpdatedAt,
	}
}

func leaveToModel(e *entity.Leave) *model.LeaveModel {
	return &model.LeaveModel{
		ID:        e.ID,
		WorkerID:  e.WorkerID,
		StartDate: e.StartDate,
		EndDate:   e.EndDate,
		Status:    string(e.Status),
		Reason:    e.Reason,
		ApprovedBy: e.ApprovedBy,
		CreatedAt: e.CreatedAt,
		UpdatedAt: e.UpdatedAt,
	}
}

func overtimeToModel(e *entity.Overtime) *model.OvertimeModel {
	return &model.OvertimeModel{
		ID:        e.ID,
		WorkerID:  e.WorkerID,
		Date:      e.Date,
		Hours:     e.Hours,
		Status:    string(e.Status),
		Reason:    e.Reason,
		ApprovedBy: e.ApprovedBy,
		CreatedAt: e.CreatedAt,
		UpdatedAt: e.UpdatedAt,
	}
}
