package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/audit/application/service"
	"github.com/nd/mes-platform/modules/audit/domain/repository"
	"github.com/nd/mes-platform/shared/response"
)

type AuditDTO struct {
	ID            uuid.UUID  `json:"id"`
	TraceID       string     `json:"trace_id"`
	CorrelationID string     `json:"correlation_id"`
	UserID        *uuid.UUID `json:"user_id,omitempty"`
	Action        string     `json:"action"`
	EntityName    string     `json:"entity_name"`
	EntityID      string     `json:"entity_id"`
	OldValues     string     `json:"old_values,omitempty"`
	NewValues     string     `json:"new_values,omitempty"`
	CreatedAt     string     `json:"created_at"`
}

type AuditHandler struct {
	svc *service.AuditService
}

func NewAuditHandler(svc *service.AuditService) *AuditHandler {
	return &AuditHandler{svc: svc}
}

// GetAuditLogs retrieves search audit history.
// GET /audit/logs?entity_name=workforce_workers&entity_id=UUID&page=1&limit=20
func (h *AuditHandler) GetAuditLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	var userID *uuid.UUID
	if uidStr := c.Query("user_id"); uidStr != "" {
		if u, err := uuid.Parse(uidStr); err == nil {
			userID = &u
		}
	}

	filter := repository.AuditFilter{
		UserID:        userID,
		TraceID:       c.Query("trace_id"),
		CorrelationID: c.Query("correlation_id"),
		EntityName:    c.Query("entity_name"),
		EntityID:      c.Query("entity_id"),
		Action:        c.Query("action"),
		Page:          page,
		PageSize:      limit,
	}

	logs, total, err := h.svc.ListLogs(c.Request.Context(), filter)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	dtos := make([]AuditDTO, len(logs))
	for i, l := range logs {
		dtos[i] = AuditDTO{
			ID:            l.ID,
			TraceID:       l.TraceID,
			CorrelationID: l.CorrelationID,
			UserID:        l.UserID,
			Action:        l.Action,
			EntityName:    l.EntityName,
			EntityID:      l.EntityID,
			OldValues:     l.OldValues,
			NewValues:     l.NewValues,
			CreatedAt:     l.CreatedAt.Format("2006-01-02T15:04:05Z"),
		}
	}

	response.List(c, dtos, page, limit, total)
}

// GetAuditLogByID returns a single detailed audit log.
// GET /audit/logs/:id
func (h *AuditHandler) GetAuditLogByID(c *gin.Context) {
	logID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_AUDIT_LOG_ID", "invalid audit log ID")
		return
	}

	l, err := h.svc.GetLog(c.Request.Context(), logID)
	if err != nil {
		response.NotFound(c, "AuditLog")
		return
	}

	dto := AuditDTO{
		ID:            l.ID,
		TraceID:       l.TraceID,
		CorrelationID: l.CorrelationID,
		UserID:        l.UserID,
		Action:        l.Action,
		EntityName:    l.EntityName,
		EntityID:      l.EntityID,
		OldValues:     l.OldValues,
		NewValues:     l.NewValues,
		CreatedAt:     l.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}

	response.OK(c, dto)
}
