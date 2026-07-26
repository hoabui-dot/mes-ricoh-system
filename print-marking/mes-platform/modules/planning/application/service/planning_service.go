package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/planning/application/dto"
	"github.com/nd/mes-platform/modules/planning/domain/entity"
	"github.com/nd/mes-platform/modules/planning/domain/repository"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/domain"
	"github.com/nd/mes-platform/shared/outbox"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

var (
	ErrConflict          = errors.New("conflict")
	ErrNotFound          = errors.New("not found")
	ErrValidation        = errors.New("validation error")
	ErrWorkerOnLeave     = errors.New("worker is on leave during this shift date")
	ErrInvalidDateLayout = errors.New("invalid date layout, use YYYY-MM-DD")
)

type OutboxRepository interface {
	Save(ctx context.Context, event *outbox.Event) error
}

type PlanningService struct {
	db           *gorm.DB
	shiftRepo    repository.ShiftRepository
	templateRepo repository.ShiftTemplateRepository
	holidayRepo  repository.HolidayRepository
	leaveRepo    repository.LeaveRepository
	overtimeRepo repository.OvertimeRepository
	outboxRepo   OutboxRepository
	log          *logger.Logger
}

func NewPlanningService(
	db *gorm.DB,
	shiftRepo repository.ShiftRepository,
	templateRepo repository.ShiftTemplateRepository,
	holidayRepo repository.HolidayRepository,
	leaveRepo repository.LeaveRepository,
	overtimeRepo repository.OvertimeRepository,
	outboxRepo OutboxRepository,
	log *logger.Logger,
) *PlanningService {
	return &PlanningService{
		db:           db,
		shiftRepo:    shiftRepo,
		templateRepo: templateRepo,
		holidayRepo:  holidayRepo,
		leaveRepo:    leaveRepo,
		overtimeRepo: overtimeRepo,
		outboxRepo:   outboxRepo,
		log:          log.With(logger.Module("planning")),
	}
}

// ─── Shift Template Use Cases ─────────────────────────────────────────────────

func (s *PlanningService) CreateShiftTemplate(ctx context.Context, req dto.CreateShiftTemplateRequest) (*dto.ShiftTemplateDTO, error) {
	if exists, _ := s.templateRepo.FindByCode(ctx, req.Code); exists != nil {
		return nil, fmt.Errorf("%w: shift template with code %s already exists", ErrConflict, req.Code)
	}

	tpl, err := entity.NewShiftTemplate(req.Code, req.Name, req.Description, req.StartTime, req.EndTime, req.BreakStart, req.BreakEnd, req.CrossDay, req.Color, req.Status)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.templateRepo.Save(ctx, tpl); err != nil {
		return nil, err
	}

	return mapShiftTemplateToDTO(tpl), nil
}

func (s *PlanningService) UpdateShiftTemplate(ctx context.Context, id uuid.UUID, req dto.UpdateShiftTemplateRequest) (*dto.ShiftTemplateDTO, error) {
	tpl, err := s.templateRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	if req.Code != tpl.Code {
		if exists, _ := s.templateRepo.FindByCode(ctx, req.Code); exists != nil {
			return nil, fmt.Errorf("%w: shift template with code %s already exists", ErrConflict, req.Code)
		}
	}

	err = tpl.Update(req.Code, req.Name, req.Description, req.StartTime, req.EndTime, req.BreakStart, req.BreakEnd, req.CrossDay, req.Color, req.Status)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.templateRepo.Save(ctx, tpl); err != nil {
		return nil, err
	}

	return mapShiftTemplateToDTO(tpl), nil
}

func (s *PlanningService) DeleteShiftTemplate(ctx context.Context, id uuid.UUID) error {
	_, err := s.templateRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	return s.templateRepo.Delete(ctx, id)
}

func (s *PlanningService) ListShiftTemplates(ctx context.Context) ([]*dto.ShiftTemplateDTO, error) {
	tpls, err := s.templateRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	dtos := make([]*dto.ShiftTemplateDTO, len(tpls))
	for i, t := range tpls {
		dtos[i] = mapShiftTemplateToDTO(t)
	}
	return dtos, nil
}

// ─── Daily Shift Use Cases ────────────────────────────────────────────────────

func (s *PlanningService) CreateShift(ctx context.Context, req dto.CreateShiftRequest) (*dto.ShiftDTO, error) {
	tplID, err := uuid.Parse(req.ShiftTemplateID)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid shift_template_id", ErrValidation)
	}

	tpl, err := s.templateRepo.FindByID(ctx, tplID)
	if err != nil {
		return nil, fmt.Errorf("%w: shift template", ErrNotFound)
	}

	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return nil, fmt.Errorf("%w: date must be in YYYY-MM-DD format", ErrInvalidDateLayout)
	}

	if exists, _ := s.shiftRepo.FindByDateAndTemplate(ctx, date, tplID); exists != nil {
		return nil, fmt.Errorf("%w: shift for this template on %s already exists", ErrConflict, req.Date)
	}

	shift, err := entity.NewShift(tplID, date)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.shiftRepo.Save(ctx, shift); err != nil {
		return nil, err
	}

	_ = s.publishEvents(ctx, shift.PullEvents())

	return &dto.ShiftDTO{
		ID:            shift.ID,
		ShiftTemplate: dto.ShiftTemplateDTO{ID: tpl.ID, Name: tpl.Name, StartTime: tpl.StartTime, EndTime: tpl.EndTime},
		Date:          shift.Date,
	}, nil
}

func (s *PlanningService) ListShifts(ctx context.Context, startStr, endStr string) ([]*dto.ShiftDTO, error) {
	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		return nil, fmt.Errorf("%w: start_date", ErrInvalidDateLayout)
	}
	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		return nil, fmt.Errorf("%w: end_date", ErrInvalidDateLayout)
	}

	shifts, err := s.shiftRepo.List(ctx, repository.ShiftFilter{StartDate: start, EndDate: end})
	if err != nil {
		return nil, err
	}

	dtos := make([]*dto.ShiftDTO, len(shifts))
	for i, sh := range shifts {
		dtos[i] = mapShiftToDTO(sh)
	}
	return dtos, nil
}

func (s *PlanningService) AssignTeamToShift(ctx context.Context, shiftID uuid.UUID, req dto.AssignTeamRequest) error {
	shift, err := s.shiftRepo.FindByID(ctx, shiftID)
	if err != nil {
		return ErrNotFound
	}

	teamID, err := uuid.Parse(req.TeamID)
	if err != nil {
		return fmt.Errorf("%w: invalid team_id", ErrValidation)
	}

	if err := shift.AssignTeam(teamID); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.shiftRepo.Save(ctx, shift); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, shift.PullEvents())
	return nil
}

func (s *PlanningService) AssignWorkerToShift(ctx context.Context, shiftID uuid.UUID, req dto.AssignWorkerRequest) error {
	shift, err := s.shiftRepo.FindByID(ctx, shiftID)
	if err != nil {
		return ErrNotFound
	}

	workerID, err := uuid.Parse(req.WorkerID)
	if err != nil {
		return fmt.Errorf("%w: invalid worker_id", ErrValidation)
	}

	// 1. Verify worker is not suspended
	var workerStatus string
	err = s.db.WithContext(ctx).Table("workforce_workers").Select("status").Where("id = ? AND deleted_at IS NULL", workerID).Scan(&workerStatus).Error
	if err == nil && workerStatus == "suspended" {
		return fmt.Errorf("%w: worker is suspended and cannot be scheduled", ErrValidation)
	}

	// 2. Verify worker is not on leave during shift date
	leaves, err := s.leaveRepo.FindOverlap(ctx, workerID, shift.Date, shift.Date)
	if err == nil && len(leaves) > 0 {
		for _, l := range leaves {
			if l.Status == entity.LeaveStatusApproved {
				return fmt.Errorf("%w", ErrWorkerOnLeave)
			}
		}
	}

	// 3. Verify worker is not already scheduled on a different shift on this date
	var count int64
	err = s.db.WithContext(ctx).Table("planning_worker_assignments wa").
		Joins("JOIN planning_shifts s ON wa.shift_id = s.id").
		Where("wa.worker_id = ? AND s.date = ? AND s.id != ?", workerID, shift.Date, shift.ID).
		Count(&count).Error
	if err == nil && count > 0 {
		return fmt.Errorf("%w: worker is already scheduled on a different shift on this date", ErrConflict)
	}

	if err := shift.AssignWorker(workerID, req.Role); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.shiftRepo.Save(ctx, shift); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, shift.PullEvents())
	return nil
}

// ─── Holiday Use Cases ───────────────────────────────────────────────────────

func (s *PlanningService) CreateHoliday(ctx context.Context, req dto.CreateHolidayRequest) (*dto.HolidayDTO, error) {
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return nil, fmt.Errorf("%w: date", ErrInvalidDateLayout)
	}

	if exists, _ := s.holidayRepo.FindByDate(ctx, date); exists != nil {
		return nil, fmt.Errorf("%w: holiday on date %s already exists", ErrConflict, req.Date)
	}

	h, err := entity.NewHoliday(date, req.Name, req.Description)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.holidayRepo.Save(ctx, h); err != nil {
		return nil, err
	}

	return &dto.HolidayDTO{
		ID:          h.ID,
		Date:        h.Date,
		Name:        h.Name,
		Description: h.Description,
	}, nil
}

func (s *PlanningService) ListHolidays(ctx context.Context, startStr, endStr string) ([]*dto.HolidayDTO, error) {
	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		return nil, fmt.Errorf("%w: start_date", ErrInvalidDateLayout)
	}
	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		return nil, fmt.Errorf("%w: end_date", ErrInvalidDateLayout)
	}

	list, err := s.holidayRepo.List(ctx, start, end)
	if err != nil {
		return nil, err
	}

	dtos := make([]*dto.HolidayDTO, len(list))
	for i, h := range list {
		dtos[i] = &dto.HolidayDTO{
			ID:          h.ID,
			Date:        h.Date,
			Name:        h.Name,
			Description: h.Description,
		}
	}
	return dtos, nil
}

// ─── Leave Use Cases ─────────────────────────────────────────────────────────

func (s *PlanningService) RequestLeave(ctx context.Context, req dto.RequestLeaveRequest) (*dto.LeaveDTO, error) {
	workerID, err := uuid.Parse(req.WorkerID)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid worker_id", ErrValidation)
	}

	start, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		return nil, fmt.Errorf("%w: start_date", ErrInvalidDateLayout)
	}

	end, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		return nil, fmt.Errorf("%w: end_date", ErrInvalidDateLayout)
	}

	// Verify no pending or approved leave overlap exists
	overlaps, err := s.leaveRepo.FindOverlap(ctx, workerID, start, end)
	if err == nil && len(overlaps) > 0 {
		for _, o := range overlaps {
			if o.Status == entity.LeaveStatusPending || o.Status == entity.LeaveStatusApproved {
				return nil, fmt.Errorf("%w: overlaps with leave from %s to %s", ErrConflict, o.StartDate.Format("2006-01-02"), o.EndDate.Format("2006-01-02"))
			}
		}
	}

	leave, err := entity.NewLeave(workerID, start, end, req.Reason)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.leaveRepo.Save(ctx, leave); err != nil {
		return nil, err
	}

	_ = s.publishEvents(ctx, leave.PullEvents())

	return mapLeaveToDTO(leave), nil
}

func (s *PlanningService) ApproveLeave(ctx context.Context, id uuid.UUID, req dto.ApproveRejectLeaveRequest) error {
	leave, err := s.leaveRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}

	approverID, err := uuid.Parse(req.ApprovedBy)
	if err != nil {
		return fmt.Errorf("%w: invalid approved_by user id", ErrValidation)
	}

	if err := leave.Approve(approverID); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.leaveRepo.Save(ctx, leave); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, leave.PullEvents())
	return nil
}

func (s *PlanningService) RejectLeave(ctx context.Context, id uuid.UUID, req dto.ApproveRejectLeaveRequest) error {
	leave, err := s.leaveRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}

	approverID, err := uuid.Parse(req.ApprovedBy)
	if err != nil {
		return fmt.Errorf("%w: invalid approved_by user id", ErrValidation)
	}

	if err := leave.Reject(approverID); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.leaveRepo.Save(ctx, leave); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, leave.PullEvents())
	return nil
}

func (s *PlanningService) ListLeaves(ctx context.Context, filter repository.LeaveFilter) ([]*dto.LeaveDTO, int64, error) {
	leaves, total, err := s.leaveRepo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	dtos := make([]*dto.LeaveDTO, len(leaves))
	for i, l := range leaves {
		dtos[i] = mapLeaveToDTO(l)
	}
	return dtos, total, nil
}

// ─── Overtime Use Cases ──────────────────────────────────────────────────────

func (s *PlanningService) RequestOvertime(ctx context.Context, req dto.RequestOvertimeRequest) (*dto.OvertimeDTO, error) {
	workerID, err := uuid.Parse(req.WorkerID)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid worker_id", ErrValidation)
	}

	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return nil, fmt.Errorf("%w: date", ErrInvalidDateLayout)
	}

	ot, err := entity.NewOvertime(workerID, date, req.Hours, req.Reason)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.overtimeRepo.Save(ctx, ot); err != nil {
		return nil, err
	}

	_ = s.publishEvents(ctx, ot.PullEvents())

	return mapOvertimeToDTO(ot), nil
}

func (s *PlanningService) ApproveOvertime(ctx context.Context, id uuid.UUID, req dto.ApproveRejectOvertimeRequest) error {
	ot, err := s.overtimeRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}

	approverID, err := uuid.Parse(req.ApprovedBy)
	if err != nil {
		return fmt.Errorf("%w: invalid approved_by user id", ErrValidation)
	}

	if err := ot.Approve(approverID); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.overtimeRepo.Save(ctx, ot); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, ot.PullEvents())
	return nil
}

func (s *PlanningService) RejectOvertime(ctx context.Context, id uuid.UUID, req dto.ApproveRejectOvertimeRequest) error {
	ot, err := s.overtimeRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}

	approverID, err := uuid.Parse(req.ApprovedBy)
	if err != nil {
		return fmt.Errorf("%w: invalid approved_by user id", ErrValidation)
	}

	if err := ot.Reject(approverID); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.overtimeRepo.Save(ctx, ot); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, ot.PullEvents())
	return nil
}

func (s *PlanningService) ListOvertimes(ctx context.Context, filter repository.OvertimeFilter) ([]*dto.OvertimeDTO, int64, error) {
	overtimes, total, err := s.overtimeRepo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	dtos := make([]*dto.OvertimeDTO, len(overtimes))
	for i, ot := range overtimes {
		dtos[i] = mapOvertimeToDTO(ot)
	}
	return dtos, total, nil
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

func (s *PlanningService) publishEvents(ctx context.Context, events []domain.DomainEvent) error {
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

func mapShiftToDTO(sh *entity.Shift) *dto.ShiftDTO {
	d := &dto.ShiftDTO{
		ID:   sh.ID,
		Date: sh.Date,
	}
	if sh.ShiftTemplate != nil {
		d.ShiftTemplate = *mapShiftTemplateToDTO(sh.ShiftTemplate)
	} else {
		d.ShiftTemplate = dto.ShiftTemplateDTO{ID: sh.ShiftTemplateID}
	}

	for _, t := range sh.Teams {
		d.Teams = append(d.Teams, dto.TeamAssignmentDTO{
			ID:        t.ID,
			TeamID:    t.TeamID,
			CreatedAt: t.CreatedAt,
		})
	}
	for _, w := range sh.Workers {
		d.Workers = append(d.Workers, dto.WorkerAssignmentDTO{
			ID:        w.ID,
			WorkerID:  w.WorkerID,
			Role:      w.Role,
			CreatedAt: w.CreatedAt,
		})
	}
	return d
}

func mapLeaveToDTO(l *entity.Leave) *dto.LeaveDTO {
	return &dto.LeaveDTO{
		ID:         l.ID,
		WorkerID:   l.WorkerID,
		StartDate:  l.StartDate,
		EndDate:    l.EndDate,
		Status:     string(l.Status),
		Reason:     l.Reason,
		ApprovedBy: l.ApprovedBy,
		CreatedAt:  l.CreatedAt,
		UpdatedAt:  l.UpdatedAt,
	}
}

func mapOvertimeToDTO(ot *entity.Overtime) *dto.OvertimeDTO {
	return &dto.OvertimeDTO{
		ID:         ot.ID,
		WorkerID:   ot.WorkerID,
		Date:       ot.Date,
		Hours:      ot.Hours,
		Status:     string(ot.Status),
		Reason:     ot.Reason,
		ApprovedBy: ot.ApprovedBy,
		CreatedAt:  ot.CreatedAt,
		UpdatedAt:  ot.UpdatedAt,
	}
}

func mapShiftTemplateToDTO(t *entity.ShiftTemplate) *dto.ShiftTemplateDTO {
	return &dto.ShiftTemplateDTO{
		ID:           t.ID,
		Code:         t.Code,
		Name:         t.Name,
		Description:  t.Description,
		StartTime:    t.StartTime,
		EndTime:      t.EndTime,
		BreakStart:   t.BreakStart,
		BreakEnd:     t.BreakEnd,
		WorkingHours: t.WorkingHours,
		CrossDay:     t.CrossDay,
		Color:        t.Color,
		Status:       t.Status,
	}
}

// ─── Additional Planning & Scheduling Use Cases ──────────────────────────────

func (s *PlanningService) GenerateCalendar(ctx context.Context, req dto.GenerateCalendarRequest) error {
	// 1. Get all active templates
	templates, err := s.templateRepo.List(ctx)
	if err != nil {
		return err
	}

	// 2. Iterate dates in the month
	firstDay := time.Date(req.Year, time.Month(req.Month), 1, 0, 0, 0, 0, time.UTC)
	lastDay := firstDay.AddDate(0, 1, -1)

	var generatedCount int
	for d := firstDay; !d.After(lastDay); d = d.AddDate(0, 0, 1) {
		for _, tpl := range templates {
			if tpl.Status != "active" {
				continue
			}

			// Check if already exists
			exists, err := s.shiftRepo.FindByDateAndTemplate(ctx, d, tpl.ID)
			if err == nil && exists != nil {
				continue // Skip existing
			}

			// Create new shift instance
			shift, err := entity.NewShift(tpl.ID, d)
			if err != nil {
				return err
			}

			if err := s.shiftRepo.Save(ctx, shift); err != nil {
				return err
			}

			generatedCount++
			_ = s.publishEvents(ctx, shift.PullEvents())
		}
	}

	s.log.Info("Calendar generated", zap.Int("year", req.Year), zap.Int("month", req.Month), zap.Int("generated_shifts", generatedCount))
	return nil
}

func (s *PlanningService) GetScheduleGrid(ctx context.Context, workshopID, teamID *uuid.UUID, year, month int) (*dto.ScheduleGridResponse, error) {
	var workers []struct {
		ID           uuid.UUID  `gorm:"column:id"`
		FirstName    string     `gorm:"column:first_name"`
		LastName     string     `gorm:"column:last_name"`
		EmployeeCode string     `gorm:"column:employee_code"`
		TeamID       *uuid.UUID `gorm:"column:team_id"`
		TeamName     string     `gorm:"column:team_name"`
		WorkshopID   *uuid.UUID `gorm:"column:workshop_id"`
		WorkshopName string     `gorm:"column:workshop_name"`
	}

	query := s.db.WithContext(ctx).Table("workforce_workers w").
		Select("w.id, w.first_name, w.last_name, w.employee_code, w.team_id, t.name as team_name, w.workshop_id, ws.name as workshop_name").
		Joins("LEFT JOIN workforce_teams t ON w.team_id = t.id").
		Joins("LEFT JOIN workforce_workshops ws ON w.workshop_id = ws.id").
		Where("w.deleted_at IS NULL")

	if teamID != nil {
		query = query.Where("w.team_id = ?", *teamID)
	} else if workshopID != nil {
		query = query.Where("w.workshop_id = ?", *workshopID)
	}

	if err := query.Find(&workers).Error; err != nil {
		return nil, err
	}

	startDate := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	endDate := startDate.AddDate(0, 1, -1)

	shifts, err := s.shiftRepo.List(ctx, repository.ShiftFilter{StartDate: startDate, EndDate: endDate})
	if err != nil {
		return nil, err
	}

	rows := make([]dto.WorkerScheduleGridRow, len(workers))
	for i, w := range workers {
		row := dto.WorkerScheduleGridRow{
			WorkerID:     w.ID,
			FirstName:    w.FirstName,
			LastName:     w.LastName,
			EmployeeCode: w.EmployeeCode,
			TeamID:       w.TeamID,
			TeamName:     w.TeamName,
			WorkshopID:   w.WorkshopID,
			WorkshopName: w.WorkshopName,
			Assignments:  make(map[string]*dto.GridAssignmentDTO),
		}

		for _, sh := range shifts {
			dateStr := sh.Date.Format("2006-01-02")

			var workerAss *entity.WorkerAssignment
			for _, wa := range sh.Workers {
				if wa.WorkerID == w.ID {
					waCopy := wa
					workerAss = &waCopy
					break
				}
			}

			if workerAss != nil {
				row.Assignments[dateStr] = &dto.GridAssignmentDTO{
					ShiftID:         sh.ID,
					ShiftTemplateID: sh.ShiftTemplateID,
					Code:            sh.ShiftTemplate.Code,
					Name:            sh.ShiftTemplate.Name,
					Color:           sh.ShiftTemplate.Color,
					Role:            workerAss.Role,
					Type:            "worker",
				}
				continue
			}

			if w.TeamID != nil {
				var teamAss *entity.TeamAssignment
				for _, ta := range sh.Teams {
					if ta.TeamID == *w.TeamID {
						taCopy := ta
						teamAss = &taCopy
						break
					}
				}

				if teamAss != nil {
					row.Assignments[dateStr] = &dto.GridAssignmentDTO{
						ShiftID:         sh.ID,
						ShiftTemplateID: sh.ShiftTemplateID,
						Code:            sh.ShiftTemplate.Code,
						Name:            sh.ShiftTemplate.Name,
						Color:           sh.ShiftTemplate.Color,
						Role:            "operator",
						Type:            "team",
					}
				}
			}
		}
		rows[i] = row
	}

	return &dto.ScheduleGridResponse{
		Year:  year,
		Month: month,
		Rows:  rows,
	}, nil
}

func (s *PlanningService) AssignTeamSchedule(ctx context.Context, req dto.TeamAssignmentRequest) error {
	teamID, err := uuid.Parse(req.TeamID)
	if err != nil {
		return fmt.Errorf("%w: invalid team_id", ErrValidation)
	}
	tplID, err := uuid.Parse(req.ShiftTemplateID)
	if err != nil {
		return fmt.Errorf("%w: invalid shift_template_id", ErrValidation)
	}

	start, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		return fmt.Errorf("%w: invalid start_date", ErrInvalidDateLayout)
	}
	end, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		return fmt.Errorf("%w: invalid end_date", ErrInvalidDateLayout)
	}

	if end.Before(start) {
		return fmt.Errorf("%w: end_date cannot be before start_date", ErrValidation)
	}

	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		shift, err := s.shiftRepo.FindByDateAndTemplate(ctx, d, tplID)
		if err != nil {
			shift, err = entity.NewShift(tplID, d)
			if err != nil {
				return err
			}
		}

		_ = shift.AssignTeam(teamID)

		if err := s.shiftRepo.Save(ctx, shift); err != nil {
			return err
		}
		_ = s.publishEvents(ctx, shift.PullEvents())
	}

	return nil
}

func (s *PlanningService) RemoveWorkerSchedule(ctx context.Context, shiftID uuid.UUID, workerID uuid.UUID) error {
	shift, err := s.shiftRepo.FindByID(ctx, shiftID)
	if err != nil {
		return ErrNotFound
	}

	if err := shift.RemoveWorker(workerID); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.shiftRepo.Save(ctx, shift); err != nil {
		return err
	}

	_ = s.publishEvents(ctx, shift.PullEvents())
	return nil
}

func (s *PlanningService) GetWorkersAvailability(ctx context.Context, dateStr string) ([]*dto.WorkerAvailabilityDTO, error) {
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return nil, fmt.Errorf("%w: date", ErrInvalidDateLayout)
	}
	dateTrunc := date.UTC().Truncate(24 * time.Hour)

	var workers []struct {
		ID           uuid.UUID  `gorm:"column:id"`
		FirstName    string     `gorm:"column:first_name"`
		LastName     string     `gorm:"column:last_name"`
		EmployeeCode string     `gorm:"column:employee_code"`
		Status       string     `gorm:"column:status"`
		TeamID       *uuid.UUID `gorm:"column:team_id"`
	}
	if err := s.db.WithContext(ctx).Table("workforce_workers").
		Select("id, first_name, last_name, employee_code, status, team_id").
		Where("deleted_at IS NULL").
		Find(&workers).Error; err != nil {
		return nil, err
	}

	var leaves []struct {
		WorkerID uuid.UUID `gorm:"column:worker_id"`
		Reason   string    `gorm:"column:reason"`
	}
	s.db.WithContext(ctx).Table("planning_leaves").
		Select("worker_id, reason").
		Where("status = 'approved' AND start_date <= ? AND end_date >= ?", dateTrunc, dateTrunc).
		Scan(&leaves)

	leaveMap := make(map[uuid.UUID]string)
	for _, l := range leaves {
		leaveMap[l.WorkerID] = l.Reason
	}

	type shiftAssign struct {
		WorkerID  uuid.UUID `gorm:"column:worker_id"`
		ShiftName string    `gorm:"column:shift_name"`
		Hours     float64   `gorm:"column:hours"`
	}
	var directAssigns []shiftAssign
	s.db.WithContext(ctx).Table("planning_worker_assignments wa").
		Select("wa.worker_id, st.name as shift_name, st.working_hours as hours").
		Joins("JOIN planning_shifts s ON wa.shift_id = s.id").
		Joins("JOIN planning_shift_templates st ON s.shift_template_id = st.id").
		Where("s.date = ?", dateTrunc).
		Scan(&directAssigns)

	directMap := make(map[uuid.UUID]shiftAssign)
	for _, a := range directAssigns {
		directMap[a.WorkerID] = a
	}

	type teamAssign struct {
		TeamID    uuid.UUID `gorm:"column:team_id"`
		ShiftName string    `gorm:"column:shift_name"`
		Hours     float64   `gorm:"column:hours"`
	}
	var teamAssigns []teamAssign
	s.db.WithContext(ctx).Table("planning_team_assignments ta").
		Select("ta.team_id, st.name as shift_name, st.working_hours as hours").
		Joins("JOIN planning_shifts s ON ta.shift_id = s.id").
		Joins("JOIN planning_shift_templates st ON s.shift_template_id = st.id").
		Where("s.date = ?", dateTrunc).
		Scan(&teamAssigns)

	teamMap := make(map[uuid.UUID]teamAssign)
	for _, a := range teamAssigns {
		teamMap[a.TeamID] = a
	}

	type workerSkill struct {
		WorkerID  uuid.UUID `gorm:"column:worker_id"`
		SkillName string    `gorm:"column:skill_name"`
	}
	var skills []workerSkill
	s.db.WithContext(ctx).Table("workforce_skill_matrix sm").
		Select("sm.worker_id, sk.name as skill_name").
		Joins("JOIN workforce_skills sk ON sm.skill_id = sk.id").
		Scan(&skills)

	skillMap := make(map[uuid.UUID][]string)
	for _, s := range skills {
		skillMap[s.WorkerID] = append(skillMap[s.WorkerID], s.SkillName)
	}

	weekday := int(dateTrunc.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	weekStart := dateTrunc.AddDate(0, 0, -weekday+1)
	weekEnd := weekStart.AddDate(0, 0, 6)

	type otHours struct {
		WorkerID uuid.UUID `gorm:"column:worker_id"`
		Total    float64   `gorm:"column:total"`
	}
	var overtimeTotals []otHours
	s.db.WithContext(ctx).Table("planning_overtimes").
		Select("worker_id, COALESCE(SUM(hours), 0) as total").
		Where("status = 'approved' AND date >= ? AND date <= ?", weekStart, weekEnd).
		Group("worker_id").
		Scan(&overtimeTotals)

	otMap := make(map[uuid.UUID]float64)
	for _, o := range overtimeTotals {
		otMap[o.WorkerID] = o.Total
	}

	type shiftHours struct {
		WorkerID uuid.UUID `gorm:"column:worker_id"`
		Total    float64   `gorm:"column:total"`
	}
	var directShiftTotals []shiftHours
	s.db.WithContext(ctx).Table("planning_worker_assignments wa").
		Select("wa.worker_id, COALESCE(SUM(st.working_hours), 0) as total").
		Joins("JOIN planning_shifts s ON wa.shift_id = s.id").
		Joins("JOIN planning_shift_templates st ON s.shift_template_id = st.id").
		Where("s.date >= ? AND s.date <= ?", weekStart, weekEnd).
		Group("wa.worker_id").
		Scan(&directShiftTotals)

	directHoursMap := make(map[uuid.UUID]float64)
	for _, h := range directShiftTotals {
		directHoursMap[h.WorkerID] = h.Total
	}

	dtos := make([]*dto.WorkerAvailabilityDTO, len(workers))
	for i, w := range workers {
		avail := "available"
		var todayShift *string
		var leaveReason *string

		if w.Status == "suspended" {
			avail = "suspended"
		} else if reason, ok := leaveMap[w.ID]; ok {
			avail = "leave"
			leaveReason = &reason
		} else if direct, ok := directMap[w.ID]; ok {
			avail = "busy"
			todayShift = &direct.ShiftName
		} else if w.TeamID != nil {
			if team, ok := teamMap[*w.TeamID]; ok {
				avail = "busy"
				todayShift = &team.ShiftName
			}
		}

		weeklyHrs := directHoursMap[w.ID] + otMap[w.ID]
		if directHoursMap[w.ID] == 0 && w.TeamID != nil {
			var teamWeeklyTotal float64
			s.db.WithContext(ctx).Table("planning_team_assignments ta").
				Select("COALESCE(SUM(st.working_hours), 0)").
				Joins("JOIN planning_shifts s ON ta.shift_id = s.id").
				Joins("JOIN planning_shift_templates st ON s.shift_template_id = st.id").
				Where("ta.team_id = ? AND s.date >= ? AND s.date <= ?", *w.TeamID, weekStart, weekEnd).
				Scan(&teamWeeklyTotal)
			weeklyHrs += teamWeeklyTotal
		}

		dtos[i] = &dto.WorkerAvailabilityDTO{
			WorkerID:     w.ID,
			FirstName:    w.FirstName,
			LastName:     w.LastName,
			EmployeeCode: w.EmployeeCode,
			Status:       w.Status,
			Availability: avail,
			TodayShift:   todayShift,
			LeaveReason:  leaveReason,
			WeeklyHours:  weeklyHrs,
			Skills:       skillMap[w.ID],
		}
	}

	return dtos, nil
}
