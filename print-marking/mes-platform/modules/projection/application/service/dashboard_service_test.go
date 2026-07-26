package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/projection/application/builder"
	"github.com/nd/mes-platform/modules/projection/application/service"
	"github.com/nd/mes-platform/modules/projection/domain/readmodel"
	"github.com/nd/mes-platform/modules/projection/infrastructure/model"
	"github.com/nd/mes-platform/modules/projection/infrastructure/persistence"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupProjectionEnv(t *testing.T) (*gorm.DB, *service.DashboardService, *builder.ProjectionBuilder) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(
		&model.DashboardSnapshotModel{},
		&model.OrderStatsModel{},
		&model.WorkerStatsModel{},
	)
	require.NoError(t, err)

	// We also need some dummy production tables to query during snapshot builds
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
	svc := service.NewDashboardService(dashRepo, orderRepo, workerRepo, build, log)

	return db, svc, build
}

func TestDashboardService_GetDashboard_CreatesOnDemand(t *testing.T) {
	_, svc, _ := setupProjectionEnv(t)

	snapshot, err := svc.GetDashboard(context.Background())
	require.NoError(t, err)
	assert.NotNil(t, snapshot)
	assert.Equal(t, 0, snapshot.TotalOrders)
}

func TestDashboardService_RefreshDashboard_Broadcasts(t *testing.T) {
	db, svc, _ := setupProjectionEnv(t)

	// Add test data to mock tables
	err := db.Exec(`INSERT INTO production_orders (status, quantity, created_at, updated_at) VALUES ('in_progress', 100, datetime('now'), datetime('now'))`).Error
	require.NoError(t, err)

	subCh := svc.Subscribe("test-client")
	defer svc.Unsubscribe("test-client")

	snapshot, err := svc.RefreshDashboard(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 1, snapshot.TotalOrders)
	assert.Equal(t, 1, snapshot.InProgressOrders)

	// Read broadcasted event
	select {
	case broadcasted := <-subCh:
		assert.Equal(t, snapshot.ID, broadcasted.ID)
		assert.Equal(t, 1, broadcasted.TotalOrders)
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for SSE broadcast")
	}
}

func TestDashboardService_StatsQueries(t *testing.T) {
	db, svc, b := setupProjectionEnv(t)

	// Populate OrderStats
	err := db.Exec(`INSERT INTO production_orders (status, quantity, created_at, updated_at) VALUES ('completed', 50, datetime('now'), datetime('now'))`).Error
	require.NoError(t, err)

	err = b.RebuildOrderStats(context.Background(), readmodel.PeriodDaily)
	require.NoError(t, err)

	statsList, err := svc.GetOrderStats(context.Background(), readmodel.PeriodDaily, 10)
	require.NoError(t, err)
	assert.Len(t, statsList, 1)
	assert.Equal(t, 1, statsList[0].OrdersCreated)

	// Populate WorkerStats
	workerID := uuid.New()
	err = db.Exec(`INSERT INTO projection_worker_stats (id, worker_id, worker_name, period, period_start, assignments_count, approved_count, overridden_count, avg_score, created_at, updated_at)
		VALUES (?, ?, 'Alice Smith', 'monthly', ?, 5, 4, 1, 85.5, datetime('now'), datetime('now'))`,
		uuid.New(), workerID, time.Date(time.Now().UTC().Year(), time.Now().UTC().Month(), 1, 0, 0, 0, 0, time.UTC)).Error
	require.NoError(t, err)

	topWorkers, err := svc.GetTopWorkers(context.Background(), readmodel.PeriodMonthly, 10)
	require.NoError(t, err)
	assert.Len(t, topWorkers, 1)
	assert.Equal(t, "Alice Smith", topWorkers[0].WorkerName)
	assert.Equal(t, 85.5, topWorkers[0].AvgScore)
}
