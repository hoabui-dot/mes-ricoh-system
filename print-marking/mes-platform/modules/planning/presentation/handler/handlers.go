package handler

import (
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/identity/infrastructure/rbac"
	"github.com/nd/mes-platform/modules/planning/application/dto"
	"github.com/nd/mes-platform/modules/planning/application/service"
	"github.com/nd/mes-platform/modules/planning/domain/repository"
	"github.com/nd/mes-platform/shared/pagination"
	"github.com/nd/mes-platform/shared/response"
)

type PlanningHandler struct {
	svc      *service.PlanningService
	enforcer *rbac.Enforcer
}

func NewPlanningHandler(svc *service.PlanningService, enforcer *rbac.Enforcer) *PlanningHandler {
	return &PlanningHandler{
		svc:      svc,
		enforcer: enforcer,
	}
}

func (h *PlanningHandler) authorize(c *gin.Context, permission string) bool {
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

// ─── Shift Template Endpoints ─────────────────────────────────────────────────

func (h *PlanningHandler) CreateShiftTemplate(c *gin.Context) {
	if !h.authorize(c, "shift.create") {
		return
	}

	var req dto.CreateShiftTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	tpl, err := h.svc.CreateShiftTemplate(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.Created(c, tpl)
}

func (h *PlanningHandler) UpdateShiftTemplate(c *gin.Context) {
	if !h.authorize(c, "shift.update") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid template ID format")
		return
	}

	var req dto.UpdateShiftTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	tpl, err := h.svc.UpdateShiftTemplate(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, err.Error())
			return
		}
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.OK(c, tpl)
}

func (h *PlanningHandler) DeleteShiftTemplate(c *gin.Context) {
	if !h.authorize(c, "shift.delete") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid template ID format")
		return
	}

	if err := h.svc.DeleteShiftTemplate(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.OK(c, gin.H{"message": "shift template deleted successfully"})
}

func (h *PlanningHandler) ListShiftTemplates(c *gin.Context) {
	if !h.authorize(c, "schedule.read") {
		return
	}

	tpls, err := h.svc.ListShiftTemplates(c.Request.Context())
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, tpls)
}

// ─── Daily Shift Endpoints ────────────────────────────────────────────────────

func (h *PlanningHandler) CreateShift(c *gin.Context) {
	var req dto.CreateShiftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	sh, err := h.svc.CreateShift(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.Created(c, sh)
}

func (h *PlanningHandler) ListShifts(c *gin.Context) {
	start := c.Query("start_date")
	end := c.Query("end_date")
	if start == "" || end == "" {
		response.BadRequest(c, "MISSING_PARAMS", "start_date and end_date queries are required")
		return
	}

	shifts, err := h.svc.ListShifts(c.Request.Context(), start, end)
	if err != nil {
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.OK(c, shifts)
}

func (h *PlanningHandler) AssignTeamToShift(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid shift ID format")
		return
	}

	var req dto.AssignTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.AssignTeamToShift(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "shift")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *PlanningHandler) AssignWorkerToShift(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid shift ID format")
		return
	}

	var req dto.AssignWorkerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.AssignWorkerToShift(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "shift")
			return
		}
		if errors.Is(err, service.ErrWorkerOnLeave) {
			response.UnprocessableEntity(c, "WORKER_ON_LEAVE", err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.NoContent(c)
}

// ─── Holiday Endpoints ────────────────────────────────────────────────────────

func (h *PlanningHandler) CreateHoliday(c *gin.Context) {
	var req dto.CreateHolidayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	holiday, err := h.svc.CreateHoliday(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.Created(c, holiday)
}

func (h *PlanningHandler) ListHolidays(c *gin.Context) {
	start := c.Query("start_date")
	end := c.Query("end_date")
	if start == "" || end == "" {
		response.BadRequest(c, "MISSING_PARAMS", "start_date and end_date queries are required")
		return
	}

	list, err := h.svc.ListHolidays(c.Request.Context(), start, end)
	if err != nil {
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.OK(c, list)
}

// ─── Leave Endpoints ──────────────────────────────────────────────────────────

func (h *PlanningHandler) RequestLeave(c *gin.Context) {
	var req dto.RequestLeaveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	leave, err := h.svc.RequestLeave(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.Created(c, leave)
}

func (h *PlanningHandler) ApproveLeave(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid leave request ID format")
		return
	}

	var req dto.ApproveRejectLeaveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.ApproveLeave(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "leave request")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *PlanningHandler) RejectLeave(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid leave request ID format")
		return
	}

	var req dto.ApproveRejectLeaveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.RejectLeave(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "leave request")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *PlanningHandler) ListLeaves(c *gin.Context) {
	p := pagination.FromContext(c)
	filter := repository.LeaveFilter{
		Status:   c.Query("status"),
		Page:     p.Page,
		PageSize: p.PageSize,
	}
	if w := c.Query("worker_id"); w != "" {
		if wid, err := uuid.Parse(w); err == nil {
			filter.WorkerID = &wid
		}
	}

	leaves, total, err := h.svc.ListLeaves(c.Request.Context(), filter)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	response.List(c, leaves, p.Page, p.PageSize, total)
}

// ─── Overtime Endpoints ───────────────────────────────────────────────────────

func (h *PlanningHandler) RequestOvertime(c *gin.Context) {
	var req dto.RequestOvertimeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	ot, err := h.svc.RequestOvertime(c.Request.Context(), req)
	if err != nil {
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.Created(c, ot)
}

func (h *PlanningHandler) ApproveOvertime(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid overtime request ID format")
		return
	}

	var req dto.ApproveRejectOvertimeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.ApproveOvertime(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "overtime request")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *PlanningHandler) RejectOvertime(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid overtime request ID format")
		return
	}

	var req dto.ApproveRejectOvertimeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.RejectOvertime(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "overtime request")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *PlanningHandler) ListOvertimes(c *gin.Context) {
	p := pagination.FromContext(c)
	filter := repository.OvertimeFilter{
		Status:   c.Query("status"),
		Page:     p.Page,
		PageSize: p.PageSize,
	}
	if w := c.Query("worker_id"); w != "" {
		if wid, err := uuid.Parse(w); err == nil {
			filter.WorkerID = &wid
		}
	}

	overtimes, total, err := h.svc.ListOvertimes(c.Request.Context(), filter)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	response.List(c, overtimes, p.Page, p.PageSize, total)
}

// ─── Calendar & Scheduling Endpoints ──────────────────────────────────────────

func (h *PlanningHandler) GenerateCalendar(c *gin.Context) {
	if !h.authorize(c, "calendar.generate") {
		return
	}

	var req dto.GenerateCalendarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.GenerateCalendar(c.Request.Context(), req); err != nil {
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.OK(c, gin.H{"message": "calendar generated successfully"})
}

func (h *PlanningHandler) GetScheduleGrid(c *gin.Context) {
	if !h.authorize(c, "schedule.read") {
		return
	}

	year, errY := strconv.Atoi(c.Query("year"))
	month, errM := strconv.Atoi(c.Query("month"))
	if errY != nil || errM != nil {
		now := time.Now()
		year = now.Year()
		month = int(now.Month())
	}

	var workshopID *uuid.UUID
	if w := c.Query("workshop_id"); w != "" {
		if wid, err := uuid.Parse(w); err == nil {
			workshopID = &wid
		}
	}

	var teamID *uuid.UUID
	if t := c.Query("team_id"); t != "" {
		if tid, err := uuid.Parse(t); err == nil {
			teamID = &tid
		}
	}

	grid, err := h.svc.GetScheduleGrid(c.Request.Context(), workshopID, teamID, year, month)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	response.OK(c, grid)
}

func (h *PlanningHandler) AssignTeamSchedule(c *gin.Context) {
	if !h.authorize(c, "team.assign") {
		return
	}

	var req dto.TeamAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.AssignTeamSchedule(c.Request.Context(), req); err != nil {
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.OK(c, gin.H{"message": "team schedule assigned successfully"})
}

func (h *PlanningHandler) RemoveWorkerSchedule(c *gin.Context) {
	if !h.authorize(c, "schedule.assign") {
		return
	}

	shiftID, errS := uuid.Parse(c.Param("id"))
	workerID, errW := uuid.Parse(c.Param("workerId"))
	if errS != nil || errW != nil {
		response.BadRequest(c, "INVALID_ID", "invalid shift ID or worker ID format")
		return
	}

	if err := h.svc.RemoveWorkerSchedule(c.Request.Context(), shiftID, workerID); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.OK(c, gin.H{"message": "worker assignment removed successfully"})
}

func (h *PlanningHandler) GetWorkersAvailability(c *gin.Context) {
	if !h.authorize(c, "schedule.read") {
		return
	}

	dateStr := c.Query("date")
	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}

	avail, err := h.svc.GetWorkersAvailability(c.Request.Context(), dateStr)
	if err != nil {
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.OK(c, avail)
}
