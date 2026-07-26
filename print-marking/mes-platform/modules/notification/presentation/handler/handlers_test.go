package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	jwtpkg "github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/modules/notification/application/service"
	"github.com/nd/mes-platform/modules/notification/infrastructure/model"
	"github.com/nd/mes-platform/modules/notification/infrastructure/persistence"
	"github.com/nd/mes-platform/modules/notification/presentation/handler"
	"github.com/nd/mes-platform/modules/notification/presentation/route"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type MockEmailDisp struct{}

func (MockEmailDisp) Send(_ context.Context, _, _, _ string) error { return nil }

func setupHTTPEnv(t *testing.T) (*gorm.DB, *handler.NotificationHandler, *jwtpkg.Manager, string, uuid.UUID) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(
		&model.AlertModel{},
		&model.OutboxEventModel{},
	)
	require.NoError(t, err)

	alertRepo := persistence.NewGormAlertRepository(db)
	outboxRepo := persistence.NewGormOutboxRepository(db)
	log := logger.NewNop()

	svc := service.NewNotificationService(alertRepo, outboxRepo, &MockEmailDisp{}, log)
	h := handler.NewNotificationHandler(svc)

	jwtCfg := jwtpkg.Config{
		Secret:              "super_secret_key_at_least_32_characters_long",
		AccessExpiryMinutes: 15,
		RefreshExpiryDays:   7,
		Issuer:              "mes-platform",
		Audience:            "mes-client",
	}
	jwtManager, err := jwtpkg.NewManager(jwtCfg)
	require.NoError(t, err)

	userID := uuid.New()
	pair, err := jwtManager.GenerateTokenPair(userID, "test-user", "test@example.com")
	require.NoError(t, err)

	return db, h, jwtManager, pair.AccessToken, userID
}

func TestNotificationHandler_ListAlerts(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, h, jwtManager, token, userID := setupHTTPEnv(t)

	// Insert alert via DB to target the test user
	err := db.Create(&model.AlertModel{
		ID:      uuid.New(),
		UserID:  &userID,
		Title:   "Warning notification",
		Message: "Low inventory levels",
		Type:    "warning",
		Channel: "in_app",
		IsRead:  false,
	}).Error
	require.NoError(t, err)

	r := gin.New()
	api := r.Group("/api/v1")
	route.Register(api, h, jwtManager)

	req, _ := http.NewRequest("GET", "/api/v1/alerts?is_read=false", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var envelope struct {
		Success bool `json:"success"`
		Data    []struct {
			ID      uuid.UUID `json:"id"`
			Title   string    `json:"title"`
			Message string    `json:"message"`
			IsRead  bool      `json:"is_read"`
		} `json:"data"`
	}
	err = json.Unmarshal(w.Body.Bytes(), &envelope)
	require.NoError(t, err)
	assert.True(t, envelope.Success)
	assert.Len(t, envelope.Data, 1)
	assert.Equal(t, "Warning notification", envelope.Data[0].Title)
}

func TestNotificationHandler_MarkRead(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, h, jwtManager, token, userID := setupHTTPEnv(t)

	alertID := uuid.New()
	err := db.Create(&model.AlertModel{
		ID:      alertID,
		UserID:  &userID,
		Title:   "Shift Update",
		Message: "Schedule changed",
		Type:    "info",
		Channel: "in_app",
		IsRead:  false,
	}).Error
	require.NoError(t, err)

	r := gin.New()
	api := r.Group("/api/v1")
	route.Register(api, h, jwtManager)

	req, _ := http.NewRequest("PATCH", "/api/v1/alerts/"+alertID.String()+"/read", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Assert in DB
	var m model.AlertModel
	db.First(&m, "id = ?", alertID)
	assert.True(t, m.IsRead)
}
