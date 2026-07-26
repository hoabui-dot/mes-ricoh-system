package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/planning/application/dto"
	"github.com/nd/mes-platform/modules/planning/application/service"
	"github.com/nd/mes-platform/modules/planning/domain/repository"
	"github.com/nd/mes-platform/modules/planning/infrastructure/model"
	"github.com/nd/mes-platform/modules/planning/infrastructure/persistence"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/outbox"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type MockOutboxRepository struct {
	Events []*outbox.Event
}

func (m *MockOutboxRepository) Save(ctx context.Context, event *outbox.Event) error {
	m.Events = append(m.Events, event)
	return nil
}

func setupPlanningSvc(t *testing.T) (*gorm.DB, *MockOutboxRepository, *service.PlanningService) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(
		&model.ShiftTemplateModel{},
		&model.ShiftModel{},
		&model.TeamAssignmentModel{},
		&model.WorkerAssignmentModel{},
		&model.HolidayModel{},
		&model.LeaveModel{},
		&model.OvertimeModel{},
		&model.OutboxEventModel{},
	)
	require.NoError(t, err)

	shiftRepo := persistence.NewGormShiftRepository(db)
	templateRepo := persistence.NewGormShiftTemplateRepository(db)
	holidayRepo := persistence.NewGormHolidayRepository(db)
	leaveRepo := persistence.NewGormLeaveRepository(db)
	overtimeRepo := persistence.NewGormOvertimeRepository(db)
	outboxRepo := &MockOutboxRepository{}

	log := logger.NewNop()

	svc := service.NewPlanningService(
		db,
		shiftRepo,
		templateRepo,
		holidayRepo,
		leaveRepo,
		overtimeRepo,
		outboxRepo,
		log,
	)

	return db, outboxRepo, svc
}

func TestPlanningService_CreateShiftTemplate(t *testing.T) {
	_, _, svc := setupPlanningSvc(t)

	req := dto.CreateShiftTemplateRequest{
		Code:      "morning_shift",
		Name:      "Morning Shift",
		StartTime: "06:00",
		EndTime:   "14:00",
	}

	tpl, err := svc.CreateShiftTemplate(context.Background(), req)
	require.NoError(t, err)
	require.NotNil(t, tpl)

	assert.Equal(t, "Morning Shift", tpl.Name)
	assert.Equal(t, "06:00", tpl.StartTime)

	// Test conflict
	_, err = svc.CreateShiftTemplate(context.Background(), req)
	assert.ErrorIs(t, err, service.ErrConflict)
}

func TestPlanningService_CreateShift_Success(t *testing.T) {
	_, outboxRepo, svc := setupPlanningSvc(t)

	// Create Template
	tpl, err := svc.CreateShiftTemplate(context.Background(), dto.CreateShiftTemplateRequest{
		Code:      "night_shift",
		Name:      "Night",
		StartTime: "22:00",
		EndTime:   "06:00",
		CrossDay:  true,
	})
	require.NoError(t, err)

	outboxRepo.Events = nil

	// Create daily shift
	req := dto.CreateShiftRequest{
		ShiftTemplateID: tpl.ID.String(),
		Date:            "2026-07-01",
	}
	sh, err := svc.CreateShift(context.Background(), req)
	require.NoError(t, err)

	assert.Equal(t, tpl.ID, sh.ShiftTemplate.ID)
	assert.Equal(t, "2026-07-01T00:00:00Z", sh.Date.Format(time.RFC3339))

	// Verify outbox
	assert.Len(t, outboxRepo.Events, 1)
	assert.Equal(t, "mes.planning.ShiftCreated", outboxRepo.Events[0].EventName)
}

func TestPlanningService_AssignWorker_OverlapLeave(t *testing.T) {
	_, _, svc := setupPlanningSvc(t)

	tpl, err := svc.CreateShiftTemplate(context.Background(), dto.CreateShiftTemplateRequest{
		Code:      "morning_shift",
		Name:      "Morning",
		StartTime: "06:00",
		EndTime:   "14:00",
	})
	require.NoError(t, err)

	// Create shift for 2026-07-05
	sh, err := svc.CreateShift(context.Background(), dto.CreateShiftRequest{
		ShiftTemplateID: tpl.ID.String(),
		Date:            "2026-07-05",
	})
	require.NoError(t, err)

	workerID := uuid.New()

	// 1. Worker requests leave for 2026-07-04 to 2026-07-06
	leave, err := svc.RequestLeave(context.Background(), dto.RequestLeaveRequest{
		WorkerID:  workerID.String(),
		StartDate: "2026-07-04",
		EndDate:   "2026-07-06",
		Reason:    "Sick leave",
	})
	require.NoError(t, err)

	// Approve leave
	adminID := uuid.New()
	err = svc.ApproveLeave(context.Background(), leave.ID, dto.ApproveRejectLeaveRequest{ApprovedBy: adminID.String()})
	require.NoError(t, err)

	// 2. Assign worker to shift — should fail since worker is on approved leave
	err = svc.AssignWorkerToShift(context.Background(), sh.ID, dto.AssignWorkerRequest{
		WorkerID: workerID.String(),
		Role:     "operator",
	})
	assert.ErrorIs(t, err, service.ErrWorkerOnLeave)
}

func TestPlanningService_Leave_RequestOverlapConflict(t *testing.T) {
	_, _, svc := setupPlanningSvc(t)

	workerID := uuid.New()

	// Request leave 1
	_, err := svc.RequestLeave(context.Background(), dto.RequestLeaveRequest{
		WorkerID:  workerID.String(),
		StartDate: "2026-07-10",
		EndDate:   "2026-07-15",
		Reason:    "Vacation",
	})
	require.NoError(t, err)

	// Request leave 2 (overlapping range)
	_, err = svc.RequestLeave(context.Background(), dto.RequestLeaveRequest{
		WorkerID:  workerID.String(),
		StartDate: "2026-07-14",
		EndDate:   "2026-07-20",
		Reason:    "Medical check",
	})
	assert.ErrorIs(t, err, service.ErrConflict)
}

func TestPlanningService_Overtime_Workflow(t *testing.T) {
	_, outboxRepo, svc := setupPlanningSvc(t)

	workerID := uuid.New()

	// Request overtime
	ot, err := svc.RequestOvertime(context.Background(), dto.RequestOvertimeRequest{
		WorkerID: workerID.String(),
		Date:     "2026-07-01",
		Hours:    4.00,
		Reason:   "Urgent printing work",
	})
	require.NoError(t, err)
	assert.Equal(t, "pending", ot.Status)

	outboxRepo.Events = nil

	// Approve overtime
	adminID := uuid.New()
	err = svc.ApproveOvertime(context.Background(), ot.ID, dto.ApproveRejectOvertimeRequest{ApprovedBy: adminID.String()})
	require.NoError(t, err)

	// Fetch to verify approved status
	list, _, err := svc.ListOvertimes(context.Background(), repository.OvertimeFilter{WorkerID: &workerID})
	require.NoError(t, err)
	assert.Len(t, list, 1)
	assert.Equal(t, "approved", list[0].Status)
	assert.Equal(t, adminID, *list[0].ApprovedBy)

	// Check domain event
	assert.Len(t, outboxRepo.Events, 1)
	assert.Equal(t, "mes.planning.OvertimeApproved", outboxRepo.Events[0].EventName)
}
