package entity_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/workforce/domain/entity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnit_NewWorker_Success(t *testing.T) {
	userID := uuid.New()
	deptID := uuid.New()
	wsID := uuid.New()
	teamID := uuid.New()

	w, err := entity.NewWorker(
		&userID,
		"John",
		"Doe",
		"john.doe@example.com",
		"1234567890",
		"EMP123",
		"N123",
		"http://avatar",
		"male",
		nil,
		"123 Street",
		nil,
		&deptID,
		&wsID,
		&teamID,
		"Operator",
		"Some notes",
	)
	require.NoError(t, err)
	require.NotNil(t, w)

	assert.Equal(t, "John", w.FirstName)
	assert.Equal(t, "Doe", w.LastName)
	assert.Equal(t, "john.doe@example.com", w.Email)
	assert.Equal(t, "1234567890", w.Phone)
	assert.Equal(t, "EMP123", w.EmployeeCode)
	assert.Equal(t, "N123", w.EmployeeNumber)
	assert.Equal(t, "http://avatar", w.Avatar)
	assert.Equal(t, "male", w.Gender)
	assert.Equal(t, "123 Street", w.Address)
	assert.Equal(t, &deptID, w.DepartmentID)
	assert.Equal(t, &wsID, w.WorkshopID)
	assert.Equal(t, &teamID, w.TeamID)
	assert.Equal(t, "Operator", w.Position)
	assert.Equal(t, "Some notes", w.Notes)
	assert.Equal(t, entity.WorkerStatusActive, w.Status)
	assert.Equal(t, entity.WorkerAvailabilityAvailable, w.Availability)

	events := w.PullEvents()
	assert.Len(t, events, 1)
	assert.Equal(t, "mes.workforce.WorkerCreated", events[0].EventName())
}

func TestUnit_NewWorker_Validation(t *testing.T) {
	userID := uuid.New()
	_, err := entity.NewWorker(&userID, "", "Doe", "john@email.com", "", "EMP1", "", "", "", nil, "", nil, nil, nil, nil, "", "")
	assert.ErrorContains(t, err, "first name is required")

	_, err = entity.NewWorker(&userID, "John", "", "john@email.com", "", "EMP1", "", "", "", nil, "", nil, nil, nil, nil, "", "")
	assert.ErrorContains(t, err, "last name is required")

	_, err = entity.NewWorker(&userID, "John", "Doe", "", "", "EMP1", "", "", "", nil, "", nil, nil, nil, nil, "", "")
	assert.ErrorContains(t, err, "email is required")

	_, err = entity.NewWorker(&userID, "John", "Doe", "john@email.com", "", "", "", "", "", nil, "", nil, nil, nil, nil, "", "")
	assert.ErrorContains(t, err, "employee code is required")
}

func TestUnit_Worker_UpdateSkills(t *testing.T) {
	w, _ := entity.NewWorker(nil, "John", "Doe", "john@email.com", "", "EMP1", "", "", "", nil, "", nil, nil, nil, nil, "", "")
	w.PullEvents() // Clear WorkerCreated event

	s1, _ := entity.NewSkill("Print Marking", "PM1", "Print marking description")
	s2, _ := entity.NewSkill("Laser Operating", "LO1", "Laser operating description")

	skills := []entity.WorkerSkill{
		{SkillID: s1.ID, Skill: s1, ProficiencyLevel: 3},
		{SkillID: s2.ID, Skill: s2, ProficiencyLevel: 1},
	}

	err := w.UpdateSkills(skills)
	require.NoError(t, err)
	assert.Len(t, w.Skills, 2)
	assert.Equal(t, 3, w.Skills[0].ProficiencyLevel)

	events := w.PullEvents()
	assert.Len(t, events, 1)
	assert.Equal(t, "mes.workforce.WorkerSkillsUpdated", events[0].EventName())

	// Test invalid proficiency levels
	badSkills := []entity.WorkerSkill{
		{SkillID: s1.ID, Skill: s1, ProficiencyLevel: 5},
	}
	err = w.UpdateSkills(badSkills)
	assert.ErrorContains(t, err, "proficiency level must be between 1 and 4")
}

func TestUnit_Worker_AddCertificate(t *testing.T) {
	w, _ := entity.NewWorker(nil, "John", "Doe", "john@email.com", "", "EMP1", "", "", "", nil, "", nil, nil, nil, nil, "", "")
	w.PullEvents() // Clear WorkerCreated event

	cert, err := entity.NewCertificate(
		w.ID,
		"Laser Safety",
		"OSHA",
		"OSHA-12345",
		time.Now().UTC().Add(-24*time.Hour),
		time.Now().UTC().Add(365*24*time.Hour),
		"http://doc.url",
	)
	require.NoError(t, err)
	assert.False(t, cert.IsExpired())

	w.AddCertificate(*cert)
	assert.Len(t, w.Certificates, 1)

	events := w.PullEvents()
	assert.Len(t, events, 1)
	assert.Equal(t, "mes.workforce.CertificateAdded", events[0].EventName())
}

func TestUnit_Worker_UpdateAvailability(t *testing.T) {
	w, _ := entity.NewWorker(nil, "John", "Doe", "john@email.com", "", "EMP1", "", "", "", nil, "", nil, nil, nil, nil, "", "")
	w.PullEvents() // Clear WorkerCreated event

	err := w.UpdateAvailability(entity.WorkerAvailabilityOnLeave)
	require.NoError(t, err)
	assert.Equal(t, entity.WorkerAvailabilityOnLeave, w.Availability)

	events := w.PullEvents()
	assert.Len(t, events, 1)
	assert.Equal(t, "mes.workforce.WorkerAvailabilityChanged", events[0].EventName())

	err = w.UpdateAvailability("invalid_avail")
	assert.Error(t, err)
}

func TestUnit_Worker_UpdateStatus(t *testing.T) {
	w, _ := entity.NewWorker(nil, "John", "Doe", "john@email.com", "", "EMP1", "", "", "", nil, "", nil, nil, nil, nil, "", "")

	err := w.UpdateStatus(entity.WorkerStatusInactive)
	require.NoError(t, err)
	assert.Equal(t, entity.WorkerStatusInactive, w.Status)

	err = w.UpdateStatus("invalid_status")
	assert.Error(t, err)
}
