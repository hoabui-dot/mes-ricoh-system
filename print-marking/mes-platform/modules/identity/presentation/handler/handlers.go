// Package handler contains the Gin HTTP handlers for the Identity module.
// Handlers are thin: they parse input, call the application service, and format the response.
// No business logic lives here.
package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/identity/application/dto"
	"github.com/nd/mes-platform/modules/identity/application/service"
	domainrepo "github.com/nd/mes-platform/modules/identity/domain/repository"
	"github.com/nd/mes-platform/shared/pagination"
	"github.com/nd/mes-platform/shared/response"
)

// AuthHandler handles authentication-related endpoints.
type AuthHandler struct {
	svc *service.IdentityService
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(svc *service.IdentityService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

// Register godoc
// @Summary      Register a new user
// @Description  Creates a new user account with the given credentials
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      dto.RegisterUserRequest  true  "Registration details"
// @Success      201   {object}  response.Envelope{data=dto.UserDTO}
// @Failure      400   {object}  response.Envelope
// @Failure      409   {object}  response.Envelope
// @Router       /api/v1/auth/register [post]
func (h *AuthHandler) Register(c *gin.Context) {
	var req dto.RegisterUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	user, err := h.svc.Register(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.UnprocessableEntity(c, "REGISTER_FAILED", err.Error())
		return
	}

	response.Created(c, user)
}

// Login godoc
// @Summary      Login
// @Description  Authenticates a user and returns a JWT token pair
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      dto.LoginRequest  true  "Login credentials"
// @Success      200   {object}  response.Envelope{data=dto.AuthResponse}
// @Failure      400   {object}  response.Envelope
// @Failure      401   {object}  response.Envelope
// @Router       /api/v1/auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	resp, err := h.svc.Login(c.Request.Context(), req, c.GetHeader("User-Agent"), c.ClientIP())
	if err != nil {
		if errors.Is(err, service.ErrUnauthorized) {
			response.Unauthorized(c, "invalid email or password")
			return
		}
		if errors.Is(err, service.ErrForbidden) {
			response.Forbidden(c, err.Error())
			return
		}
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	response.OK(c, resp)
}

// Refresh godoc
// @Summary      Refresh tokens
// @Description  Rotates the refresh token and returns a new token pair
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      dto.RefreshTokenRequest  true  "Refresh token"
// @Success      200   {object}  response.Envelope{data=dto.AuthResponse}
// @Failure      401   {object}  response.Envelope
// @Router       /api/v1/auth/refresh [post]
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req dto.RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	resp, err := h.svc.Refresh(c.Request.Context(), req, c.GetHeader("User-Agent"), c.ClientIP())
	if err != nil {
		response.Unauthorized(c, err.Error())
		return
	}

	response.OK(c, resp)
}

// Logout godoc
// @Summary      Logout
// @Description  Revokes all refresh tokens for the authenticated user
// @Tags         auth
// @Security     BearerAuth
// @Produce      json
// @Success      204
// @Failure      401   {object}  response.Envelope
// @Router       /api/v1/auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user context")
		return
	}

	if err := h.svc.Logout(c.Request.Context(), userID); err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	response.NoContent(c)
}

// Me godoc
// @Summary      Get current user profile
// @Description  Returns the authenticated user's profile
// @Tags         auth
// @Security     BearerAuth
// @Produce      json
// @Success      200   {object}  response.Envelope{data=dto.UserDTO}
// @Failure      401   {object}  response.Envelope
// @Router       /api/v1/auth/me [get]
func (h *AuthHandler) Me(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user context")
		return
	}

	user, err := h.svc.GetUser(c.Request.Context(), userID)
	if err != nil {
		response.NotFound(c, "user")
		return
	}

	response.OK(c, user)
}

// ChangePassword godoc
// @Summary      Change password
// @Description  Allows the authenticated user to change their own password
// @Tags         auth
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  dto.ChangePasswordRequest  true  "Password change"
// @Success      204
// @Failure      400   {object}  response.Envelope
// @Failure      401   {object}  response.Envelope
// @Router       /api/v1/auth/change-password [post]
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req dto.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user context")
		return
	}

	if err := h.svc.ChangePassword(c.Request.Context(), userID, req); err != nil {
		response.UnprocessableEntity(c, "CHANGE_PASSWORD_FAILED", err.Error())
		return
	}

	response.NoContent(c)
}

// ForgotPassword godoc
// @Summary      Forgot password
// @Description  Initiates the password reset flow by email
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body  dto.ForgotPasswordRequest  true  "Email"
// @Success      200   {object}  response.Envelope
// @Router       /api/v1/auth/forgot-password [post]
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req dto.ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	// We always return success to prevent email enumeration.
	_, _ = h.svc.ForgotPassword(c.Request.Context(), req, 0)
	response.OK(c, gin.H{"message": "if the email exists, a reset link has been sent"})
}

// UpdateProfile godoc
// @Summary      Update profile
// @Description  Updates the authenticated user's profile
// @Tags         auth
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      dto.UpdateProfileRequest  true  "Profile update"
// @Success      200   {object}  response.Envelope{data=dto.UserDTO}
// @Router       /api/v1/auth/profile [put]
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	var req dto.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user context")
		return
	}

	user, err := h.svc.UpdateProfile(c.Request.Context(), userID, req)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	response.OK(c, user)
}

// ─── UserHandler ──────────────────────────────────────────────────────────────

// UserHandler handles user administration endpoints.
type UserHandler struct {
	svc *service.IdentityService
}

// NewUserHandler creates a new UserHandler.
func NewUserHandler(svc *service.IdentityService) *UserHandler {
	return &UserHandler{svc: svc}
}

// ListUsers godoc
// @Summary      List users
// @Description  Returns a paginated list of users
// @Tags         users
// @Security     BearerAuth
// @Produce      json
// @Param        page       query  int     false  "Page number"
// @Param        page_size  query  int     false  "Items per page"
// @Param        search     query  string  false  "Search by username, email or full name"
// @Param        status     query  string  false  "Filter by status (active|inactive|suspended)"
// @Success      200        {object}  response.Envelope{data=[]dto.UserDTO}
// @Failure      401        {object}  response.Envelope
// @Router       /api/v1/users [get]
func (h *UserHandler) ListUsers(c *gin.Context) {
	p := pagination.FromContext(c)
	filter := domainrepo.UserFilter{
		Search:   c.Query("search"),
		Status:   c.Query("status"),
		Page:     p.Page,
		PageSize: p.PageSize,
	}

	users, total, err := h.svc.ListUsers(c.Request.Context(), filter)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	response.List(c, users, p.Page, p.PageSize, total)
}

// GetUser godoc
// @Summary      Get user by ID
// @Description  Returns a single user by their UUID
// @Tags         users
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  string  true  "User UUID"
// @Success      200 {object}  response.Envelope{data=dto.UserDTO}
// @Failure      404 {object}  response.Envelope
// @Router       /api/v1/users/{id} [get]
func (h *UserHandler) GetUser(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "user id must be a valid UUID")
		return
	}

	user, err := h.svc.GetUser(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "user")
		return
	}

	response.OK(c, user)
}

// UpdateUserStatus godoc
// @Summary      Update user status
// @Description  Admin endpoint to change a user's account status
// @Tags         users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  string                     true  "User UUID"
// @Param        body  body  dto.UpdateUserStatusRequest  true  "New status"
// @Success      204
// @Failure      404   {object}  response.Envelope
// @Router       /api/v1/users/{id}/status [patch]
func (h *UserHandler) UpdateUserStatus(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "user id must be a valid UUID")
		return
	}

	var req dto.UpdateUserStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	changedByStr := c.GetString("user_id")
	changedBy, _ := uuid.Parse(changedByStr)

	if err := h.svc.UpdateUserStatus(c.Request.Context(), id, changedBy, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "user")
			return
		}
		response.UnprocessableEntity(c, "STATUS_UPDATE_FAILED", err.Error())
		return
	}

	response.NoContent(c)
}

// AssignRole godoc
// @Summary      Assign role to user
// @Description  Assigns a role to the specified user
// @Tags         users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  string                 true  "User UUID"
// @Param        body  body  dto.AssignRoleRequest  true  "Role assignment"
// @Success      204
// @Failure      404   {object}  response.Envelope
// @Router       /api/v1/users/{id}/roles [post]
func (h *UserHandler) AssignRole(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "user id must be a valid UUID")
		return
	}

	var req dto.AssignRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	roleID, err := uuid.Parse(req.RoleID)
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "role id must be a valid UUID")
		return
	}

	if err := h.svc.AssignRole(c.Request.Context(), id, roleID); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "user or role")
			return
		}
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	c.Status(http.StatusNoContent)
}

// AssignUserRoles handles POST/PUT /api/v1/users/:id/roles to replace/assign user roles.
func (h *UserHandler) AssignUserRoles(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "user id must be a valid UUID")
		return
	}

	var req dto.AssignRolesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.AssignUserRoles(c.Request.Context(), userID, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "user")
			return
		}
		response.UnprocessableEntity(c, "ASSIGN_ROLES_FAILED", err.Error())
		return
	}

	c.Status(http.StatusNoContent)
}

// RemoveUserRole handles DELETE /api/v1/users/:id/roles/:roleId.
func (h *UserHandler) RemoveUserRole(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "user id must be a valid UUID")
		return
	}

	roleIDStr := c.Param("roleId")
	roleID, err := uuid.Parse(roleIDStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "role id must be a valid UUID")
		return
	}

	if err := h.svc.RemoveRole(c.Request.Context(), userID, roleID); err != nil {
		response.UnprocessableEntity(c, "REMOVE_ROLE_FAILED", err.Error())
		return
	}

	c.Status(http.StatusNoContent)
}

// ─── RoleHandler ──────────────────────────────────────────────────────────────

// RoleHandler handles role and permission management endpoints.
type RoleHandler struct {
	svc *service.IdentityService
}

// NewRoleHandler creates a new RoleHandler.
func NewRoleHandler(svc *service.IdentityService) *RoleHandler {
	return &RoleHandler{svc: svc}
}

// ListRoles godoc
// @Summary      List roles
// @Description  Returns paginated roles with permissions and user counts
// @Tags         roles
// @Security     BearerAuth
// @Produce      json
// @Param        page      query  int     false  "Page number"
// @Param        pageSize  query  int     false  "Page size"
// @Param        search    query  string  false  "Search keyword"
// @Param        sort      query  string  false  "Sort direction (asc, desc)"
// @Param        sortBy    query  string  false  "Sort column (name, code, created_at)"
// @Success      200       {object}  response.Envelope{data=[]dto.RoleDTO}
// @Router       /api/v1/roles [get]
func (h *RoleHandler) ListRoles(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))

	filter := domainrepo.RoleFilter{
		Page:     page,
		PageSize: pageSize,
		Search:   c.Query("search"),
		Sort:     c.Query("sort"),
		SortBy:   c.Query("sortBy"),
	}

	roles, total, err := h.svc.ListRolesPaginated(c.Request.Context(), filter)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.List(c, roles, page, pageSize, total)
}

// GetRole godoc
// @Summary      Get role details
// @Description  Returns details of a single role including assigned permissions and user count
// @Tags         roles
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      string  true  "Role ID"
// @Success      200  {object}  response.Envelope{data=dto.RoleDTO}
// @Router       /api/v1/roles/{id} [get]
func (h *RoleHandler) GetRole(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "role id must be a valid UUID")
		return
	}

	role, err := h.svc.GetRole(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "role")
			return
		}
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, role)
}

// CreateRole godoc
// @Summary      Create a role
// @Description  Creates a new RBAC role with permissions
// @Tags         roles
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      dto.CreateRoleRequest  true  "Role details"
// @Success      201   {object}  response.Envelope{data=dto.RoleDTO}
// @Failure      409   {object}  response.Envelope
// @Router       /api/v1/roles [post]
func (h *RoleHandler) CreateRole(c *gin.Context) {
	var req dto.CreateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	role, err := h.svc.CreateRole(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.UnprocessableEntity(c, "CREATE_ROLE_FAILED", err.Error())
		return
	}

	response.Created(c, role)
}

// UpdateRole godoc
// @Summary      Update a role
// @Description  Updates an existing role's details and permissions
// @Tags         roles
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path      string                 true  "Role ID"
// @Param        body  body      dto.UpdateRoleRequest  true  "Role updates"
// @Success      200   {object}  response.Envelope{data=dto.RoleDTO}
// @Router       /api/v1/roles/{id} [put]
func (h *RoleHandler) UpdateRole(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "role id must be a valid UUID")
		return
	}

	var req dto.UpdateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	role, err := h.svc.UpdateRole(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "role")
			return
		}
		response.UnprocessableEntity(c, "UPDATE_ROLE_FAILED", err.Error())
		return
	}

	response.OK(c, role)
}

// DeleteRole godoc
// @Summary      Delete a role
// @Description  Deletes a custom role. System roles and roles in use cannot be deleted.
// @Tags         roles
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      string  true  "Role ID"
// @Success      204
// @Router       /api/v1/roles/{id} [delete]
func (h *RoleHandler) DeleteRole(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "INVALID_UUID", "role id must be a valid UUID")
		return
	}

	if err := h.svc.DeleteRole(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "role")
			return
		}
		if errors.Is(err, service.ErrForbidden) {
			response.Forbidden(c, err.Error())
			return
		}
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.UnprocessableEntity(c, "DELETE_ROLE_FAILED", err.Error())
		return
	}

	c.Status(http.StatusNoContent)
}

// ListPermissions godoc
// @Summary      List permissions
// @Description  Returns all permissions (or grouped by module if ?grouped=true)
// @Tags         permissions
// @Security     BearerAuth
// @Produce      json
// @Param        grouped  query  bool  false  "Group permissions by module"
// @Success      200      {object}  response.Envelope{data=[]dto.PermissionDTO}
// @Router       /api/v1/permissions [get]
func (h *RoleHandler) ListPermissions(c *gin.Context) {
	if c.Query("grouped") == "true" {
		grouped, err := h.svc.GetGroupedPermissions(c.Request.Context())
		if err != nil {
			response.InternalServerError(c, c.GetString("trace_id"))
			return
		}
		response.OK(c, grouped)
		return
	}

	perms, err := h.svc.ListPermissions(c.Request.Context())
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, perms)
}

// CreatePermission godoc
// @Summary      Create a permission
// @Description  Creates a new permission following the resource.action convention
// @Tags         permissions
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      dto.CreatePermissionRequest  true  "Permission details"
// @Success      201   {object}  response.Envelope{data=dto.PermissionDTO}
// @Router       /api/v1/permissions [post]
func (h *RoleHandler) CreatePermission(c *gin.Context) {
	var req dto.CreatePermissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	perm, err := h.svc.CreatePermission(c.Request.Context(), req)
	if err != nil {
		response.UnprocessableEntity(c, "CREATE_PERMISSION_FAILED", err.Error())
		return
	}

	response.Created(c, perm)
}
