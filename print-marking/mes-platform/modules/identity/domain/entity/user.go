// Package entity contains the core domain entities for the Identity module.
// These are pure Go structs with no external dependencies.
package entity

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
	"golang.org/x/crypto/bcrypt"
)

// ─── User ─────────────────────────────────────────────────────────────────────

// UserStatus represents the lifecycle state of a user account.
type UserStatus string

const (
	UserStatusActive    UserStatus = "active"
	UserStatusInactive  UserStatus = "inactive"
	UserStatusSuspended UserStatus = "suspended"
)

// User is the core aggregate root of the Identity module.
// All mutations must go through its methods to preserve invariants.
type User struct {
	domain.AggregateRoot
	Username        string
	Email           string
	PasswordHash    string
	Status          UserStatus
	FullName        string
	Phone           string
	LastLoginAt     *time.Time
	PasswordResetToken     string
	PasswordResetExpiresAt *time.Time
	Roles           []Role
}

// NewUser creates a new User aggregate with a hashed password.
// Returns a domain error if the email or password is invalid.
func NewUser(username, email, fullName, rawPassword string, policy PasswordPolicy) (*User, error) {
	if strings.TrimSpace(username) == "" {
		return nil, errors.New("username is required")
	}
	if strings.TrimSpace(email) == "" {
		return nil, errors.New("email is required")
	}
	if !isValidEmail(email) {
		return nil, errors.New("invalid email format")
	}
	if err := policy.Validate(rawPassword); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(rawPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("failed to hash password")
	}

	u := &User{}
	u.AggregateRoot = domain.AggregateRoot{}
	u.BaseEntity = domain.NewBaseEntity()
	u.Username = strings.ToLower(strings.TrimSpace(username))
	u.Email = strings.ToLower(strings.TrimSpace(email))
	u.FullName = strings.TrimSpace(fullName)
	u.PasswordHash = string(hash)
	u.Status = UserStatusActive

	u.RecordEvent(NewUserRegisteredEvent(u.ID, u.Username, u.Email))
	return u, nil
}

// VerifyPassword returns true when rawPassword matches the stored hash.
func (u *User) VerifyPassword(rawPassword string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(rawPassword))
	return err == nil
}

// ChangePassword updates the password hash after validating the new password.
func (u *User) ChangePassword(oldPassword, newPassword string, policy PasswordPolicy) error {
	if !u.VerifyPassword(oldPassword) {
		return errors.New("current password is incorrect")
	}
	return u.setPassword(newPassword, policy)
}

// ResetPassword sets a new password using a validated reset token.
func (u *User) ResetPassword(token, newPassword string, policy PasswordPolicy) error {
	if u.PasswordResetToken == "" || u.PasswordResetToken != token {
		return errors.New("invalid or missing reset token")
	}
	if u.PasswordResetExpiresAt == nil || time.Now().UTC().After(*u.PasswordResetExpiresAt) {
		return errors.New("reset token has expired")
	}
	if err := u.setPassword(newPassword, policy); err != nil {
		return err
	}
	u.PasswordResetToken = ""
	u.PasswordResetExpiresAt = nil
	return nil
}

// SetPasswordResetToken stores a hashed reset token with expiry.
func (u *User) SetPasswordResetToken(token string, expiry time.Time) {
	u.PasswordResetToken = token
	expiryUTC := expiry.UTC()
	u.PasswordResetExpiresAt = &expiryUTC
	u.Touch()
}

// RecordLogin updates the last login timestamp.
func (u *User) RecordLogin() {
	now := time.Now().UTC()
	u.LastLoginAt = &now
	u.Touch()
}

// Activate enables the user account.
func (u *User) Activate() {
	u.Status = UserStatusActive
	u.Touch()
}

// Suspend suspends the user account.
func (u *User) Suspend() {
	u.Status = UserStatusSuspended
	u.Touch()
}

// Deactivate soft-deactivates the user account.
func (u *User) Deactivate() {
	u.Status = UserStatusInactive
	u.Touch()
}

// IsActive returns true when the user can authenticate.
func (u *User) IsActive() bool {
	return u.Status == UserStatusActive
}

// UpdateProfile updates the mutable profile fields.
func (u *User) UpdateProfile(fullName, phone string) {
	u.FullName = strings.TrimSpace(fullName)
	u.Phone = strings.TrimSpace(phone)
	u.Touch()
}

func (u *User) setPassword(rawPassword string, policy PasswordPolicy) error {
	if err := policy.Validate(rawPassword); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(rawPassword), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("failed to hash password")
	}
	u.PasswordHash = string(hash)
	u.Touch()
	return nil
}

// ─── Role ─────────────────────────────────────────────────────────────────────

// Role represents a named collection of permissions assignable to users.
type Role struct {
	domain.BaseEntity
	Name        string
	Code        string
	Description string
	IsSystem    bool
	Permissions []Permission
	UsersCount  int
}

// NewRole creates a new Role.
func NewRole(name, description string) (*Role, error) {
	return NewRoleWithCode(name, "", description, false)
}

// NewRoleWithCode creates a new Role with explicit code and isSystem flag.
func NewRoleWithCode(name, code, description string, isSystem bool) (*Role, error) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, errors.New("role name is required")
	}
	trimmedCode := strings.TrimSpace(code)
	if trimmedCode == "" {
		trimmedCode = strings.ToLower(strings.ReplaceAll(trimmedName, " ", "_"))
	}
	r := &Role{}
	r.BaseEntity = domain.NewBaseEntity()
	r.Name = trimmedName
	r.Code = strings.ToLower(trimmedCode)
	r.Description = description
	r.IsSystem = isSystem
	return r, nil
}

// CanDelete checks if the role is allowed to be deleted.
func (r *Role) CanDelete() error {
	if r.IsSystem {
		return errors.New("system roles cannot be deleted")
	}
	return nil
}

// UpdateDetails updates name and description of a role.
func (r *Role) UpdateDetails(name, description string) error {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return errors.New("role name cannot be empty")
	}
	r.Name = trimmedName
	r.Description = description
	r.Touch()
	return nil
}

// SetPermissions updates the permission list assigned to this role.
func (r *Role) SetPermissions(perms []Permission) {
	r.Permissions = perms
	r.Touch()
}

// ─── Permission ───────────────────────────────────────────────────────────────

// Permission represents a fine-grained capability in the MES system.
// Convention: <resource>.<action>  e.g. "worker.create", "planning.publish"
type Permission struct {
	domain.BaseEntity
	Name        string
	Description string
	Resource    string
	Action      string
	Module      string
	DisplayName string
	Category    string
}

// NewPermission creates a new Permission.
// name must follow the <resource>.<action> convention.
func NewPermission(name, description string) (*Permission, error) {
	return NewPermissionWithMetadata(name, description, "Identity", "", "General")
}

// NewPermissionWithMetadata creates a Permission with full metadata.
func NewPermissionWithMetadata(name, description, module, displayName, category string) (*Permission, error) {
	parts := strings.SplitN(name, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil, errors.New("permission name must follow <resource>.<action> convention")
	}
	if strings.TrimSpace(module) == "" {
		module = "Identity"
	}
	if strings.TrimSpace(displayName) == "" {
		displayName = name
	}
	p := &Permission{}
	p.BaseEntity = domain.NewBaseEntity()
	p.Name = strings.ToLower(name)
	p.Resource = strings.ToLower(parts[0])
	p.Action = strings.ToLower(parts[1])
	p.Description = description
	p.Module = module
	p.DisplayName = displayName
	p.Category = category
	return p, nil
}

// ─── Refresh Token ────────────────────────────────────────────────────────────

// RefreshToken stores a hashed refresh token for a user session.
type RefreshToken struct {
	domain.BaseEntity
	UserID    uuid.UUID
	TokenHash string
	ExpiresAt time.Time
	RevokedAt *time.Time
	UserAgent string
	IPAddress string
}

// NewRefreshToken creates a new RefreshToken record.
func NewRefreshToken(userID uuid.UUID, tokenHash string, expiresAt time.Time, userAgent, ip string) *RefreshToken {
	t := &RefreshToken{}
	t.BaseEntity = domain.NewBaseEntity()
	t.UserID = userID
	t.TokenHash = tokenHash
	t.ExpiresAt = expiresAt
	t.UserAgent = userAgent
	t.IPAddress = ip
	return t
}

// IsValid returns true when the token has not expired and has not been revoked.
func (t *RefreshToken) IsValid() bool {
	return t.RevokedAt == nil && time.Now().UTC().Before(t.ExpiresAt)
}

// Revoke marks the token as revoked.
func (t *RefreshToken) Revoke() {
	now := time.Now().UTC()
	t.RevokedAt = &now
	t.Touch()
}

// ─── Password Policy ──────────────────────────────────────────────────────────

// PasswordPolicy encodes the complexity rules for passwords.
type PasswordPolicy struct {
	MinLength        int
	RequireUppercase bool
	RequireLowercase bool
	RequireNumber    bool
	RequireSpecial   bool
}

// Validate checks whether the given password satisfies the policy.
func (p PasswordPolicy) Validate(password string) error {
	if len(password) < p.MinLength {
		return fmt.Errorf("password must be at least %d characters", p.MinLength)
	}
	var hasUpper, hasLower, hasNumber, hasSpecial bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasNumber = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSpecial = true
		}
	}
	if p.RequireUppercase && !hasUpper {
		return errors.New("password must contain at least one uppercase letter")
	}
	if p.RequireLowercase && !hasLower {
		return errors.New("password must contain at least one lowercase letter")
	}
	if p.RequireNumber && !hasNumber {
		return errors.New("password must contain at least one number")
	}
	if p.RequireSpecial && !hasSpecial {
		return errors.New("password must contain at least one special character")
	}
	return nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func isValidEmail(email string) bool {
	at := strings.Index(email, "@")
	if at < 1 {
		return false
	}
	dot := strings.LastIndex(email, ".")
	return dot > at+1 && dot < len(email)-1
}
