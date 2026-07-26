package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	jwtpkg "github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/modules/audit/application/service"
	"github.com/nd/mes-platform/modules/audit/infrastructure/model"
	"github.com/nd/mes-platform/modules/audit/infrastructure/persistence"
	"github.com/nd/mes-platform/modules/audit/presentation/handler"
	"github.com/nd/mes-platform/modules/audit/presentation/route"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupHTTPAuditEnv(t *testing.T) (*gorm.DB, *handler.AuditHandler, *jwtpkg.Manager, string, uuid.UUID) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(&model.AuditLogModel{})
	require.NoError(t, err)

	auditRepo := persistence.NewGormAuditRepository(db)
	log := logger.NewNop()

	svc := service.NewAuditService(auditRepo, log)
	h := handler.NewAuditHandler(svc)

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
	pair, err := jwtManager.GenerateTokenPair(userID, "admin-user", "admin@example.com")
	require.NoError(t, err)

	return db, h, jwtManager, pair.AccessToken, userID
}

func TestAuditHandler_ListLogs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, h, jwtManager, token, userID := setupHTTPAuditEnv(t)

	// Create audit record manually
	err := db.Create(&model.AuditLogModel{
		ID:            uuid.New(),
		TraceID:       "trace-1",
		CorrelationID: "corr-1",
		UserID:        &userID,
		Action:        "CREATE",
		EntityName:    "workforce_workers",
		EntityID:      "emp-1",
		OldValues:     "",
		NewValues:     "{}",
		CreatedAt:     time.Now().UTC(),
	}).Error
	require.NoError(t, err)

	r := gin.New()
	api := r.Group("/api/v1")
	route.Register(api, h, jwtManager)

	req, _ := http.NewRequest("GET", "/api/v1/audit/logs?entity_name=workforce_workers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var envelope struct {
		Success bool `json:"success"`
		Data    []struct {
			ID         uuid.UUID `json:"id"`
			TraceID    string    `json:"trace_id"`
			Action     string    `json:"action"`
			EntityName string    `json:"entity_name"`
		} `json:"data"`
	}
	err = json.Unmarshal(w.Body.Bytes(), &envelope)
	require.NoError(t, err)
	assert.True(t, envelope.Success)
	assert.Len(t, envelope.Data, 1)
	assert.Equal(t, "CREATE", envelope.Data[0].Action)
	assert.Equal(t, "workforce_workers", envelope.Data[0].EntityName)
}

func TestAuditHandler_GetLogByID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, h, jwtManager, token, userID := setupHTTPAuditEnv(t)

	logID := uuid.New()
	err := db.Create(&model.AuditLogModel{
		ID:            logID,
		TraceID:       "trace-2",
		CorrelationID: "corr-2",
		UserID:        &userID,
		Action:        "UPDATE",
		EntityName:    "planning_shifts",
		EntityID:      "shift-1",
		OldValues:     `{"name":"A"}`,
		NewValues:     `{"name":"B"}`,
		CreatedAt:     time.Now().UTC(),
	}).Error
	require.NoError(t, err)

	r := gin.New()
	api := r.Group("/api/v1")
	route.Register(api, h, jwtManager)

	req, _ := http.NewRequest("GET", "/api/v1/audit/logs/"+logID.String(), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var envelope struct {
		Success bool `json:"success"`
		Data    struct {
			ID        uuid.UUID `json:"id"`
			TraceID   string    `json:"trace_id"`
			OldValues string    `json:"old_values"`
			NewValues string    `json:"new_values"`
		} `json:"data"`
	}
	err = json.Unmarshal(w.Body.Bytes(), &envelope)
	require.NoError(t, err)
	assert.True(t, envelope.Success)
	assert.Equal(t, "trace-2", envelope.Data.TraceID)
	assert.Equal(t, `{"name":"A"}`, envelope.Data.OldValues)
}
