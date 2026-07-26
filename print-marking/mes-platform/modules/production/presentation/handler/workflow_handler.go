package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/identity/infrastructure/rbac"
	"github.com/nd/mes-platform/modules/production/application/dto"
	"github.com/nd/mes-platform/modules/production/application/service"
	"github.com/nd/mes-platform/modules/production/domain/repository"
	"github.com/nd/mes-platform/shared/response"
)

type WorkflowHandler struct {
	svc      *service.WorkflowService
	enforcer *rbac.Enforcer
}

func NewWorkflowHandler(svc *service.WorkflowService, enforcer *rbac.Enforcer) *WorkflowHandler {
	return &WorkflowHandler{
		svc:      svc,
		enforcer: enforcer,
	}
}

// authorize checks if the user has the required permission
func (h *WorkflowHandler) authorize(c *gin.Context, permission string) bool {
	userIDVal, ok := c.Get("user_id")
	if !ok {
		response.Unauthorized(c, "authentication required")
		c.Abort()
		return false
	}
	userID := userIDVal.(string)
	subject := "user:" + userID

	allowed, err := h.enforcer.EnforcePermission(subject, permission)
	if err != nil || !allowed {
		response.Forbidden(c, "insufficient permissions")
		c.Abort()
		return false
	}
	return true
}

func (h *WorkflowHandler) getUserID(c *gin.Context) string {
	if userIDVal, ok := c.Get("user_id"); ok {
		return userIDVal.(string)
	}
	return "system"
}

func (h *WorkflowHandler) handleError(c *gin.Context, err error) {
	if errors.Is(err, service.ErrNotFound) || errors.Is(err, repository.ErrWorkflowNotFound) {
		response.NotFound(c, "Workflow")
		return
	}
	if errors.Is(err, service.ErrConflict) {
		response.Conflict(c, err.Error())
		return
	}
	if errors.Is(err, service.ErrValidation) {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}
	if errors.Is(err, service.ErrTransition) {
		response.UnprocessableEntity(c, "INVALID_STATE_TRANSITION", err.Error())
		return
	}

	traceID := ""
	if tVal, ok := c.Get("trace_id"); ok {
		traceID, _ = tVal.(string)
	}
	response.InternalServerError(c, traceID)
}

// CreateWorkflow handles POST /api/v1/workflows
func (h *WorkflowHandler) CreateWorkflow(c *gin.Context) {
	if !h.authorize(c, "workflow.create") {
		return
	}

	var req dto.CreateWorkflowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	dto, err := h.svc.CreateWorkflow(c.Request.Context(), req, h.getUserID(c))
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.Created(c, dto)
}

// UpdateWorkflow handles PUT /api/v1/workflows/:id
func (h *WorkflowHandler) UpdateWorkflow(c *gin.Context) {
	if !h.authorize(c, "workflow.update") {
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid workflow ID format")
		return
	}

	var req dto.UpdateWorkflowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	dto, err := h.svc.UpdateWorkflow(c.Request.Context(), id, req, h.getUserID(c))
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.OK(c, dto)
}

// GetWorkflow handles GET /api/v1/workflows/:id
func (h *WorkflowHandler) GetWorkflow(c *gin.Context) {
	if !h.authorize(c, "workflow.view") {
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid workflow ID format")
		return
	}

	dto, err := h.svc.GetWorkflow(c.Request.Context(), id)
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.OK(c, dto)
}

// SearchWorkflows handles GET /api/v1/workflows
func (h *WorkflowHandler) SearchWorkflows(c *gin.Context) {
	if !h.authorize(c, "workflow.view") {
		return
	}

	version, _ := strconv.Atoi(c.Query("version"))
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("pageSize"))

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}

	filter := repository.WorkflowFilter{
		Keyword:       c.Query("keyword"),
		Status:        c.Query("status"),
		ProductFamily: c.Query("productFamily"),
		Version:       version,
		Page:          page,
		PageSize:      pageSize,
	}

	dtos, total, err := h.svc.SearchWorkflows(c.Request.Context(), filter)
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.List(c, dtos, filter.Page, filter.PageSize, total)
}

// AddOperation handles POST /api/v1/workflows/:id/operations
func (h *WorkflowHandler) AddOperation(c *gin.Context) {
	if !h.authorize(c, "operation.create") {
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid workflow ID format")
		return
	}

	var req dto.AddOperationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	opDto, err := h.svc.AddOperation(c.Request.Context(), id, req, h.getUserID(c))
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.Created(c, opDto)
}

// UpdateOperation handles PUT /api/v1/workflows/:id/operations/:opId
func (h *WorkflowHandler) UpdateOperation(c *gin.Context) {
	if !h.authorize(c, "operation.update") {
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid workflow ID format")
		return
	}

	opIDStr := c.Param("opId")
	opID, err := uuid.Parse(opIDStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid operation ID format")
		return
	}

	var req dto.UpdateOperationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	err = h.svc.UpdateOperation(c.Request.Context(), id, opID, req, h.getUserID(c))
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.NoContent(c)
}

// RemoveOperation handles DELETE /api/v1/workflows/:id/operations/:opId
func (h *WorkflowHandler) RemoveOperation(c *gin.Context) {
	if !h.authorize(c, "operation.delete") {
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid workflow ID format")
		return
	}

	opIDStr := c.Param("opId")
	opID, err := uuid.Parse(opIDStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid operation ID format")
		return
	}

	err = h.svc.RemoveOperation(c.Request.Context(), id, opID, h.getUserID(c))
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.NoContent(c)
}

// MoveOperation handles POST /api/v1/workflows/:id/operations/:opId/move
func (h *WorkflowHandler) MoveOperation(c *gin.Context) {
	if !h.authorize(c, "operation.move") {
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid workflow ID format")
		return
	}

	opIDStr := c.Param("opId")
	opID, err := uuid.Parse(opIDStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid operation ID format")
		return
	}

	var req dto.MoveOperationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	err = h.svc.MoveOperation(c.Request.Context(), id, opID, req, h.getUserID(c))
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.NoContent(c)
}

// ValidateWorkflow handles POST /api/v1/workflows/:id/validate
func (h *WorkflowHandler) ValidateWorkflow(c *gin.Context) {
	if !h.authorize(c, "workflow.view") {
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid workflow ID format")
		return
	}

	errs, err := h.svc.ValidateWorkflow(c.Request.Context(), id)
	if err != nil {
		h.handleError(c, err)
		return
	}

	if len(errs) > 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"errors":  errs,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"errors":  []string{},
	})
}

// PublishWorkflow handles POST /api/v1/workflows/:id/publish
func (h *WorkflowHandler) PublishWorkflow(c *gin.Context) {
	if !h.authorize(c, "workflow.publish") {
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid workflow ID format")
		return
	}

	err = h.svc.PublishWorkflow(c.Request.Context(), id, h.getUserID(c))
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.NoContent(c)
}

// ArchiveWorkflow handles POST /api/v1/workflows/:id/archive
func (h *WorkflowHandler) ArchiveWorkflow(c *gin.Context) {
	if !h.authorize(c, "workflow.archive") {
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid workflow ID format")
		return
	}

	err = h.svc.ArchiveWorkflow(c.Request.Context(), id, h.getUserID(c))
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.NoContent(c)
}

// CloneWorkflow handles POST /api/v1/workflows/:id/clone
func (h *WorkflowHandler) CloneWorkflow(c *gin.Context) {
	if !h.authorize(c, "workflow.clone") {
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "invalid workflow ID format")
		return
	}

	dto, err := h.svc.CloneWorkflow(c.Request.Context(), id, h.getUserID(c))
	if err != nil {
		h.handleError(c, err)
		return
	}

	response.OK(c, dto)
}
