package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/nd/mes-platform/modules/workforce/application/dto"
	"github.com/nd/mes-platform/modules/workforce/application/service"
	"github.com/nd/mes-platform/modules/workforce/infrastructure/model"
	"github.com/nd/mes-platform/modules/workforce/infrastructure/persistence"
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

func setupWorkforceSvc(t *testing.T) (*gorm.DB, *MockOutboxRepository, *service.WorkforceService) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(
		&model.DepartmentModel{},
		&model.WorkshopModel{},
		&model.TeamModel{},
		&model.WorkerModel{},
		&model.SkillModel{},
		&model.SkillMatrixModel{},
		&model.CertificateModel{},
		&model.OutboxEventModel{},
	)
	require.NoError(t, err)

	workerRepo := persistence.NewGormWorkerRepository(db)
	orgRepo := persistence.NewGormOrgRepository(db)
	skillRepo := persistence.NewGormSkillRepository(db)
	certRepo := persistence.NewGormCertificateRepository(db)
	outboxRepo := &MockOutboxRepository{}

	log := logger.NewNop()

	svc := service.NewWorkforceService(
		workerRepo,
		orgRepo,
		skillRepo,
		certRepo,
		outboxRepo,
		log,
	)

	return db, outboxRepo, svc
}

func TestWorkforceService_CreateWorker_Success(t *testing.T) {
	_, outboxRepo, svc := setupWorkforceSvc(t)

	// Create Dept, Workshop and Team first
	dept, err := svc.CreateDepartment(context.Background(), dto.CreateDepartmentRequest{
		Code: "DEPT1",
		Name: "Production",
	})
	require.NoError(t, err)

	ws, err := svc.CreateWorkshop(context.Background(), dept.ID, dto.CreateWorkshopRequest{
		Code: "WS1",
		Name: "Assembly Line 1",
	})
	require.NoError(t, err)

	team, err := svc.CreateTeam(context.Background(), ws.ID, dto.CreateTeamRequest{
		Code: "TEAM1",
		Name: "Team Alpha",
	})
	require.NoError(t, err)

	deptIDStr := dept.ID.String()
	wsIDStr := ws.ID.String()
	teamIDStr := team.ID.String()

	req := dto.CreateWorkerRequest{
		FirstName:    "Alice",
		LastName:     "Smith",
		Email:        "alice.smith@example.com",
		EmployeeCode: "EMP001",
		Phone:        "12345678",
		DepartmentID: &deptIDStr,
		WorkshopID:   &wsIDStr,
		TeamID:       &teamIDStr,
	}

	outboxRepo.Events = nil

	w, err := svc.CreateWorker(context.Background(), req)
	require.NoError(t, err)
	require.NotNil(t, w)

	assert.Equal(t, "Alice", w.FirstName)
	assert.Equal(t, "Smith", w.LastName)
	assert.Equal(t, "alice.smith@example.com", w.Email)
	assert.Equal(t, "EMP001", w.EmployeeCode)
	assert.Equal(t, dept.ID, *w.DepartmentID)
	assert.Equal(t, ws.ID, *w.WorkshopID)
	assert.Equal(t, team.ID, *w.TeamID)
	assert.Equal(t, "active", w.Status)
	assert.Equal(t, "available", w.Availability)

	// Check domain event in outbox
	assert.Len(t, outboxRepo.Events, 1)
	assert.Equal(t, "mes.workforce.WorkerCreated", outboxRepo.Events[0].EventName)
}

func TestWorkforceService_CreateWorker_Conflict(t *testing.T) {
	_, _, svc := setupWorkforceSvc(t)

	req := dto.CreateWorkerRequest{
		FirstName:    "Alice",
		LastName:     "Smith",
		Email:        "alice@example.com",
		EmployeeCode: "EMP001",
	}
	_, err := svc.CreateWorker(context.Background(), req)
	require.NoError(t, err)

	// Duplicate code
	reqDupCode := dto.CreateWorkerRequest{
		FirstName:    "Bob",
		LastName:     "Jones",
		Email:        "bob@example.com",
		EmployeeCode: "EMP001",
	}
	_, err = svc.CreateWorker(context.Background(), reqDupCode)
	assert.ErrorIs(t, err, service.ErrConflict)

	// Duplicate email
	reqDupEmail := dto.CreateWorkerRequest{
		FirstName:    "Bob",
		LastName:     "Jones",
		Email:        "alice@example.com",
		EmployeeCode: "EMP002",
	}
	_, err = svc.CreateWorker(context.Background(), reqDupEmail)
	assert.ErrorIs(t, err, service.ErrConflict)
}

func TestWorkforceService_UpdateWorkerSkills(t *testing.T) {
	_, outboxRepo, svc := setupWorkforceSvc(t)

	// Register Worker
	w, err := svc.CreateWorker(context.Background(), dto.CreateWorkerRequest{
		FirstName:    "Alice",
		LastName:     "Smith",
		Email:        "alice@example.com",
		EmployeeCode: "EMP001",
	})
	require.NoError(t, err)

	// Create Skills
	s1, err := svc.CreateSkill(context.Background(), dto.CreateSkillRequest{Name: "Laser Oper", Code: "LO1"})
	require.NoError(t, err)
	s2, err := svc.CreateSkill(context.Background(), dto.CreateSkillRequest{Name: "Zebra Print", Code: "ZP1"})
	require.NoError(t, err)

	outboxRepo.Events = nil

	// Update Skills
	req := dto.UpdateSkillsRequest{
		Skills: []dto.SkillMatrixItem{
			{SkillID: s1.ID.String(), ProficiencyLevel: 3},
			{SkillID: s2.ID.String(), ProficiencyLevel: 1},
		},
	}
	err = svc.UpdateWorkerSkills(context.Background(), w.ID, req)
	require.NoError(t, err)

	// Fetch worker to verify
	got, err := svc.GetWorker(context.Background(), w.ID)
	require.NoError(t, err)
	assert.Len(t, got.Skills, 2)

	// Find LO1 skill regardless of return order
	var lo1Found bool
	for _, sk := range got.Skills {
		if sk.SkillCode == "LO1" {
			assert.Equal(t, 3, sk.ProficiencyLevel)
			lo1Found = true
		}
	}
	assert.True(t, lo1Found, "LO1 skill not found in worker skills")

	// Check domain events
	var found bool
	for _, e := range outboxRepo.Events {
		if e.EventName == "mes.workforce.WorkerSkillsUpdated" {
			found = true
		}
	}
	assert.True(t, found, "WorkerSkillsUpdated event not found")
}

func TestWorkforceService_AddCertificate(t *testing.T) {
	_, outboxRepo, svc := setupWorkforceSvc(t)

	w, err := svc.CreateWorker(context.Background(), dto.CreateWorkerRequest{
		FirstName:    "Alice",
		LastName:     "Smith",
		Email:        "alice@example.com",
		EmployeeCode: "EMP001",
	})
	require.NoError(t, err)

	outboxRepo.Events = nil

	issued := time.Now().UTC().Format(time.RFC3339)
	expires := time.Now().UTC().Add(365 * 24 * time.Hour).Format(time.RFC3339)

	req := dto.AddCertificateRequest{
		Name:              "Laser Cert",
		IssuingAuthority:  "Ministry of Laser",
		CertificateNumber: "CERT-9998",
		IssuedAt:          issued,
		ExpiresAt:         expires,
		DocumentURL:       "http://url.com/cert",
	}

	cert, err := svc.AddCertificate(context.Background(), w.ID, req)
	require.NoError(t, err)
	require.NotNil(t, cert)

	assert.Equal(t, "Laser Cert", cert.Name)
	assert.Equal(t, "CERT-9998", cert.CertificateNumber)
	assert.False(t, cert.IsExpired)

	// Verify outbox event contains CertificateAdded
	var found bool
	for _, e := range outboxRepo.Events {
		if e.EventName == "mes.workforce.CertificateAdded" {
			found = true
		}
	}
	assert.True(t, found, "CertificateAdded event not found")

	// List certificates
	list, err := svc.ListWorkerCertificates(context.Background(), w.ID)
	require.NoError(t, err)
	assert.Len(t, list, 1)
	assert.Equal(t, "Laser Cert", list[0].Name)
}
