package handler

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/identity/infrastructure/rbac"
	"github.com/nd/mes-platform/modules/workforce/application/dto"
	"github.com/nd/mes-platform/modules/workforce/application/service"
	"github.com/nd/mes-platform/modules/workforce/domain/repository"
	"github.com/nd/mes-platform/shared/pagination"
	"github.com/nd/mes-platform/shared/response"
)

type WorkforceHandler struct {
	svc      *service.WorkforceService
	enforcer *rbac.Enforcer
}

func NewWorkforceHandler(svc *service.WorkforceService, enforcer *rbac.Enforcer) *WorkforceHandler {
	return &WorkforceHandler{
		svc:      svc,
		enforcer: enforcer,
	}
}

// authorize checks if the logged-in user has the required permission
func (h *WorkforceHandler) authorize(c *gin.Context, permission string) bool {
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

// ─── Worker Endpoints ──────────────────────────────────────────────────────────

func (h *WorkforceHandler) CreateWorker(c *gin.Context) {
	if !h.authorize(c, "worker.create") {
		return
	}

	var req dto.CreateWorkerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	w, err := h.svc.CreateWorker(c.Request.Context(), req)
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

	response.Created(c, w)
}

func (h *WorkforceHandler) UpdateWorker(c *gin.Context) {
	if !h.authorize(c, "worker.update") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid worker ID format")
		return
	}

	var req dto.UpdateWorkerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	w, err := h.svc.UpdateWorker(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "worker")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.OK(c, w)
}

func (h *WorkforceHandler) GetWorker(c *gin.Context) {
	if !h.authorize(c, "worker.read") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid worker ID format")
		return
	}

	w, err := h.svc.GetWorker(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "worker")
		return
	}

	response.OK(c, w)
}

func (h *WorkforceHandler) ListWorkers(c *gin.Context) {
	if !h.authorize(c, "worker.read") {
		return
	}

	p := pagination.FromContext(c)
	filter := repository.WorkerFilter{
		Search:       c.Query("search"),
		Status:       c.Query("status"),
		Availability: c.Query("availability"),
		Page:         p.Page,
		PageSize:     p.PageSize,
	}

	if dept := c.Query("department_id"); dept != "" {
		if did, err := uuid.Parse(dept); err == nil {
			filter.DepartmentID = &did
		}
	}
	if ws := c.Query("workshop_id"); ws != "" {
		if wid, err := uuid.Parse(ws); err == nil {
			filter.WorkshopID = &wid
		}
	}
	if team := c.Query("team_id"); team != "" {
		if tid, err := uuid.Parse(team); err == nil {
			filter.TeamID = &tid
		}
	}

	workers, total, err := h.svc.ListWorkers(c.Request.Context(), filter)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	response.List(c, workers, p.Page, p.PageSize, total)
}

func (h *WorkforceHandler) DeleteWorker(c *gin.Context) {
	if !h.authorize(c, "worker.delete") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid worker ID format")
		return
	}

	if err := h.svc.DeleteWorker(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "worker")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *WorkforceHandler) RestoreWorker(c *gin.Context) {
	if !h.authorize(c, "worker.restore") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid worker ID format")
		return
	}

	if err := h.svc.RestoreWorker(c.Request.Context(), id); err != nil {
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *WorkforceHandler) UpdateAvailability(c *gin.Context) {
	if !h.authorize(c, "worker.update") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid worker ID format")
		return
	}

	var req dto.UpdateAvailabilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.UpdateAvailability(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "worker")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *WorkforceHandler) UpdateWorkerSkills(c *gin.Context) {
	if !h.authorize(c, "skill.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid worker ID format")
		return
	}

	var req dto.UpdateSkillsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.UpdateWorkerSkills(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "worker or skill")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *WorkforceHandler) AddCertificate(c *gin.Context) {
	if !h.authorize(c, "certificate.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid worker ID format")
		return
	}

	var req dto.AddCertificateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	cert, err := h.svc.AddCertificate(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "worker")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}

	response.Created(c, cert)
}

func (h *WorkforceHandler) ListWorkerCertificates(c *gin.Context) {
	if !h.authorize(c, "certificate.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid worker ID format")
		return
	}

	certs, err := h.svc.ListWorkerCertificates(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "worker")
		return
	}

	response.OK(c, certs)
}

// ─── Skill Endpoints ───────────────────────────────────────────────────────────

func (h *WorkforceHandler) CreateSkill(c *gin.Context) {
	if !h.authorize(c, "skill.manage") {
		return
	}

	var req dto.CreateSkillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	sk, err := h.svc.CreateSkill(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.Created(c, sk)
}

func (h *WorkforceHandler) UpdateSkill(c *gin.Context) {
	if !h.authorize(c, "skill.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid skill ID format")
		return
	}

	var req dto.UpdateSkillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	sk, err := h.svc.UpdateSkill(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "skill")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.OK(c, sk)
}

func (h *WorkforceHandler) DeleteSkill(c *gin.Context) {
	if !h.authorize(c, "skill.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid skill ID format")
		return
	}

	if err := h.svc.DeleteSkill(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "skill")
			return
		}
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.NoContent(c)
}

func (h *WorkforceHandler) ListSkills(c *gin.Context) {
	if !h.authorize(c, "skill.manage") {
		return
	}

	skills, err := h.svc.ListSkills(c.Request.Context())
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, skills)
}

// ─── Org Endpoints ─────────────────────────────────────────────────────────────

func (h *WorkforceHandler) CreateDepartment(c *gin.Context) {
	if !h.authorize(c, "department.manage") {
		return
	}

	var req dto.CreateDepartmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	dept, err := h.svc.CreateDepartment(c.Request.Context(), req)
	if err != nil {
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.Created(c, dept)
}

func (h *WorkforceHandler) UpdateDepartment(c *gin.Context) {
	if !h.authorize(c, "department.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid department ID format")
		return
	}

	var req dto.UpdateDepartmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	dept, err := h.svc.UpdateDepartment(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "department")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.OK(c, dept)
}

func (h *WorkforceHandler) DeleteDepartment(c *gin.Context) {
	if !h.authorize(c, "department.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid department ID format")
		return
	}

	if err := h.svc.DeleteDepartment(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "department")
			return
		}
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.NoContent(c)
}

func (h *WorkforceHandler) ListDepartments(c *gin.Context) {
	if !h.authorize(c, "department.manage") {
		return
	}

	depts, err := h.svc.ListDepartments(c.Request.Context())
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, depts)
}

func (h *WorkforceHandler) GetDepartment(c *gin.Context) {
	if !h.authorize(c, "department.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid department ID format")
		return
	}

	dept, err := h.svc.GetDepartment(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "department")
		return
	}
	response.OK(c, dept)
}

func (h *WorkforceHandler) CreateWorkshop(c *gin.Context) {
	if !h.authorize(c, "workshop.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid department ID format")
		return
	}
	var req dto.CreateWorkshopRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	ws, err := h.svc.CreateWorkshop(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "department")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.Created(c, ws)
}

func (h *WorkforceHandler) UpdateWorkshop(c *gin.Context) {
	if !h.authorize(c, "workshop.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid workshop ID format")
		return
	}

	var req dto.UpdateWorkshopRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	ws, err := h.svc.UpdateWorkshop(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "workshop")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.OK(c, ws)
}

func (h *WorkforceHandler) DeleteWorkshop(c *gin.Context) {
	if !h.authorize(c, "workshop.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid workshop ID format")
		return
	}

	if err := h.svc.DeleteWorkshop(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "workshop")
			return
		}
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.NoContent(c)
}

func (h *WorkforceHandler) ListWorkshops(c *gin.Context) {
	if !h.authorize(c, "workshop.manage") {
		return
	}

	var deptID *uuid.UUID
	if dept := c.Query("department_id"); dept != "" {
		if did, err := uuid.Parse(dept); err == nil {
			deptID = &did
		}
	}
	workshops, err := h.svc.ListWorkshops(c.Request.Context(), deptID)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, workshops)
}

func (h *WorkforceHandler) GetWorkshop(c *gin.Context) {
	if !h.authorize(c, "workshop.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid workshop ID format")
		return
	}

	w, err := h.svc.GetWorkshop(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "workshop")
		return
	}
	response.OK(c, w)
}

func (h *WorkforceHandler) CreateTeam(c *gin.Context) {
	if !h.authorize(c, "team.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid workshop ID format")
		return
	}
	var req dto.CreateTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	t, err := h.svc.CreateTeam(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "workshop")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.Created(c, t)
}

func (h *WorkforceHandler) UpdateTeam(c *gin.Context) {
	if !h.authorize(c, "team.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid team ID format")
		return
	}

	var req dto.UpdateTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	t, err := h.svc.UpdateTeam(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "team")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.OK(c, t)
}

func (h *WorkforceHandler) DeleteTeam(c *gin.Context) {
	if !h.authorize(c, "team.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid team ID format")
		return
	}

	if err := h.svc.DeleteTeam(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "team")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.NoContent(c)
}

func (h *WorkforceHandler) ListTeams(c *gin.Context) {
	if !h.authorize(c, "team.manage") {
		return
	}

	var wsID *uuid.UUID
	if ws := c.Query("workshop_id"); ws != "" {
		if wid, err := uuid.Parse(ws); err == nil {
			wsID = &wid
		}
	}
	teams, err := h.svc.ListTeams(c.Request.Context(), wsID)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, teams)
}

func (h *WorkforceHandler) GetTeam(c *gin.Context) {
	if !h.authorize(c, "team.manage") {
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid team ID format")
		return
	}

	t, err := h.svc.GetTeam(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "team")
		return
	}
	response.OK(c, t)
}
