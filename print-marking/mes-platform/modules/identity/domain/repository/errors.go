package repository

import "errors"

// ─── Sentinel Errors ──────────────────────────────────────────────────────────
// These errors are defined in the domain repository package so that application
// services can match on them without depending on infrastructure packages.

var (
	// ErrUserNotFound is returned when a user query returns no results.
	ErrUserNotFound = errors.New("user not found")
	// ErrRoleNotFound is returned when a role query returns no results.
	ErrRoleNotFound = errors.New("role not found")
	// ErrPermissionNotFound is returned when a permission query returns no results.
	ErrPermissionNotFound = errors.New("permission not found")
	// ErrTokenNotFound is returned when a refresh token is not found.
	ErrTokenNotFound = errors.New("refresh token not found")
)
