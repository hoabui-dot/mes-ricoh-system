package service_test

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/notification/application/service"
	"github.com/nd/mes-platform/modules/notification/domain/entity"
	"github.com/nd/mes-platform/modules/notification/domain/repository"
	"github.com/nd/mes-platform/modules/notification/infrastructure/model"
	"github.com/nd/mes-platform/modules/notification/infrastructure/persistence"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type MockEmailDispatcher struct {
	Dispatches []struct {
		Recipient string
		Subject   string
		Body      string
	}
}

func (m *MockEmailDispatcher) Send(_ context.Context, recipientEmail string, subject string, body string) error {
	m.Dispatches = append(m.Dispatches, struct {
		Recipient string
		Subject   string
		Body      string
	}{Recipient: recipientEmail, Subject: subject, Body: body})
	return nil
}

type testEnv struct {
	db        *gorm.DB
	emailDisp *MockEmailDispatcher
	svc       *service.NotificationService
}

func setupEnv(t *testing.T) *testEnv {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(
		&model.AlertModel{},
		&model.OutboxEventModel{},
	)
	require.NoError(t, err)

	alertRepo := persistence.NewGormAlertRepository(db)
	outboxRepo := persistence.NewGormOutboxRepository(db)
	emailDisp := &MockEmailDispatcher{}
	log := logger.NewNop()

	svc := service.NewNotificationService(alertRepo, outboxRepo, emailDisp, log)

	return &testEnv{db: db, emailDisp: emailDisp, svc: svc}
}

func TestNotificationService_TriggerAlert_InAppOnly(t *testing.T) {
	env := setupEnv(t)
	userID := uuid.New()

	alert, err := env.svc.TriggerAlert(context.Background(), &userID, "", "In-App Title", "Message body", entity.AlertTypeInfo, entity.AlertChannelInApp)
	require.NoError(t, err)
	assert.NotNil(t, alert)

	// Fetch from DB
	fetched, err := env.svc.GetAlertByID(context.Background(), alert.ID)
	require.NoError(t, err)
	assert.Equal(t, alert.Title, fetched.Title)
	assert.Equal(t, string(entity.AlertChannelInApp), string(fetched.Channel))

	// No email sent
	assert.Len(t, env.emailDisp.Dispatches, 0)
}

func TestNotificationService_TriggerAlert_EmailOnly(t *testing.T) {
	env := setupEnv(t)
	userID := uuid.New()

	alert, err := env.svc.TriggerAlert(context.Background(), &userID, "", "Email Title", "Message body", entity.AlertTypeCritical, entity.AlertChannelEmail)
	require.NoError(t, err)

	// In-app alert was NOT saved
	_, err = env.svc.GetAlertByID(context.Background(), alert.ID)
	assert.ErrorContains(t, err, "alert not found")

	// Email dispatch succeeded
	require.Len(t, env.emailDisp.Dispatches, 1)
	assert.Equal(t, "[CRITICAL] Email Title", env.emailDisp.Dispatches[0].Subject)
}

func TestNotificationService_MarkRead(t *testing.T) {
	env := setupEnv(t)
	userID := uuid.New()

	alert, _ := env.svc.TriggerAlert(context.Background(), &userID, "", "Unread Title", "Body", entity.AlertTypeInfo, entity.AlertChannelInApp)

	fetched, _ := env.svc.GetAlertByID(context.Background(), alert.ID)
	assert.False(t, fetched.IsRead)

	err := env.svc.MarkAlertRead(context.Background(), alert.ID)
	require.NoError(t, err)

	fetched, _ = env.svc.GetAlertByID(context.Background(), alert.ID)
	assert.True(t, fetched.IsRead)
	assert.NotNil(t, fetched.ReadAt)
}

func TestNotificationService_MarkAllRead(t *testing.T) {
	env := setupEnv(t)
	userID := uuid.New()

	_, _ = env.svc.TriggerAlert(context.Background(), &userID, "", "Alert 1", "Body", entity.AlertTypeInfo, entity.AlertChannelInApp)
	_, _ = env.svc.TriggerAlert(context.Background(), &userID, "", "Alert 2", "Body", entity.AlertTypeWarning, entity.AlertChannelInApp)

	filter := repository.AlertFilter{UserID: &userID}
	list, _, _ := env.svc.ListAlerts(context.Background(), filter)
	assert.Len(t, list, 2)
	assert.False(t, list[0].IsRead)
	assert.False(t, list[1].IsRead)

	err := env.svc.MarkAllAlertsRead(context.Background(), userID)
	require.NoError(t, err)

	list, _, _ = env.svc.ListAlerts(context.Background(), filter)
	assert.True(t, list[0].IsRead)
	assert.True(t, list[1].IsRead)
}
