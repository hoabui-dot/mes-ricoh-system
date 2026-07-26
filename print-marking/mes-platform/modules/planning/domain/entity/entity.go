package entity

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// TimePattern matches HH:MM format
var timePattern = regexp.MustCompile(`^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$`)

func parseTimeToMinutes(t string) (int, error) {
	if !timePattern.MatchString(t) {
		return 0, fmt.Errorf("invalid time format: %s, must be HH:MM", t)
	}
	var h, m int
	_, _ = fmt.Sscanf(t, "%d:%d", &h, &m)
	return h*60 + m, nil
}

func CalculateWorkingHours(start, end, breakStart, breakEnd string, crossDay bool) (float64, error) {
	startMin, err := parseTimeToMinutes(start)
	if err != nil {
		return 0, err
	}
	endMin, err := parseTimeToMinutes(end)
	if err != nil {
		return 0, err
	}

	var shiftMin int
	if crossDay {
		shiftMin = endMin - startMin
		if shiftMin <= 0 {
			shiftMin += 24 * 60
		}
	} else {
		shiftMin = endMin - startMin
		if shiftMin <= 0 {
			return 0, errors.New("start time must be before end time for non-cross day shifts")
		}
	}

	breakMin := 0
	if breakStart != "" && breakEnd != "" {
		bsMin, err := parseTimeToMinutes(breakStart)
		if err != nil {
			return 0, err
		}
		beMin, err := parseTimeToMinutes(breakEnd)
		if err != nil {
			return 0, err
		}

		breakMin = beMin - bsMin
		if breakMin < 0 {
			breakMin += 24 * 60
		}
	}

	workingMin := shiftMin - breakMin
	if workingMin < 0 {
		return 0, errors.New("break duration cannot exceed shift duration")
	}

	return float64(workingMin) / 60.0, nil
}

// ─── Shift Template ──────────────────────────────────────────────────────────

type ShiftTemplate struct {
	domain.BaseEntity
	Code         string
	Name         string
	Description  string
	StartTime    string // HH:MM
	EndTime      string // HH:MM
	BreakStart   string // HH:MM (optional)
	BreakEnd     string // HH:MM (optional)
	WorkingHours float64
	CrossDay     bool
	Color        string
	Status       string
}

func NewShiftTemplate(code, name, desc, start, end, breakStart, breakEnd string, crossDay bool, color, status string) (*ShiftTemplate, error) {
	if strings.TrimSpace(code) == "" {
		return nil, errors.New("shift template code is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("shift template name is required")
	}

	workingHours, err := CalculateWorkingHours(start, end, breakStart, breakEnd, crossDay)
	if err != nil {
		return nil, err
	}

	if color == "" {
		color = "#F97316"
	}
	if status == "" {
		status = "active"
	}

	return &ShiftTemplate{
		BaseEntity:   domain.NewBaseEntity(),
		Code:         strings.TrimSpace(code),
		Name:         strings.TrimSpace(name),
		Description:  strings.TrimSpace(desc),
		StartTime:    start,
		EndTime:      end,
		BreakStart:   breakStart,
		BreakEnd:     breakEnd,
		WorkingHours: workingHours,
		CrossDay:     crossDay,
		Color:        color,
		Status:       status,
	}, nil
}

func (t *ShiftTemplate) Update(code, name, desc, start, end, breakStart, breakEnd string, crossDay bool, color, status string) error {
	if strings.TrimSpace(code) == "" {
		return errors.New("shift template code is required")
	}
	if strings.TrimSpace(name) == "" {
		return errors.New("shift template name is required")
	}

	workingHours, err := CalculateWorkingHours(start, end, breakStart, breakEnd, crossDay)
	if err != nil {
		return err
	}

	t.Code = strings.TrimSpace(code)
	t.Name = strings.TrimSpace(name)
	t.Description = strings.TrimSpace(desc)
	t.StartTime = start
	t.EndTime = end
	t.BreakStart = breakStart
	t.BreakEnd = breakEnd
	t.WorkingHours = workingHours
	t.CrossDay = crossDay
	t.Color = color
	t.Status = status
	t.Touch()
	return nil
}

// ─── Team Assignment Value Object ────────────────────────────────────────────

type TeamAssignment struct {
	ID        uuid.UUID
	ShiftID   uuid.UUID
	TeamID    uuid.UUID
	CreatedAt time.Time
}

// ─── Worker Assignment Value Object ──────────────────────────────────────────

type WorkerAssignment struct {
	ID        uuid.UUID
	ShiftID   uuid.UUID
	WorkerID  uuid.UUID
	Role      string
	CreatedAt time.Time
}

// ─── Shift (Aggregate Root) ──────────────────────────────────────────────────

type Shift struct {
	domain.AggregateRoot
	ShiftTemplateID uuid.UUID
	ShiftTemplate   *ShiftTemplate
	Date            time.Time
	Teams           []TeamAssignment
	Workers         []WorkerAssignment
}

func NewShift(templateID uuid.UUID, date time.Time) (*Shift, error) {
	if date.IsZero() {
		return nil, errors.New("invalid shift date")
	}
	s := &Shift{
		ShiftTemplateID: templateID,
		Date:            date.UTC().Truncate(24 * time.Hour),
	}
	s.BaseEntity = domain.NewBaseEntity()
	s.RecordEvent(NewShiftCreatedEvent(s.ID, s.ShiftTemplateID, s.Date))
	return s, nil
}

func (s *Shift) AssignTeam(teamID uuid.UUID) error {
	for _, t := range s.Teams {
		if t.TeamID == teamID {
			return errors.New("team is already assigned to this shift")
		}
	}
	ta := TeamAssignment{
		ID:        uuid.New(),
		ShiftID:   s.ID,
		TeamID:    teamID,
		CreatedAt: time.Now().UTC(),
	}
	s.Teams = append(s.Teams, ta)
	s.Touch()
	s.RecordEvent(NewTeamAssignedToShiftEvent(s.ID, teamID))
	return nil
}

func (s *Shift) AssignWorker(workerID uuid.UUID, role string) error {
	for _, w := range s.Workers {
		if w.WorkerID == workerID {
			return errors.New("worker is already assigned to this shift")
		}
	}
	wa := WorkerAssignment{
		ID:        uuid.New(),
		ShiftID:   s.ID,
		WorkerID:  workerID,
		Role:      strings.TrimSpace(role),
		CreatedAt: time.Now().UTC(),
	}
	s.Workers = append(s.Workers, wa)
	s.Touch()
	s.RecordEvent(NewWorkerAssignedToShiftEvent(s.ID, workerID, role))
	return nil
}

func (s *Shift) RemoveWorker(workerID uuid.UUID) error {
	for i, w := range s.Workers {
		if w.WorkerID == workerID {
			s.Workers = append(s.Workers[:i], s.Workers[i+1:]...)
			s.Touch()
			s.RecordEvent(NewWorkerRemovedFromShiftEvent(s.ID, workerID))
			return nil
		}
	}
	return errors.New("worker is not assigned to this shift")
}

func (s *Shift) RemoveTeam(teamID uuid.UUID) error {
	for i, t := range s.Teams {
		if t.TeamID == teamID {
			s.Teams = append(s.Teams[:i], s.Teams[i+1:]...)
			s.Touch()
			s.RecordEvent(NewTeamRemovedFromShiftEvent(s.ID, teamID))
			return nil
		}
	}
	return errors.New("team is not assigned to this shift")
}

// ─── Holiday ─────────────────────────────────────────────────────────────────

type Holiday struct {
	domain.BaseEntity
	Date        time.Time
	Name        string
	Description string
}

func NewHoliday(date time.Time, name, description string) (*Holiday, error) {
	if date.IsZero() {
		return nil, errors.New("invalid holiday date")
	}
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("holiday name is required")
	}
	return &Holiday{
		BaseEntity:  domain.NewBaseEntity(),
		Date:        date.UTC().Truncate(24 * time.Hour),
		Name:        strings.TrimSpace(name),
		Description: description,
	}, nil
}

// ─── Leave Request (Aggregate Root) ──────────────────────────────────────────

type LeaveStatus string

const (
	LeaveStatusPending  LeaveStatus = "pending"
	LeaveStatusApproved LeaveStatus = "approved"
	LeaveStatusRejected LeaveStatus = "rejected"
)

type Leave struct {
	domain.AggregateRoot
	WorkerID   uuid.UUID
	StartDate  time.Time
	EndDate    time.Time
	Status     LeaveStatus
	Reason     string
	ApprovedBy *uuid.UUID
}

func NewLeave(workerID uuid.UUID, start, end time.Time, reason string) (*Leave, error) {
	if start.IsZero() || end.IsZero() {
		return nil, errors.New("invalid leave request dates")
	}
	startTrunc := start.UTC().Truncate(24 * time.Hour)
	endTrunc := end.UTC().Truncate(24 * time.Hour)
	if endTrunc.Before(startTrunc) {
		return nil, errors.New("leave end date cannot be before start date")
	}

	l := &Leave{
		WorkerID:  workerID,
		StartDate: startTrunc,
		EndDate:   endTrunc,
		Status:    LeaveStatusPending,
		Reason:    strings.TrimSpace(reason),
	}
	l.BaseEntity = domain.NewBaseEntity()
	l.RecordEvent(NewLeaveRequestedEvent(l.ID, workerID, startTrunc, endTrunc))
	return l, nil
}

func (l *Leave) Approve(approverID uuid.UUID) error {
	if l.Status != LeaveStatusPending {
		return errors.New("only pending leave requests can be approved")
	}
	l.Status = LeaveStatusApproved
	l.ApprovedBy = &approverID
	l.Touch()
	l.RecordEvent(NewLeaveApprovedEvent(l.ID, l.WorkerID, approverID))
	return nil
}

func (l *Leave) Reject(approverID uuid.UUID) error {
	if l.Status != LeaveStatusPending {
		return errors.New("only pending leave requests can be rejected")
	}
	l.Status = LeaveStatusRejected
	l.ApprovedBy = &approverID
	l.Touch()
	l.RecordEvent(NewLeaveRejectedEvent(l.ID, l.WorkerID, approverID))
	return nil
}

// ─── Overtime Request (Aggregate Root) ───────────────────────────────────────

type OvertimeStatus string

const (
	OvertimeStatusPending  OvertimeStatus = "pending"
	OvertimeStatusApproved OvertimeStatus = "approved"
	OvertimeStatusRejected OvertimeStatus = "rejected"
)

type Overtime struct {
	domain.AggregateRoot
	WorkerID   uuid.UUID
	Date       time.Time
	Hours      float64
	Status     OvertimeStatus
	Reason     string
	ApprovedBy *uuid.UUID
}

func NewOvertime(workerID uuid.UUID, date time.Time, hours float64, reason string) (*Overtime, error) {
	if date.IsZero() {
		return nil, errors.New("invalid overtime date")
	}
	if hours <= 0 || hours > 24 {
		return nil, errors.New("overtime hours must be greater than 0 and up to 24")
	}

	ot := &Overtime{
		WorkerID: workerID,
		Date:     date.UTC().Truncate(24 * time.Hour),
		Hours:    hours,
		Status:   OvertimeStatusPending,
		Reason:   strings.TrimSpace(reason),
	}
	ot.BaseEntity = domain.NewBaseEntity()
	ot.RecordEvent(NewOvertimeRequestedEvent(ot.ID, workerID, ot.Date, hours))
	return ot, nil
}

func (ot *Overtime) Approve(approverID uuid.UUID) error {
	if ot.Status != OvertimeStatusPending {
		return errors.New("only pending overtime requests can be approved")
	}
	ot.Status = OvertimeStatusApproved
	ot.ApprovedBy = &approverID
	ot.Touch()
	ot.RecordEvent(NewOvertimeApprovedEvent(ot.ID, ot.WorkerID, approverID, ot.Hours))
	return nil
}

func (ot *Overtime) Reject(approverID uuid.UUID) error {
	if ot.Status != OvertimeStatusPending {
		return errors.New("only pending overtime requests can be rejected")
	}
	ot.Status = OvertimeStatusRejected
	ot.ApprovedBy = &approverID
	ot.Touch()
	ot.RecordEvent(NewOvertimeRejectedEvent(ot.ID, ot.WorkerID, approverID))
	return nil
}
