package entity_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/planning/domain/entity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnit_NewShiftTemplate_Success(t *testing.T) {
	tpl, err := entity.NewShiftTemplate("day_shift", "Day Shift", "Main day shift", "06:00", "14:00", "11:30", "12:00", false, "#00FF00", "active")
	require.NoError(t, err)
	require.NotNil(t, tpl)

	assert.Equal(t, "Day Shift", tpl.Name)
	assert.Equal(t, "06:00", tpl.StartTime)
	assert.Equal(t, "14:00", tpl.EndTime)
}

func TestUnit_NewShiftTemplate_InvalidTime(t *testing.T) {
	_, err := entity.NewShiftTemplate("invalid_start", "Invalid Start", "", "25:00", "14:00", "", "", false, "", "")
	assert.ErrorContains(t, err, "time format")

	_, err = entity.NewShiftTemplate("invalid_end", "Invalid End", "", "06:00", "08:60", "", "", false, "", "")
	assert.ErrorContains(t, err, "time format")

	_, err = entity.NewShiftTemplate("no_name", "", "", "06:00", "14:00", "", "", false, "", "")
	assert.ErrorContains(t, err, "name is required")
}

func TestUnit_NewShift_Success(t *testing.T) {
	tplID := uuid.New()
	date := time.Now().UTC()

	sh, err := entity.NewShift(tplID, date)
	require.NoError(t, err)
	require.NotNil(t, sh)

	assert.Equal(t, tplID, sh.ShiftTemplateID)
	assert.Equal(t, date.Truncate(24*time.Hour), sh.Date)

	events := sh.PullEvents()
	assert.Len(t, events, 1)
	assert.Equal(t, "mes.planning.ShiftCreated", events[0].EventName())
}

func TestUnit_Shift_AssignTeamAndWorker(t *testing.T) {
	tplID := uuid.New()
	sh, _ := entity.NewShift(tplID, time.Now())
	sh.PullEvents() // Clear creation event

	teamID := uuid.New()
	err := sh.AssignTeam(teamID)
	require.NoError(t, err)
	assert.Len(t, sh.Teams, 1)

	// Try assigning same team again
	err = sh.AssignTeam(teamID)
	assert.ErrorContains(t, err, "already assigned")

	workerID := uuid.New()
	err = sh.AssignWorker(workerID, "operator")
	require.NoError(t, err)
	assert.Len(t, sh.Workers, 1)
	assert.Equal(t, "operator", sh.Workers[0].Role)

	// Try assigning same worker again
	err = sh.AssignWorker(workerID, "manager")
	assert.ErrorContains(t, err, "already assigned")

	events := sh.PullEvents()
	assert.Len(t, events, 2)
	assert.Equal(t, "mes.planning.TeamAssignedToShift", events[0].EventName())
	assert.Equal(t, "mes.planning.WorkerAssignedToShift", events[1].EventName())
}

func TestUnit_NewHoliday(t *testing.T) {
	date := time.Now().UTC()
	h, err := entity.NewHoliday(date, "New Year", "First day of the year")
	require.NoError(t, err)
	require.NotNil(t, h)

	assert.Equal(t, "New Year", h.Name)
	assert.Equal(t, date.Truncate(24*time.Hour), h.Date)

	_, err = entity.NewHoliday(date, "", "no name")
	assert.ErrorContains(t, err, "name is required")
}

func TestUnit_Leave_ApproveReject(t *testing.T) {
	workerID := uuid.New()
	start := time.Now().UTC()
	end := start.Add(48 * time.Hour)

	leave, err := entity.NewLeave(workerID, start, end, "Medical checkup")
	require.NoError(t, err)
	assert.Equal(t, entity.LeaveStatusPending, leave.Status)

	events := leave.PullEvents()
	assert.Len(t, events, 1)
	assert.Equal(t, "mes.planning.LeaveRequested", events[0].EventName())

	approverID := uuid.New()

	// Approve
	err = leave.Approve(approverID)
	require.NoError(t, err)
	assert.Equal(t, entity.LeaveStatusApproved, leave.Status)
	assert.Equal(t, &approverID, leave.ApprovedBy)

	events2 := leave.PullEvents()
	assert.Len(t, events2, 1)
	assert.Equal(t, "mes.planning.LeaveApproved", events2[0].EventName())

	// Rejecting approved leave fails
	err = leave.Reject(approverID)
	assert.ErrorContains(t, err, "only pending")
}

func TestUnit_NewLeave_Validation(t *testing.T) {
	workerID := uuid.New()
	start := time.Now().UTC()
	end := start.Add(-24 * time.Hour) // End before start

	_, err := entity.NewLeave(workerID, start, end, "holiday")
	assert.ErrorContains(t, err, "cannot be before start")
}

func TestUnit_Overtime_ApproveReject(t *testing.T) {
	workerID := uuid.New()
	date := time.Now().UTC()

	ot, err := entity.NewOvertime(workerID, date, 4.5, "High workload")
	require.NoError(t, err)
	assert.Equal(t, 4.5, ot.Hours)
	assert.Equal(t, entity.OvertimeStatusPending, ot.Status)

	events := ot.PullEvents()
	assert.Len(t, events, 1)
	assert.Equal(t, "mes.planning.OvertimeRequested", events[0].EventName())

	approverID := uuid.New()

	// Reject
	err = ot.Reject(approverID)
	require.NoError(t, err)
	assert.Equal(t, entity.OvertimeStatusRejected, ot.Status)

	events2 := ot.PullEvents()
	assert.Len(t, events2, 1)
	assert.Equal(t, "mes.planning.OvertimeRejected", events2[0].EventName())
}

func TestUnit_NewOvertime_Validation(t *testing.T) {
	workerID := uuid.New()
	date := time.Now().UTC()

	_, err := entity.NewOvertime(workerID, date, -1, "negative hours")
	assert.ErrorContains(t, err, "greater than 0")

	_, err = entity.NewOvertime(workerID, date, 25, "too many hours")
	assert.ErrorContains(t, err, "up to 24")
}
