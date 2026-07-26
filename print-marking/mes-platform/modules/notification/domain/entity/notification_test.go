package entity_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/notification/domain/entity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnit_NewAlert_Success(t *testing.T) {
	userID := uuid.New()
	alert, err := entity.NewAlert(&userID, "", "New Task", "Assigned task", entity.AlertTypeInfo, entity.AlertChannelInApp)
	require.NoError(t, err)

	assert.Equal(t, &userID, alert.UserID)
	assert.Equal(t, "", alert.Role)
	assert.Equal(t, "New Task", alert.Title)
	assert.Equal(t, "Assigned task", alert.Message)
	assert.Equal(t, entity.AlertTypeInfo, alert.Type)
	assert.Equal(t, entity.AlertChannelInApp, alert.Channel)
	assert.False(t, alert.IsRead)
	assert.Nil(t, alert.ReadAt)

	events := alert.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.notification.AlertCreated", events[0].EventName())
}

func TestUnit_NewAlert_Validation(t *testing.T) {
	userID := uuid.New()
	_, err := entity.NewAlert(nil, "", "Title", "Msg", entity.AlertTypeInfo, entity.AlertChannelInApp)
	assert.ErrorContains(t, err, "target either a specific user or a role")

	_, err = entity.NewAlert(&userID, "", " ", "Msg", entity.AlertTypeInfo, entity.AlertChannelInApp)
	assert.ErrorContains(t, err, "title is required")

	_, err = entity.NewAlert(&userID, "", "Title", "", entity.AlertTypeInfo, entity.AlertChannelInApp)
	assert.ErrorContains(t, err, "message is required")
}

func TestUnit_Alert_MarkAsRead(t *testing.T) {
	userID := uuid.New()
	alert, _ := entity.NewAlert(&userID, "", "Title", "Msg", entity.AlertTypeInfo, entity.AlertChannelInApp)

	assert.False(t, alert.IsRead)
	alert.MarkAsRead()
	assert.True(t, alert.IsRead)
	assert.NotNil(t, alert.ReadAt)
}
