package handler

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/assignment/application/dto"
	"github.com/nd/mes-platform/modules/assignment/application/service"
	"github.com/nd/mes-platform/modules/assignment/domain/repository"
	"github.com/nd/mes-platform/shared/pagination"
	"github.com/nd/mes-platform/shared/response"
)

type AssignmentHandler struct {
	svc *service.AssignmentService
}

func NewAssignmentHandler(svc *service.AssignmentService) *AssignmentHandler {
	return &AssignmentHandler{svc: svc}
}

// ProposeAssignment runs the scoring engine and creates a new proposed assignment.
func (h *AssignmentHandler) ProposeAssignment(c *gin.Context) {
	var req dto.ProposeAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}
	a, err := h.svc.ProposeAssignment(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "operation or workers")
			return
		}
		if errors.Is(err, service.ErrNoWorkers) {
			response.UnprocessableEntity(c, "NO_QUALIFIED_WORKERS", "no qualified workers found for this operation")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.Created(c, a)
}

// GetAssignment retrieves a single assignment with its workers.
func (h *AssignmentHandler) GetAssignment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid assignment ID format")
		return
	}
	a, err := h.svc.GetAssignment(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "assignment")
		return
	}
	response.OK(c, a)
}

// ListAssignments retrieves assignments with optional filtering.
func (h *AssignmentHandler) ListAssignments(c *gin.Context) {
	p := pagination.FromContext(c)
	filter := repository.AssignmentFilter{
		Status:   c.Query("status"),
		Page:     p.Page,
		PageSize: p.PageSize,
	}
	if woID := c.Query("work_order_id"); woID != "" {
		if id, parseErr := uuid.Parse(woID); parseErr == nil {
			filter.WorkOrderID = &id
		}
	}
	if opID := c.Query("operation_id"); opID != "" {
		if id, parseErr := uuid.Parse(opID); parseErr == nil {
			filter.OperationID = &id
		}
	}
	assignments, total, err := h.svc.ListAssignments(c.Request.Context(), filter)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.List(c, assignments, p.Page, p.PageSize, total)
}

// ApproveAssignment marks an assignment as approved by a manager.
func (h *AssignmentHandler) ApproveAssignment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid assignment ID format")
		return
	}
	var req dto.ApproveAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}
	if err := h.svc.ApproveAssignment(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "assignment")
			return
		}
		response.UnprocessableEntity(c, "INVALID_TRANSITION", err.Error())
		return
	}
	response.NoContent(c)
}

// RejectAssignment marks an assignment as rejected by a manager.
func (h *AssignmentHandler) RejectAssignment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid assignment ID format")
		return
	}
	var req dto.RejectAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}
	if err := h.svc.RejectAssignment(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "assignment")
			return
		}
		response.UnprocessableEntity(c, "INVALID_TRANSITION", err.Error())
		return
	}
	response.NoContent(c)
}

// OverrideAssignment creates a new revision with manually chosen workers.
func (h *AssignmentHandler) OverrideAssignment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid assignment ID format")
		return
	}
	var req dto.OverrideAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}
	a, err := h.svc.OverrideAssignment(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "assignment or workers")
			return
		}
		if errors.Is(err, service.ErrTransition) {
			response.UnprocessableEntity(c, "INVALID_TRANSITION", err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.Created(c, a)
}

// GetAssignmentHistory retrieves all revisions for a work order + operation.
func (h *AssignmentHandler) GetAssignmentHistory(c *gin.Context) {
	workOrderIDStr := c.Query("work_order_id")
	operationIDStr := c.Query("operation_id")
	if workOrderIDStr == "" || operationIDStr == "" {
		response.BadRequest(c, "MISSING_PARAMS", "work_order_id and operation_id are required")
		return
	}
	workOrderID, err := uuid.Parse(workOrderIDStr)
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid work_order_id format")
		return
	}
	operationID, err := uuid.Parse(operationIDStr)
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid operation_id format")
		return
	}
	history, err := h.svc.GetAssignmentHistory(c.Request.Context(), workOrderID, operationID)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, history)
}
