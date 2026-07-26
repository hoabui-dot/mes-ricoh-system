// Package dto defines Data Transfer Objects for the Identity module.
// DTOs carry data between the presentation layer and the application service.
// They must not contain any business logic.
package dto

import (
	"time"

	"github.com/google/uuid"
)

// ─── Auth DTOs ────────────────────────────────────────────────────────────────

// RegisterUserRequest is the input for creating a new user account.
type RegisterUserRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Email    string `json:"email"    binding:"required,email"`
	FullName string `json:"full_name" binding:"required,min=2,max=100"`
	Password string `json:"password" binding:"required,min=8"`
}

// LoginRequest is the input for authenticating a user.
type LoginRequest struct {
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// RefreshTokenRequest carries the refresh token for token rotation.
type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// ChangePasswordRequest is the input for changing a user's own password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password"     binding:"required,min=8"`
}

// ForgotPasswordRequest initiates the password reset flow.
type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// ResetPasswordRequest completes the password reset flow.
type ResetPasswordRequest struct {
	Token       string `json:"token"        binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// UpdateProfileRequest is the input for updating profile fields.
type UpdateProfileRequest struct {
	FullName string `json:"full_name" binding:"required,min=2,max=100"`
	Phone    string `json:"phone"     binding:"max=20"`
}

// ─── Auth Response DTOs ───────────────────────────────────────────────────────

// AuthResponse is returned on successful login or token refresh.
type AuthResponse struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	TokenType    string    `json:"token_type"`
	ExpiresAt    time.Time `json:"expires_at"`
	User         UserDTO   `json:"user"`
}

// ─── User DTOs ────────────────────────────────────────────────────────────────

// UserDTO is the public view of a user returned from API responses.
// Sensitive fields (PasswordHash, ResetToken) are never included.
type UserDTO struct {
	ID          uuid.UUID `json:"id"`
	Username    string    `json:"username"`
	Email       string    `json:"email"`
	FullName    string    `json:"full_name"`
	Phone       string    `json:"phone"`
	Status      string    `json:"status"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Roles       []RoleDTO `json:"roles,omitempty"`
}

// CreateUserRequest is the admin input for creating a managed user.
type CreateUserRequest struct {
	Username string   `json:"username"  binding:"required,min=3,max=50"`
	Email    string   `json:"email"     binding:"required,email"`
	FullName string   `json:"full_name" binding:"required,min=2,max=100"`
	Password string   `json:"password"  binding:"required,min=8"`
	RoleIDs  []string `json:"role_ids"`
}

// UpdateUserStatusRequest is the admin input for changing a user's status.
type UpdateUserStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=active inactive suspended"`
}

// ─── Role DTOs ────────────────────────────────────────────────────────────────

// RoleDTO is the public view of a role.
type RoleDTO struct {
	ID          uuid.UUID       `json:"id"`
	Name        string          `json:"name"`
	Code        string          `json:"code"`
	Description string          `json:"description"`
	IsSystem    bool            `json:"is_system"`
	UsersCount  int             `json:"users_count"`
	Permissions []PermissionDTO `json:"permissions,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// CreateRoleRequest is the input for creating a new role.
type CreateRoleRequest struct {
	Name          string   `json:"name"           binding:"required,min=2,max=100"`
	Code          string   `json:"code"           binding:"omitempty,max=100"`
	Description   string   `json:"description"    binding:"max=255"`
	PermissionIDs []string `json:"permission_ids" binding:"required,min=1"`
}

// UpdateRoleRequest is the input for updating an existing role.
type UpdateRoleRequest struct {
	Name          string   `json:"name"           binding:"required,min=2,max=100"`
	Description   string   `json:"description"    binding:"max=255"`
	PermissionIDs []string `json:"permission_ids" binding:"required,min=1"`
}

// AssignRoleRequest assigns a role to a user.
type AssignRoleRequest struct {
	RoleID string `json:"role_id" binding:"required,uuid"`
}

// AssignRolesRequest assigns multiple roles to a user.
type AssignRolesRequest struct {
	RoleIDs []string `json:"role_ids" binding:"required"`
}

// ─── Permission DTOs ──────────────────────────────────────────────────────────

// PermissionDTO is the public view of a permission.
type PermissionDTO struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Resource    string    `json:"resource"`
	Action      string    `json:"action"`
	Module      string    `json:"module"`
	DisplayName string    `json:"display_name"`
	Category    string    `json:"category"`
}

// PermissionGroupDTO represents permissions grouped by module.
type PermissionGroupDTO struct {
	Module      string          `json:"module"`
	Permissions []PermissionDTO `json:"permissions"`
}

// CreatePermissionRequest is the input for creating a permission.
type CreatePermissionRequest struct {
	Name        string `json:"name"        binding:"required"`
	Description string `json:"description" binding:"max=255"`
	Module      string `json:"module"      binding:"omitempty"`
	DisplayName string `json:"display_name" binding:"omitempty"`
	Category    string `json:"category"    binding:"omitempty"`
}
