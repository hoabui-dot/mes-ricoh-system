// Package repository defines the repository interfaces for the Identity module.
// Only interfaces live here — implementations belong in the infrastructure layer.
// This keeps the domain free of any persistence concerns.
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/identity/domain/entity"
)

// UserRepository defines persistence operations for the User aggregate.
type UserRepository interface {
	// Save creates or updates a User (upsert semantics).
	Save(ctx context.Context, user *entity.User) error
	// FindByID returns the User with the given ID, or ErrNotFound.
	FindByID(ctx context.Context, id uuid.UUID) (*entity.User, error)
	// FindByEmail returns the User with the given email, or ErrNotFound.
	FindByEmail(ctx context.Context, email string) (*entity.User, error)
	// FindByUsername returns the User with the given username, or ErrNotFound.
	FindByUsername(ctx context.Context, username string) (*entity.User, error)
	// ExistsByEmail returns true if a non-deleted user with the email exists.
	ExistsByEmail(ctx context.Context, email string) (bool, error)
	// ExistsByUsername returns true if a non-deleted user with the username exists.
	ExistsByUsername(ctx context.Context, username string) (bool, error)
	// List returns a paginated list of users.
	List(ctx context.Context, filter UserFilter) ([]*entity.User, int64, error)
	// Delete soft-deletes a user by ID.
	Delete(ctx context.Context, id uuid.UUID) error
}

// UserFilter holds query parameters for listing users.
type UserFilter struct {
	Search   string
	Status   string
	Page     int
	PageSize int
}

// RoleFilter holds query parameters for listing roles.
type RoleFilter struct {
	Search   string
	Sort     string
	SortBy   string
	Page     int
	PageSize int
}

// RoleRepository defines persistence operations for Roles.
type RoleRepository interface {
	// Save creates or updates a Role.
	Save(ctx context.Context, role *entity.Role) error
	// FindByID returns the Role with the given ID, or ErrNotFound.
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Role, error)
	// FindByName returns the Role with the given name, or ErrNotFound.
	FindByName(ctx context.Context, name string) (*entity.Role, error)
	// FindByCode returns the Role with the given code, or ErrNotFound.
	FindByCode(ctx context.Context, code string) (*entity.Role, error)
	// ExistsByName returns true if a role with the name already exists.
	ExistsByName(ctx context.Context, name string) (bool, error)
	// ExistsByCode returns true if a role with the code already exists.
	ExistsByCode(ctx context.Context, code string) (bool, error)
	// List returns all roles with their associated permissions.
	List(ctx context.Context) ([]*entity.Role, error)
	// ListPaginated returns a paginated list of roles with permissions and user counts.
	ListPaginated(ctx context.Context, filter RoleFilter) ([]*entity.Role, int64, error)
	// AssignPermission adds a Permission to a Role.
	AssignPermission(ctx context.Context, roleID, permissionID uuid.UUID) error
	// RemovePermission removes a Permission from a Role.
	RemovePermission(ctx context.Context, roleID, permissionID uuid.UUID) error
	// ReplacePermissions sets the exact list of permissions assigned to a role.
	ReplacePermissions(ctx context.Context, roleID uuid.UUID, permissionIDs []uuid.UUID) error
	// CountAssignedUsers returns the number of users currently assigned to a role.
	CountAssignedUsers(ctx context.Context, roleID uuid.UUID) (int64, error)
	// Delete removes a role by ID.
	Delete(ctx context.Context, id uuid.UUID) error
}

// PermissionRepository defines persistence operations for Permissions.
type PermissionRepository interface {
	// Save creates or updates a Permission.
	Save(ctx context.Context, permission *entity.Permission) error
	// FindByID returns the Permission with the given ID, or ErrNotFound.
	FindByID(ctx context.Context, id uuid.UUID) (*entity.Permission, error)
	// FindByName returns the Permission with the given name, or ErrNotFound.
	FindByName(ctx context.Context, name string) (*entity.Permission, error)
	// FindByIDs returns a list of permissions matching the given IDs.
	FindByIDs(ctx context.Context, ids []uuid.UUID) ([]*entity.Permission, error)
	// List returns all permissions.
	List(ctx context.Context) ([]*entity.Permission, error)
	// ListGroupedByModule returns all permissions grouped by module name.
	ListGroupedByModule(ctx context.Context) (map[string][]*entity.Permission, error)
	// FindByUserID returns all permissions transitively held by a user via their roles.
	FindByUserID(ctx context.Context, userID uuid.UUID) ([]*entity.Permission, error)
}

// RefreshTokenRepository defines persistence operations for RefreshTokens.
type RefreshTokenRepository interface {
	// Save creates a new refresh token record.
	Save(ctx context.Context, token *entity.RefreshToken) error
	// FindByTokenHash returns the token record for a given hash, or ErrNotFound.
	FindByTokenHash(ctx context.Context, tokenHash string) (*entity.RefreshToken, error)
	// RevokeAllForUser revokes all active tokens for a user (logout from all devices).
	RevokeAllForUser(ctx context.Context, userID uuid.UUID) error
	// DeleteExpired removes all expired refresh tokens (called by a maintenance job).
	DeleteExpired(ctx context.Context) (int64, error)
}

// UserRoleRepository manages the many-to-many relationship between Users and Roles.
type UserRoleRepository interface {
	// AssignRole adds a role to a user.
	AssignRole(ctx context.Context, userID, roleID uuid.UUID) error
	// AssignRoles assigns multiple roles to a user.
	AssignRoles(ctx context.Context, userID uuid.UUID, roleIDs []uuid.UUID) error
	// ReplaceRoles replaces all existing roles of a user with a new list of roles.
	ReplaceRoles(ctx context.Context, userID uuid.UUID, roleIDs []uuid.UUID) error
	// RemoveRole removes a role from a user.
	RemoveRole(ctx context.Context, userID, roleID uuid.UUID) error
	// FindRolesByUserID returns all roles assigned to a user.
	FindRolesByUserID(ctx context.Context, userID uuid.UUID) ([]*entity.Role, error)
}
