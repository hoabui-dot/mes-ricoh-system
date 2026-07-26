package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Domain Events ────────────────────────────────────────────────────────────
// All planning domain events follow the naming convention: mes.planning.<EventName>

type ShiftCreatedEvent struct {
	domain.BaseDomainEvent
	ShiftID         uuid.UUID `json:"shift_id"`
	ShiftTemplateID uuid.UUID `json:"shift_template_id"`
	Date            time.Time `json:"date"`
}

func NewShiftCreatedEvent(shiftID, tplID uuid.UUID, date time.Time) ShiftCreatedEvent {
	return ShiftCreatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.ShiftCreated"),
		ShiftID:         shiftID,
		ShiftTemplateID: tplID,
		Date:            date,
	}
}

type TeamAssignedToShiftEvent struct {
	domain.BaseDomainEvent
	ShiftID uuid.UUID `json:"shift_id"`
	TeamID  uuid.UUID `json:"team_id"`
}

func NewTeamAssignedToShiftEvent(shiftID, teamID uuid.UUID) TeamAssignedToShiftEvent {
	return TeamAssignedToShiftEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.TeamAssignedToShift"),
		ShiftID:         shiftID,
		TeamID:          teamID,
	}
}

type WorkerAssignedToShiftEvent struct {
	domain.BaseDomainEvent
	ShiftID  uuid.UUID `json:"shift_id"`
	WorkerID uuid.UUID `json:"worker_id"`
	Role     string    `json:"role"`
}

func NewWorkerAssignedToShiftEvent(shiftID, workerID uuid.UUID, role string) WorkerAssignedToShiftEvent {
	return WorkerAssignedToShiftEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.WorkerAssignedToShift"),
		ShiftID:         shiftID,
		WorkerID:        workerID,
		Role:            role,
	}
}

type WorkerRemovedFromShiftEvent struct {
	domain.BaseDomainEvent
	ShiftID  uuid.UUID `json:"shift_id"`
	WorkerID uuid.UUID `json:"worker_id"`
}

func NewWorkerRemovedFromShiftEvent(shiftID, workerID uuid.UUID) WorkerRemovedFromShiftEvent {
	return WorkerRemovedFromShiftEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.WorkerRemovedFromShift"),
		ShiftID:         shiftID,
		WorkerID:        workerID,
	}
}

type TeamRemovedFromShiftEvent struct {
	domain.BaseDomainEvent
	ShiftID uuid.UUID `json:"shift_id"`
	TeamID  uuid.UUID `json:"team_id"`
}

func NewTeamRemovedFromShiftEvent(shiftID, teamID uuid.UUID) TeamRemovedFromShiftEvent {
	return TeamRemovedFromShiftEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.TeamRemovedFromShift"),
		ShiftID:         shiftID,
		TeamID:          teamID,
	}
}

type ScheduleUpdatedEvent struct {
	domain.BaseDomainEvent
	Date      time.Time `json:"date"`
	Details   string    `json:"details"`
}

func NewScheduleUpdatedEvent(date time.Time, details string) ScheduleUpdatedEvent {
	return ScheduleUpdatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.ScheduleUpdated"),
		Date:            date,
		Details:         details,
	}
}

type LeaveRequestedEvent struct {
	domain.BaseDomainEvent
	LeaveID   uuid.UUID `json:"leave_id"`
	WorkerID  uuid.UUID `json:"worker_id"`
	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`
}

func NewLeaveRequestedEvent(leaveID, workerID uuid.UUID, start, end time.Time) LeaveRequestedEvent {
	return LeaveRequestedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.LeaveRequested"),
		LeaveID:         leaveID,
		WorkerID:        workerID,
		StartDate:       start,
		EndDate:         end,
	}
}

type LeaveApprovedEvent struct {
	domain.BaseDomainEvent
	LeaveID    uuid.UUID `json:"leave_id"`
	WorkerID   uuid.UUID `json:"worker_id"`
	ApprovedBy uuid.UUID `json:"approved_by"`
}

func NewLeaveApprovedEvent(leaveID, workerID, approvedBy uuid.UUID) LeaveApprovedEvent {
	return LeaveApprovedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.LeaveApproved"),
		LeaveID:         leaveID,
		WorkerID:        workerID,
		ApprovedBy:      approvedBy,
	}
}

type LeaveRejectedEvent struct {
	domain.BaseDomainEvent
	LeaveID    uuid.UUID `json:"leave_id"`
	WorkerID   uuid.UUID `json:"worker_id"`
	RejectedBy uuid.UUID `json:"rejected_by"`
}

func NewLeaveRejectedEvent(leaveID, workerID, rejectedBy uuid.UUID) LeaveRejectedEvent {
	return LeaveRejectedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.LeaveRejected"),
		LeaveID:         leaveID,
		WorkerID:        workerID,
		RejectedBy:      rejectedBy,
	}
}

type OvertimeRequestedEvent struct {
	domain.BaseDomainEvent
	OvertimeID uuid.UUID `json:"overtime_id"`
	WorkerID   uuid.UUID `json:"worker_id"`
	Date       time.Time `json:"date"`
	Hours      float64   `json:"hours"`
}

func NewOvertimeRequestedEvent(otID, workerID uuid.UUID, date time.Time, hours float64) OvertimeRequestedEvent {
	return OvertimeRequestedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.OvertimeRequested"),
		OvertimeID:      otID,
		WorkerID:        workerID,
		Date:            date,
		Hours:           hours,
	}
}

type OvertimeApprovedEvent struct {
	domain.BaseDomainEvent
	OvertimeID uuid.UUID `json:"overtime_id"`
	WorkerID   uuid.UUID `json:"worker_id"`
	ApprovedBy uuid.UUID `json:"approved_by"`
	Hours      float64   `json:"hours"`
}

func NewOvertimeApprovedEvent(otID, workerID, approvedBy uuid.UUID, hours float64) OvertimeApprovedEvent {
	return OvertimeApprovedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.OvertimeApproved"),
		OvertimeID:      otID,
		WorkerID:        workerID,
		ApprovedBy:      approvedBy,
		Hours:           hours,
	}
}

type OvertimeRejectedEvent struct {
	domain.BaseDomainEvent
	OvertimeID uuid.UUID `json:"overtime_id"`
	WorkerID   uuid.UUID `json:"worker_id"`
	RejectedBy uuid.UUID `json:"rejected_by"`
}

func NewOvertimeRejectedEvent(otID, workerID, rejectedBy uuid.UUID) OvertimeRejectedEvent {
	return OvertimeRejectedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.planning.OvertimeRejected"),
		OvertimeID:      otID,
		WorkerID:        workerID,
		RejectedBy:      rejectedBy,
	}
}
