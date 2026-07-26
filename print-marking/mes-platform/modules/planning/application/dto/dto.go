package dto

import (
	"time"

	"github.com/google/uuid"
)

// ─── Shift Template DTOs ─────────────────────────────────────────────────────

type CreateShiftTemplateRequest struct {
	Code        string `json:"code" binding:"required,min=2,max=50"`
	Name        string `json:"name" binding:"required,min=2,max=100"`
	Description string `json:"description" binding:"max=255"`
	StartTime   string `json:"start_time" binding:"required,datetime=15:04"` // HH:MM
	EndTime     string `json:"end_time" binding:"required,datetime=15:04"`   // HH:MM
	BreakStart  string `json:"break_start" binding:"omitempty,datetime=15:04"` // HH:MM
	BreakEnd    string `json:"break_end" binding:"omitempty,datetime=15:04"`   // HH:MM
	CrossDay    bool   `json:"cross_day"`
	Color       string `json:"color"`
	Status      string `json:"status" binding:"omitempty,oneof=active inactive"`
}

type UpdateShiftTemplateRequest struct {
	Code        string `json:"code" binding:"required,min=2,max=50"`
	Name        string `json:"name" binding:"required,min=2,max=100"`
	Description string `json:"description" binding:"max=255"`
	StartTime   string `json:"start_time" binding:"required,datetime=15:04"` // HH:MM
	EndTime     string `json:"end_time" binding:"required,datetime=15:04"`   // HH:MM
	BreakStart  string `json:"break_start" binding:"omitempty,datetime=15:04"` // HH:MM
	BreakEnd    string `json:"break_end" binding:"omitempty,datetime=15:04"`   // HH:MM
	CrossDay    bool   `json:"cross_day"`
	Color       string `json:"color"`
	Status      string `json:"status" binding:"omitempty,oneof=active inactive"`
}

type ShiftTemplateDTO struct {
	ID           uuid.UUID `json:"id"`
	Code         string    `json:"code"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	StartTime    string    `json:"start_time"`
	EndTime      string    `json:"end_time"`
	BreakStart   string    `json:"break_start"`
	BreakEnd     string    `json:"break_end"`
	WorkingHours float64   `json:"working_hours"`
	CrossDay     bool      `json:"cross_day"`
	Color        string    `json:"color"`
	Status       string    `json:"status"`
}

// ─── Daily Shift DTOs ────────────────────────────────────────────────────────

type CreateShiftRequest struct {
	ShiftTemplateID string `json:"shift_template_id" binding:"required,uuid"`
	Date            string `json:"date" binding:"required,datetime=2006-01-02"` // YYYY-MM-DD
}

type AssignTeamRequest struct {
	TeamID string `json:"team_id" binding:"required,uuid"`
}

type AssignWorkerRequest struct {
	WorkerID string `json:"worker_id" binding:"required,uuid"`
	Role     string `json:"role" binding:"required,oneof=operator manager supervisor"`
}

type ShiftDTO struct {
	ID            uuid.UUID            `json:"id"`
	ShiftTemplate ShiftTemplateDTO     `json:"shift_template"`
	Date          time.Time            `json:"date"`
	Teams         []TeamAssignmentDTO   `json:"teams,omitempty"`
	Workers       []WorkerAssignmentDTO `json:"workers,omitempty"`
}

type TeamAssignmentDTO struct {
	ID        uuid.UUID `json:"id"`
	TeamID    uuid.UUID `json:"team_id"`
	CreatedAt time.Time `json:"created_at"`
}

type WorkerAssignmentDTO struct {
	ID        uuid.UUID `json:"id"`
	WorkerID  uuid.UUID `json:"worker_id"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// ─── Holiday DTOs ────────────────────────────────────────────────────────────

type CreateHolidayRequest struct {
	Date        string `json:"date" binding:"required,datetime=2006-01-02"` // YYYY-MM-DD
	Name        string `json:"name" binding:"required,min=2,max=100"`
	Description string `json:"description" binding:"max=255"`
}

type HolidayDTO struct {
	ID          uuid.UUID `json:"id"`
	Date        time.Time `json:"date"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
}

// ─── Leave Request DTOs ──────────────────────────────────────────────────────

type RequestLeaveRequest struct {
	WorkerID  string `json:"worker_id" binding:"required,uuid"`
	StartDate string `json:"start_date" binding:"required,datetime=2006-01-02"` // YYYY-MM-DD
	EndDate   string `json:"end_date" binding:"required,datetime=2006-01-02"`   // YYYY-MM-DD
	Reason    string `json:"reason" binding:"required,min=2,max=255"`
}

type ApproveRejectLeaveRequest struct {
	ApprovedBy string `json:"approved_by" binding:"required,uuid"`
}

type LeaveDTO struct {
	ID         uuid.UUID  `json:"id"`
	WorkerID   uuid.UUID  `json:"worker_id"`
	StartDate  time.Time  `json:"start_date"`
	EndDate    time.Time  `json:"end_date"`
	Status     string     `json:"status"`
	Reason     string     `json:"reason"`
	ApprovedBy *uuid.UUID `json:"approved_by,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// ─── Overtime Request DTOs ───────────────────────────────────────────────────

type RequestOvertimeRequest struct {
	WorkerID string  `json:"worker_id" binding:"required,uuid"`
	Date     string  `json:"date" binding:"required,datetime=2006-01-02"` // YYYY-MM-DD
	Hours    float64 `json:"hours" binding:"required,gt=0,lte=24"`
	Reason   string  `json:"reason" binding:"required,min=2,max=255"`
}

type ApproveRejectOvertimeRequest struct {
	ApprovedBy string `json:"approved_by" binding:"required,uuid"`
}

type OvertimeDTO struct {
	ID         uuid.UUID  `json:"id"`
	WorkerID   uuid.UUID  `json:"worker_id"`
	Date       time.Time  `json:"date"`
	Hours      float64    `json:"hours"`
	Status     string     `json:"status"`
	Reason     string     `json:"reason"`
	ApprovedBy *uuid.UUID `json:"approved_by,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// ─── Calendar & Scheduling DTOs ────────────────────────────────────────────────

type GenerateCalendarRequest struct {
	Year  int `json:"year" binding:"required,min=2020,max=2100"`
	Month int `json:"month" binding:"required,min=1,max=12"`
}

type BulkAssignRequest struct {
	Date            string   `json:"date" binding:"required,datetime=2006-01-02"` // YYYY-MM-DD
	WorkerIDs       []string `json:"worker_ids" binding:"required,gt=0,dive,uuid"`
	ShiftTemplateID string   `json:"shift_template_id" binding:"required,uuid"`
	Role            string   `json:"role" binding:"required,oneof=operator manager supervisor"`
}

type TeamAssignmentRequest struct {
	TeamID          string `json:"team_id" binding:"required,uuid"`
	ShiftTemplateID string `json:"shift_template_id" binding:"required,uuid"`
	StartDate       string `json:"start_date" binding:"required,datetime=2006-01-02"` // YYYY-MM-DD
	EndDate         string `json:"end_date" binding:"required,datetime=2006-01-02"`   // YYYY-MM-DD
}

type GridAssignmentDTO struct {
	ShiftID         uuid.UUID `json:"shift_id"`
	ShiftTemplateID uuid.UUID `json:"shift_template_id"`
	Code            string    `json:"code"`
	Name            string    `json:"name"`
	Color           string    `json:"color"`
	Role            string    `json:"role"`
	Type            string    `json:"type"` // "worker" or "team"
}

type WorkerScheduleGridRow struct {
	WorkerID     uuid.UUID                     `json:"worker_id"`
	FirstName    string                        `json:"first_name"`
	LastName     string                        `json:"last_name"`
	EmployeeCode string                        `json:"employee_code"`
	TeamID       *uuid.UUID                    `json:"team_id,omitempty"`
	TeamName     string                        `json:"team_name,omitempty"`
	WorkshopID   *uuid.UUID                    `json:"workshop_id,omitempty"`
	WorkshopName string                        `json:"workshop_name,omitempty"`
	Assignments  map[string]*GridAssignmentDTO `json:"assignments"` // key: YYYY-MM-DD
}

type ScheduleGridResponse struct {
	Year  int                     `json:"year"`
	Month int                     `json:"month"`
	Rows  []WorkerScheduleGridRow `json:"rows"`
}

// ─── Workforce Availability DTOs ──────────────────────────────────────────────

type WorkerAvailabilityDTO struct {
	WorkerID     uuid.UUID `json:"worker_id"`
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	EmployeeCode string    `json:"employee_code"`
	Status       string    `json:"status"`       // active, suspended
	Availability string    `json:"availability"` // available, busy, on_leave, suspended
	TodayShift   *string   `json:"today_shift,omitempty"`
	LeaveReason  *string   `json:"leave_reason,omitempty"`
	WeeklyHours  float64   `json:"weekly_hours"`
	Skills       []string  `json:"skills"`
}
