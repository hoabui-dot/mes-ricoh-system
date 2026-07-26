package service_test

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/assignment/application/dto"
	"github.com/nd/mes-platform/modules/assignment/application/service"
	"github.com/nd/mes-platform/modules/assignment/application/service/scoring"
	"github.com/nd/mes-platform/modules/assignment/domain/repository"
	"github.com/nd/mes-platform/modules/assignment/infrastructure/model"
	"github.com/nd/mes-platform/modules/assignment/infrastructure/persistence"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/outbox"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ─── Test Doubles ──────────────────────────────────────────────────────────────

type MockOutboxRepository struct {
	Events []*outbox.Event
}

func (m *MockOutboxRepository) Save(_ context.Context, ev *outbox.Event) error {
	m.Events = append(m.Events, ev)
	return nil
}

type MockWorkerQuery struct {
	Workers []scoring.WorkerCandidate
}

func (m *MockWorkerQuery) FindCandidates(_ context.Context) ([]scoring.WorkerCandidate, error) {
	return m.Workers, nil
}

func (m *MockWorkerQuery) FindWorkersByIDs(_ context.Context, ids []uuid.UUID) ([]scoring.WorkerCandidate, error) {
	result := make([]scoring.WorkerCandidate, 0)
	for _, w := range m.Workers {
		for _, id := range ids {
			if w.WorkerID == id.String() {
				result = append(result, w)
			}
		}
	}
	return result, nil
}

type MockOperationQuery struct {
	Operation *scoring.RequiredOperation
}

func (m *MockOperationQuery) FindOperation(_ context.Context, _ uuid.UUID) (*scoring.RequiredOperation, error) {
	if m.Operation == nil {
		return &scoring.RequiredOperation{
			RequiredSkills: []string{"LO1"},
			MinOperators:   1,
			MaxOperators:   3,
			Priority:       80,
		}, nil
	}
	return m.Operation, nil
}

// ─── Setup ────────────────────────────────────────────────────────────────────

type testEnv struct {
	db         *gorm.DB
	outboxRepo *MockOutboxRepository
	workerQ    *MockWorkerQuery
	operationQ *MockOperationQuery
	svc        *service.AssignmentService
}

func setupEnv(t *testing.T) *testEnv {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(
		&model.AssignmentModel{},
		&model.AssignedWorkerModel{},
		&model.OutboxEventModel{},
	)
	require.NoError(t, err)

	workerID := uuid.New()
	outboxRepo := &MockOutboxRepository{}
	workerQ := &MockWorkerQuery{
		Workers: []scoring.WorkerCandidate{
			{
				WorkerID:     workerID.String(),
				WorkerName:   "Alice Smith",
				Skills:       []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 4}},
				IsAvailable:  true,
				CertifiedFor: []string{"LO1"},
			},
			{
				WorkerID:    uuid.New().String(),
				WorkerName:  "Bob Jones",
				Skills:      []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 2}},
				IsAvailable: true,
			},
		},
	}
	operationQ := &MockOperationQuery{}

	assignmentRepo := persistence.NewGormAssignmentRepository(db)
	log := logger.NewNop()
	svc := service.NewAssignmentService(assignmentRepo, outboxRepo, workerQ, operationQ, log)

	return &testEnv{db: db, outboxRepo: outboxRepo, workerQ: workerQ, operationQ: operationQ, svc: svc}
}

// ─── Tests ────────────────────────────────────────────────────────────────────

func TestAssignmentService_ProposeAssignment_AutoScore(t *testing.T) {
	env := setupEnv(t)

	req := dto.ProposeAssignmentRequest{
		WorkOrderID: uuid.New().String(),
		OperationID: uuid.New().String(),
		Notes:       "auto assignment",
	}
	a, err := env.svc.ProposeAssignment(context.Background(), req)
	require.NoError(t, err)
	assert.Equal(t, "proposed", a.Status)
	assert.Equal(t, 1, a.Revision)
	assert.Equal(t, "system", a.ProposedBy)
	assert.NotEmpty(t, a.Workers)
	assert.Greater(t, a.Score, 0.0)

	// Event emitted
	require.Len(t, env.outboxRepo.Events, 1)
	assert.Equal(t, "mes.assignment.AssignmentProposed", env.outboxRepo.Events[0].EventName)
}

func TestAssignmentService_ProposeAssignment_ManualSelection(t *testing.T) {
	env := setupEnv(t)
	workerID := env.workerQ.Workers[0].WorkerID

	req := dto.ProposeAssignmentRequest{
		WorkOrderID: uuid.New().String(),
		OperationID: uuid.New().String(),
		WorkerIDs:   []string{workerID},
		Notes:       "manual selection",
	}
	a, err := env.svc.ProposeAssignment(context.Background(), req)
	require.NoError(t, err)
	require.Len(t, a.Workers, 1)
	assert.Equal(t, workerID, a.Workers[0].WorkerID.String())
}

func TestAssignmentService_Approve(t *testing.T) {
	env := setupEnv(t)

	proposed, _ := env.svc.ProposeAssignment(context.Background(), dto.ProposeAssignmentRequest{
		WorkOrderID: uuid.New().String(),
		OperationID: uuid.New().String(),
	})
	env.outboxRepo.Events = nil

	reviewerID := uuid.New()
	err := env.svc.ApproveAssignment(context.Background(), proposed.ID, dto.ApproveAssignmentRequest{
		ReviewerID: reviewerID.String(),
	})
	require.NoError(t, err)

	got, _ := env.svc.GetAssignment(context.Background(), proposed.ID)
	assert.Equal(t, "approved", got.Status)
	assert.Equal(t, &reviewerID, got.ReviewedBy)

	require.Len(t, env.outboxRepo.Events, 1)
	assert.Equal(t, "mes.assignment.AssignmentApproved", env.outboxRepo.Events[0].EventName)
}

func TestAssignmentService_Reject(t *testing.T) {
	env := setupEnv(t)

	proposed, _ := env.svc.ProposeAssignment(context.Background(), dto.ProposeAssignmentRequest{
		WorkOrderID: uuid.New().String(),
		OperationID: uuid.New().String(),
	})
	env.outboxRepo.Events = nil

	err := env.svc.RejectAssignment(context.Background(), proposed.ID, dto.RejectAssignmentRequest{
		ReviewerID: uuid.New().String(),
		Reason:     "Workers not available for this shift",
	})
	require.NoError(t, err)

	got, _ := env.svc.GetAssignment(context.Background(), proposed.ID)
	assert.Equal(t, "rejected", got.Status)
	assert.Equal(t, "Workers not available for this shift", got.Notes)

	require.Len(t, env.outboxRepo.Events, 1)
	assert.Equal(t, "mes.assignment.AssignmentRejected", env.outboxRepo.Events[0].EventName)
}

func TestAssignmentService_Override_CreatesNewRevision(t *testing.T) {
	env := setupEnv(t)

	woID := uuid.New().String()
	opID := uuid.New().String()

	// Revision 1
	rev1, err := env.svc.ProposeAssignment(context.Background(), dto.ProposeAssignmentRequest{
		WorkOrderID: woID,
		OperationID: opID,
	})
	require.NoError(t, err)
	assert.Equal(t, 1, rev1.Revision)
	env.outboxRepo.Events = nil

	// Override → creates revision 2
	reviewerID := uuid.New()
	workerID := env.workerQ.Workers[1].WorkerID // pick the other worker

	rev2, err := env.svc.OverrideAssignment(context.Background(), rev1.ID, dto.OverrideAssignmentRequest{
		ReviewerID: reviewerID.String(),
		WorkerIDs:  []string{workerID},
		Notes:      "Manager override: different worker needed",
	})
	require.NoError(t, err)
	assert.Equal(t, 2, rev2.Revision)
	assert.Equal(t, "proposed", rev2.Status)

	// Old revision is now overridden
	oldAssignment, _ := env.svc.GetAssignment(context.Background(), rev1.ID)
	assert.Equal(t, "overridden", oldAssignment.Status)

	require.Len(t, env.outboxRepo.Events, 1)
	assert.Equal(t, "mes.assignment.AssignmentOverridden", env.outboxRepo.Events[0].EventName)
}

func TestAssignmentService_GetHistory_AllRevisions(t *testing.T) {
	env := setupEnv(t)

	woID := uuid.New()
	opID := uuid.New()

	// Create revision 1
	rev1, err := env.svc.ProposeAssignment(context.Background(), dto.ProposeAssignmentRequest{
		WorkOrderID: woID.String(),
		OperationID: opID.String(),
	})
	require.NoError(t, err)

	// Override → revision 2
	_, err = env.svc.OverrideAssignment(context.Background(), rev1.ID, dto.OverrideAssignmentRequest{
		ReviewerID: uuid.New().String(),
		WorkerIDs:  []string{env.workerQ.Workers[0].WorkerID},
		Notes:      "Override",
	})
	require.NoError(t, err)

	// History should show 2 revisions (newest first)
	history, err := env.svc.GetAssignmentHistory(context.Background(), woID, opID)
	require.NoError(t, err)
	assert.Equal(t, woID, history.WorkOrderID)
	assert.Len(t, history.Revisions, 2)
	assert.Equal(t, 2, history.Revisions[0].Revision, "newest revision first")
	assert.Equal(t, 1, history.Revisions[1].Revision)
}

func TestAssignmentService_List_FilterByStatus(t *testing.T) {
	env := setupEnv(t)

	// Create two proposals
	env.svc.ProposeAssignment(context.Background(), dto.ProposeAssignmentRequest{
		WorkOrderID: uuid.New().String(), OperationID: uuid.New().String(),
	})
	proposed2, _ := env.svc.ProposeAssignment(context.Background(), dto.ProposeAssignmentRequest{
		WorkOrderID: uuid.New().String(), OperationID: uuid.New().String(),
	})

	// Approve one
	env.svc.ApproveAssignment(context.Background(), proposed2.ID, dto.ApproveAssignmentRequest{
		ReviewerID: uuid.New().String(),
	})

	// Filter by proposed
	proposed, total, err := env.svc.ListAssignments(context.Background(), repository.AssignmentFilter{Status: "proposed"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "proposed", proposed[0].Status)

	// Filter by approved
	approved, total, err := env.svc.ListAssignments(context.Background(), repository.AssignmentFilter{Status: "approved"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "approved", approved[0].Status)
}

func TestAssignmentService_WorkerHistory_Immutable(t *testing.T) {
	env := setupEnv(t)

	woID := uuid.New().String()
	opID := uuid.New().String()

	rev1, _ := env.svc.ProposeAssignment(context.Background(), dto.ProposeAssignmentRequest{
		WorkOrderID: woID,
		OperationID: opID,
	})
	originalWorkerCount := len(rev1.Workers)

	// Approve then reload — workers must not change
	env.svc.ApproveAssignment(context.Background(), rev1.ID, dto.ApproveAssignmentRequest{
		ReviewerID: uuid.New().String(),
	})

	got, err := env.svc.GetAssignment(context.Background(), rev1.ID)
	require.NoError(t, err)
	assert.Len(t, got.Workers, originalWorkerCount, "worker history must be immutable after approval")
}
