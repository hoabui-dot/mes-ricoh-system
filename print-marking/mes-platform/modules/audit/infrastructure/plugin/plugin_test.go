package plugin_test

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	auditcontext "github.com/nd/mes-platform/modules/audit/application/context"
	"github.com/nd/mes-platform/modules/audit/domain/repository"
	"github.com/nd/mes-platform/modules/audit/infrastructure/model"
	"github.com/nd/mes-platform/modules/audit/infrastructure/persistence"
	"github.com/nd/mes-platform/modules/audit/infrastructure/plugin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type DummyModel struct {
	ID   uuid.UUID `gorm:"type:uuid;primaryKey"`
	Name string
}

func (DummyModel) TableName() string { return "dummy_models" }

func TestAuditPlugin_DBChangeCapture(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(
		&model.AuditLogModel{},
		&DummyModel{},
	)
	require.NoError(t, err)

	auditRepo := persistence.NewGormAuditRepository(db)
	auditPlug := plugin.NewAuditPlugin(auditRepo)
	err = db.Use(auditPlug)
	require.NoError(t, err)

	// Create request context with tracing variables
	userID := uuid.New()
	ctx := context.Background()
	ctx = context.WithValue(ctx, auditcontext.TraceKey, "trace-xyz")
	ctx = context.WithValue(ctx, auditcontext.CorrelationKey, "corr-abc")
	ctx = context.WithValue(ctx, auditcontext.UserKey, userID)

	dbCtx := db.WithContext(ctx)

	// ─── 1. Test CREATE ───────────────────────────────────────────────────────────
	recordID := uuid.New()
	dummy := &DummyModel{
		ID:   recordID,
		Name: "Original Name",
	}

	err = dbCtx.Create(dummy).Error
	require.NoError(t, err)

	// Verify audit log created
	logs, total, err := auditRepo.List(context.Background(), repository.AuditFilter{EntityName: "dummy_models"})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "CREATE", logs[0].Action)
	assert.Equal(t, recordID.String(), logs[0].EntityID)
	assert.Contains(t, logs[0].NewValues, "Original Name")

	// ─── 2. Test UPDATE ───────────────────────────────────────────────────────────
	dummy.Name = "Updated Name"
	err = dbCtx.Save(dummy).Error
	require.NoError(t, err)

	logs, total, err = auditRepo.List(context.Background(), repository.AuditFilter{EntityName: "dummy_models"})
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	// Newest first
	assert.Equal(t, "UPDATE", logs[0].Action)
	assert.Contains(t, logs[0].OldValues, "Original Name")
	assert.Contains(t, logs[0].NewValues, "Updated Name")

	// ─── 3. Test DELETE ───────────────────────────────────────────────────────────
	err = dbCtx.Delete(dummy).Error
	require.NoError(t, err)

	logs, total, err = auditRepo.List(context.Background(), repository.AuditFilter{EntityName: "dummy_models"})
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	assert.Equal(t, "DELETE", logs[0].Action)
	assert.Contains(t, logs[0].OldValues, "Updated Name")
}
