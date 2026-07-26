package entity

import (
	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Domain Events ────────────────────────────────────────────────────────────
// All identity domain events follow the naming convention: mes.identity.<EventName>

// UserRegisteredEvent is raised when a new user is successfully created.
type UserRegisteredEvent struct {
	domain.BaseDomainEvent
	UserID   uuid.UUID `json:"user_id"`
	Username string    `json:"username"`
	Email    string    `json:"email"`
}

// NewUserRegisteredEvent creates a UserRegisteredEvent.
func NewUserRegisteredEvent(userID uuid.UUID, username, email string) UserRegisteredEvent {
	return UserRegisteredEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.identity.UserRegistered"),
		UserID:          userID,
		Username:        username,
		Email:           email,
	}
}

// UserLoggedInEvent is raised on successful login.
type UserLoggedInEvent struct {
	domain.BaseDomainEvent
	UserID    uuid.UUID `json:"user_id"`
	Username  string    `json:"username"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
}

// NewUserLoggedInEvent creates a UserLoggedInEvent.
func NewUserLoggedInEvent(userID uuid.UUID, username, ip, ua string) UserLoggedInEvent {
	return UserLoggedInEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.identity.UserLoggedIn"),
		UserID:          userID,
		Username:        username,
		IPAddress:       ip,
		UserAgent:       ua,
	}
}

// PasswordChangedEvent is raised when a user changes or resets their password.
type PasswordChangedEvent struct {
	domain.BaseDomainEvent
	UserID uuid.UUID `json:"user_id"`
	Reason string    `json:"reason"` // "self_change" | "reset"
}

// NewPasswordChangedEvent creates a PasswordChangedEvent.
func NewPasswordChangedEvent(userID uuid.UUID, reason string) PasswordChangedEvent {
	return PasswordChangedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.identity.PasswordChanged"),
		UserID:          userID,
		Reason:          reason,
	}
}

// RoleCreatedEvent is raised when a new role is created.
type RoleCreatedEvent struct {
	domain.BaseDomainEvent
	RoleID uuid.UUID `json:"role_id"`
	Code   string    `json:"code"`
	Name   string    `json:"name"`
}

func NewRoleCreatedEvent(roleID uuid.UUID, code, name string) RoleCreatedEvent {
	return RoleCreatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.identity.RoleCreated"),
		RoleID:          roleID,
		Code:            code,
		Name:            name,
	}
}

// RoleUpdatedEvent is raised when a role is updated.
type RoleUpdatedEvent struct {
	domain.BaseDomainEvent
	RoleID uuid.UUID `json:"role_id"`
	Code   string    `json:"code"`
	Name   string    `json:"name"`
}

func NewRoleUpdatedEvent(roleID uuid.UUID, code, name string) RoleUpdatedEvent {
	return RoleUpdatedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.identity.RoleUpdated"),
		RoleID:          roleID,
		Code:            code,
		Name:            name,
	}
}

// RoleDeletedEvent is raised when a role is deleted.
type RoleDeletedEvent struct {
	domain.BaseDomainEvent
	RoleID uuid.UUID `json:"role_id"`
	Code   string    `json:"code"`
}

func NewRoleDeletedEvent(roleID uuid.UUID, code string) RoleDeletedEvent {
	return RoleDeletedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.identity.RoleDeleted"),
		RoleID:          roleID,
		Code:            code,
	}
}

// UserRoleAssignedEvent is raised when roles are assigned to a user.
type UserRoleAssignedEvent struct {
	domain.BaseDomainEvent
	UserID  uuid.UUID   `json:"user_id"`
	RoleIDs []uuid.UUID `json:"role_ids"`
}

func NewUserRoleAssignedEvent(userID uuid.UUID, roleIDs []uuid.UUID) UserRoleAssignedEvent {
	return UserRoleAssignedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.identity.UserRoleAssigned"),
		UserID:          userID,
		RoleIDs:         roleIDs,
	}
}

// UserRoleRemovedEvent is raised when a role is removed from a user.
type UserRoleRemovedEvent struct {
	domain.BaseDomainEvent
	UserID uuid.UUID `json:"user_id"`
	RoleID uuid.UUID `json:"role_id"`
}

func NewUserRoleRemovedEvent(userID, roleID uuid.UUID) UserRoleRemovedEvent {
	return UserRoleRemovedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.identity.UserRoleRemoved"),
		UserID:          userID,
		RoleID:          roleID,
	}
}


// UserStatusChangedEvent is raised when an admin changes a user's status.
type UserStatusChangedEvent struct {
	domain.BaseDomainEvent
	UserID    uuid.UUID  `json:"user_id"`
	OldStatus UserStatus `json:"old_status"`
	NewStatus UserStatus `json:"new_status"`
	ChangedBy uuid.UUID  `json:"changed_by"`
}

// NewUserStatusChangedEvent creates a UserStatusChangedEvent.
func NewUserStatusChangedEvent(userID uuid.UUID, old, new UserStatus, changedBy uuid.UUID) UserStatusChangedEvent {
	return UserStatusChangedEvent{
		BaseDomainEvent: domain.NewBaseDomainEvent("mes.identity.UserStatusChanged"),
		UserID:          userID,
		OldStatus:       old,
		NewStatus:       new,
		ChangedBy:       changedBy,
	}
}

