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
	"github.com/nd/mes-platform/modules/projection/application/builder"
	projectionsvc "github.com/nd/mes-platform/modules/projection/application/service"
	"github.com/nd/mes-platform/modules/projection/domain/readmodel"
	"github.com/nd/mes-platform/modules/projection/infrastructure/model"
	"github.com/nd/mes-platform/modules/projection/infrastructure/persistence"
	"github.com/nd/mes-platform/modules/projection/presentation/handler"
	"github.com/nd/mes-platform/modules/projection/presentation/route"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupHTTPTestEnv(t *testing.T) (*gorm.DB, *handler.ProjectionHandler, *jwtpkg.Manager, string) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(
		&model.DashboardSnapshotModel{},
		&model.OrderStatsModel{},
		&model.WorkerStatsModel{},
	)
	require.NoError(t, err)

	// Create mocked external tables
	err = db.Exec(`CREATE TABLE IF NOT EXISTS production_orders (status TEXT, quantity INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`).Error
	require.NoError(t, err)
	err = db.Exec(`CREATE TABLE IF NOT EXISTS production_work_orders (status TEXT)`).Error
	require.NoError(t, err)
	err = db.Exec(`CREATE TABLE IF NOT EXISTS workforce_workers (availability TEXT, deleted_at TIMESTAMPTZ)`).Error
	require.NoError(t, err)
	err = db.Exec(`CREATE TABLE IF NOT EXISTS assignment_assignments (status TEXT, score REAL)`).Error
	require.NoError(t, err)

	dashRepo := persistence.NewGormDashboardRepository(db)
	orderRepo := persistence.NewGormOrderStatsRepository(db)
	workerRepo := persistence.NewGormWorkerStatsRepository(db)
	log := logger.NewNop()

	build := builder.NewProjectionBuilder(db, dashRepo, orderRepo, workerRepo, log)
	svc := projectionsvc.NewDashboardService(dashRepo, orderRepo, workerRepo, build, log)
	h := handler.NewProjectionHandler(svc)

	// Initialize JWT Manager
	jwtCfg := jwtpkg.Config{
		Secret:              "super_secret_key_at_least_32_characters_long",
		AccessExpiryMinutes: 15,
		RefreshExpiryDays:   7,
		Issuer:              "mes-platform",
		Audience:            "mes-client",
	}
	jwtManager, err := jwtpkg.NewManager(jwtCfg)
	require.NoError(t, err)

	// Generate token for tests
	pair, err := jwtManager.GenerateTokenPair(uuid.New(), "test-user", "test@example.com")
	require.NoError(t, err)

	return db, h, jwtManager, pair.AccessToken
}

func TestProjectionHandler_GetDashboard(t *testing.T) {
	gin.SetMode(gin.TestMode)
	_, h, jwtManager, token := setupHTTPTestEnv(t)

	r := gin.New()
	api := r.Group("/api/v1")
	route.Register(api, h, jwtManager)

	req, _ := http.NewRequest("GET", "/api/v1/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var envelope struct {
		Success bool                       `json:"success"`
		Data    readmodel.DashboardSnapshot `json:"data"`
	}
	err := json.Unmarshal(w.Body.Bytes(), &envelope)
	require.NoError(t, err)
	assert.True(t, envelope.Success)
	assert.Equal(t, 0, envelope.Data.TotalOrders)
}

func TestProjectionHandler_RefreshDashboard(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, h, jwtManager, token := setupHTTPTestEnv(t)

	// insert some test data
	err := db.Exec(`INSERT INTO production_orders (status, quantity, created_at, updated_at) VALUES ('completed', 10, datetime('now'), datetime('now'))`).Error
	require.NoError(t, err)

	r := gin.New()
	api := r.Group("/api/v1")
	route.Register(api, h, jwtManager)

	req, _ := http.NewRequest("POST", "/api/v1/dashboard/refresh", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var envelope struct {
		Success bool                       `json:"success"`
		Data    readmodel.DashboardSnapshot `json:"data"`
	}
	err = json.Unmarshal(w.Body.Bytes(), &envelope)
	require.NoError(t, err)
	assert.True(t, envelope.Success)
	assert.Equal(t, 1, envelope.Data.TotalOrders)
	assert.Equal(t, 1, envelope.Data.CompletedOrders)
}

func TestProjectionHandler_GetOrderStats(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, h, jwtManager, token := setupHTTPTestEnv(t)

	// insert some order stats manually
	err := db.Exec(`INSERT INTO projection_order_stats (id, period, period_start, period_end, orders_created, orders_completed, orders_cancelled, avg_completion_days, total_units_produced, created_at, updated_at)
		VALUES (?, 'daily', ?, ?, 5, 3, 0, 1.2, 150, datetime('now'), datetime('now'))`,
		uuid.New(), time.Now().UTC(), time.Now().UTC()).Error
	require.NoError(t, err)

	r := gin.New()
	api := r.Group("/api/v1")
	route.Register(api, h, jwtManager)

	req, _ := http.NewRequest("GET", "/api/v1/dashboard/stats/orders?period=daily", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var envelope struct {
		Success bool                   `json:"success"`
		Data    []readmodel.OrderStats `json:"data"`
	}
	err = json.Unmarshal(w.Body.Bytes(), &envelope)
	require.NoError(t, err)
	assert.True(t, envelope.Success)
	assert.Len(t, envelope.Data, 1)
	assert.Equal(t, 5, envelope.Data[0].OrdersCreated)
}

func TestProjectionHandler_Unauthorized(t *testing.T) {
	gin.SetMode(gin.TestMode)
	_, h, jwtManager, _ := setupHTTPTestEnv(t)

	r := gin.New()
	api := r.Group("/api/v1")
	route.Register(api, h, jwtManager)

	req, _ := http.NewRequest("GET", "/api/v1/dashboard", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
