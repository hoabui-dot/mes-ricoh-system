package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/notification/application/service"
	"github.com/nd/mes-platform/modules/notification/domain/repository"
	"github.com/nd/mes-platform/shared/response"
)

type NotificationHandler struct {
	svc *service.NotificationService
}

func NewNotificationHandler(svc *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{svc: svc}
}

// ListAlerts lists notifications targeted at the current logged-in user or their role.
// GET /alerts?is_read=false&type=warning&page=1&limit=20
func (h *NotificationHandler) ListAlerts(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid token subject")
		return
	}

	role := c.GetString("user_role")

	var isRead *bool
	if isReadStr := c.Query("is_read"); isReadStr != "" {
		val, err := strconv.ParseBool(isReadStr)
		if err == nil {
			isRead = &val
		}
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	filter := repository.AlertFilter{
		UserID:   &userID,
		Role:     role,
		IsRead:   isRead,
		Type:     c.Query("type"),
		Page:     page,
		PageSize: limit,
	}

	alerts, total, err := h.svc.ListAlerts(c.Request.Context(), filter)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	// Format matching DTOs
	type AlertDTO struct {
		ID        uuid.UUID  `json:"id"`
		Title     string     `json:"title"`
		Message   string     `json:"message"`
		Type      string     `json:"type"`
		Channel   string     `json:"channel"`
		IsRead    bool       `json:"is_read"`
		ReadAt    *string    `json:"read_at,omitempty"`
		CreatedAt string     `json:"created_at"`
	}

	dtos := make([]AlertDTO, len(alerts))
	for i, a := range alerts {
		var readAtStr *string
		if a.ReadAt != nil {
			s := a.ReadAt.Format("2006-01-02T15:04:05Z")
			readAtStr = &s
		}
		dtos[i] = AlertDTO{
			ID:        a.ID,
			Title:     a.Title,
			Message:   a.Message,
			Type:      string(a.Type),
			Channel:   string(a.Channel),
			IsRead:    a.IsRead,
			ReadAt:    readAtStr,
			CreatedAt: a.CreatedAt.Format("2006-01-02T15:04:05Z"),
		}
	}

	response.List(c, dtos, page, limit, total)
}

// MarkRead marks a single alert as read.
// PATCH /alerts/:id/read
func (h *NotificationHandler) MarkRead(c *gin.Context) {
	alertID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ALERT_ID", "invalid alert ID")
		return
	}

	if err := h.svc.MarkAlertRead(c.Request.Context(), alertID); err != nil {
		response.NotFound(c, "Alert")
		return
	}

	response.OK(c, gin.H{"status": "success"})
}

// MarkAllRead marks all notifications for the authenticated user as read.
// PATCH /alerts/read-all
func (h *NotificationHandler) MarkAllRead(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid token subject")
		return
	}

	if err := h.svc.MarkAllAlertsRead(c.Request.Context(), userID); err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	response.OK(c, gin.H{"status": "success"})
}
