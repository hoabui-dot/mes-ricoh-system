package entity_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/audit/domain/entity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnit_NewAuditLog_Success(t *testing.T) {
	userID := uuid.New()
	log, err := entity.NewAuditLog(
		"trace-123",
		"corr-456",
		&userID,
		"CREATE",
		"workforce_workers",
		"emp-001",
		"{}",
		`{"name": "Alice"}`,
	)
	require.NoError(t, err)
	assert.NotNil(t, log)

	assert.Equal(t, "trace-123", log.TraceID)
	assert.Equal(t, "corr-456", log.CorrelationID)
	assert.Equal(t, &userID, log.UserID)
	assert.Equal(t, "CREATE", log.Action)
	assert.Equal(t, "workforce_workers", log.EntityName)
	assert.Equal(t, "emp-001", log.EntityID)
	assert.Equal(t, "{}", log.OldValues)
	assert.Equal(t, `{"name": "Alice"}`, log.NewValues)
}

func TestUnit_NewAuditLog_Validation(t *testing.T) {
	userID := uuid.New()
	_, err := entity.NewAuditLog("", "corr-456", &userID, "CREATE", "entity", "id", "", "")
	assert.ErrorContains(t, err, "trace_id is required")

	_, err = entity.NewAuditLog("trace-123", "corr-456", &userID, "", "entity", "id", "", "")
	assert.ErrorContains(t, err, "action is required")

	_, err = entity.NewAuditLog("trace-123", "corr-456", &userID, "CREATE", " ", "id", "", "")
	assert.ErrorContains(t, err, "entity_name is required")

	_, err = entity.NewAuditLog("trace-123", "corr-456", &userID, "CREATE", "entity", " ", "", "")
	assert.ErrorContains(t, err, "entity_id is required")
}
