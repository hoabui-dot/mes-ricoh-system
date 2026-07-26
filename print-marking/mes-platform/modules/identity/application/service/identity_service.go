// Package service contains the Identity application service — the orchestration
// layer between HTTP handlers and the domain. It holds no domain logic itself;
// all invariants live in the domain entities. It coordinates repositories,
// the JWT manager, and the outbox to fulfil use cases.
package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/identity/application/dto"
	"github.com/nd/mes-platform/modules/identity/domain/entity"
	"github.com/nd/mes-platform/modules/identity/domain/repository"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/domain"
	"github.com/nd/mes-platform/shared/outbox"
	"go.uber.org/zap"
)

// ErrNotFound is returned when a requested resource does not exist.
var ErrNotFound = errors.New("not found")

// ErrConflict is returned when a resource already exists.
var ErrConflict = errors.New("already exists")

// ErrUnauthorized is returned when credentials are invalid.
var ErrUnauthorized = errors.New("invalid credentials")

// ErrForbidden is returned when the operation is not permitted.
var ErrForbidden = errors.New("forbidden")

// OutboxRepository is the port the service uses to write domain events.
type OutboxRepository interface {
	Save(ctx context.Context, event *outbox.Event) error
}

// CasbinEnforcer is the port the identity service uses to synchronize Casbin rules.
type CasbinEnforcer interface {
	SyncRolePermissions(roleCode string, permNames []string) error
	SyncUserRoles(userSub string, roleCodes []string) error
	RemoveRolePolicies(roleCode string) error
	AddRoleForUser(user, role string) error
	RemoveRoleForUser(user, role string) error
}

// IdentityService orchestrates all Identity use cases.
// It is the single entry point for all identity operations.
type IdentityService struct {
	userRepo     repository.UserRepository
	roleRepo     repository.RoleRepository
	permRepo     repository.PermissionRepository
	tokenRepo    repository.RefreshTokenRepository
	userRoleRepo repository.UserRoleRepository
	outboxRepo   OutboxRepository
	enforcer     CasbinEnforcer
	jwtManager   *jwt.Manager
	policy       entity.PasswordPolicy
	log          *logger.Logger
}

// NewIdentityService creates a new IdentityService. All dependencies are injected.
func NewIdentityService(
	userRepo repository.UserRepository,
	roleRepo repository.RoleRepository,
	permRepo repository.PermissionRepository,
	tokenRepo repository.RefreshTokenRepository,
	userRoleRepo repository.UserRoleRepository,
	outboxRepo OutboxRepository,
	enforcer CasbinEnforcer,
	jwtManager *jwt.Manager,
	policy entity.PasswordPolicy,
	log *logger.Logger,
) *IdentityService {
	return &IdentityService{
		userRepo:     userRepo,
		roleRepo:     roleRepo,
		permRepo:     permRepo,
		tokenRepo:    tokenRepo,
		userRoleRepo: userRoleRepo,
		outboxRepo:   outboxRepo,
		enforcer:     enforcer,
		jwtManager:   jwtManager,
		policy:       policy,
		log:          log.With(logger.Module("identity")),
	}
}

// ─── Auth Use Cases ───────────────────────────────────────────────────────────

// Register creates a new user account.
func (s *IdentityService) Register(ctx context.Context, req dto.RegisterUserRequest) (*dto.UserDTO, error) {
	if exists, _ := s.userRepo.ExistsByEmail(ctx, req.Email); exists {
		return nil, fmt.Errorf("%w: email already registered", ErrConflict)
	}
	if exists, _ := s.userRepo.ExistsByUsername(ctx, req.Username); exists {
		return nil, fmt.Errorf("%w: username already taken", ErrConflict)
	}

	user, err := entity.NewUser(req.Username, req.Email, req.FullName, req.Password, s.policy)
	if err != nil {
		return nil, err
	}

	if err := s.userRepo.Save(ctx, user); err != nil {
		return nil, fmt.Errorf("register: save user: %w", err)
	}

	// Publish domain events via outbox.
	if err := s.publishEvents(ctx, user.PullEvents()); err != nil {
		s.log.Warn("register: publish events failed", logger.Err(err))
	}

	s.log.Info("user registered", logger.UserID(user.ID.String()), zap.String("username", user.Username))
	return mapUserToDTO(user), nil
}

// Login authenticates a user and returns a token pair.
func (s *IdentityService) Login(ctx context.Context, req dto.LoginRequest, userAgent, ip string) (*dto.AuthResponse, error) {
	user, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if !user.IsActive() {
		return nil, fmt.Errorf("%w: account is %s", ErrForbidden, user.Status)
	}
	if !user.VerifyPassword(req.Password) {
		return nil, ErrUnauthorized
	}

	tokenPair, err := s.jwtManager.GenerateTokenPair(user.ID, user.Username, user.Email)
	if err != nil {
		return nil, fmt.Errorf("login: generate tokens: %w", err)
	}

	// Store hashed refresh token.
	tokenHash := hashToken(tokenPair.RefreshToken)
	expiresAt := time.Now().UTC().Add(s.jwtManager.RefreshExpiryDuration())
	refreshToken := entity.NewRefreshToken(user.ID, tokenHash, expiresAt, userAgent, ip)
	if err := s.tokenRepo.Save(ctx, refreshToken); err != nil {
		return nil, fmt.Errorf("login: save refresh token: %w", err)
	}

	user.RecordLogin()
	user.RecordEvent(entity.NewUserLoggedInEvent(user.ID, user.Username, ip, userAgent))
	if err := s.userRepo.Save(ctx, user); err != nil {
		s.log.Warn("login: update last login failed", logger.Err(err))
	}
	if err := s.publishEvents(ctx, user.PullEvents()); err != nil {
		s.log.Warn("login: publish events failed", logger.Err(err))
	}

	roles, _ := s.userRoleRepo.FindRolesByUserID(ctx, user.ID)
	user.Roles = derefRoles(roles)

	return &dto.AuthResponse{
		AccessToken:  tokenPair.AccessToken,
		RefreshToken: tokenPair.RefreshToken,
		TokenType:    "Bearer",
		ExpiresAt:    tokenPair.ExpiresAt,
		User:         *mapUserToDTO(user),
	}, nil
}

// Refresh rotates a refresh token and returns a new token pair.
func (s *IdentityService) Refresh(ctx context.Context, req dto.RefreshTokenRequest, userAgent, ip string) (*dto.AuthResponse, error) {
	tokenHash := hashToken(req.RefreshToken)
	stored, err := s.tokenRepo.FindByTokenHash(ctx, tokenHash)
	if err != nil || !stored.IsValid() {
		return nil, fmt.Errorf("%w: refresh token is invalid or expired", ErrUnauthorized)
	}

	// Revoke the used token (rotation).
	stored.Revoke()
	if err := s.tokenRepo.Save(ctx, &entity.RefreshToken{
		BaseEntity: stored.BaseEntity,
		UserID:     stored.UserID,
		TokenHash:  stored.TokenHash,
		ExpiresAt:  stored.ExpiresAt,
		RevokedAt:  stored.RevokedAt,
		UserAgent:  stored.UserAgent,
		IPAddress:  stored.IPAddress,
	}); err != nil {
		return nil, fmt.Errorf("refresh: revoke token: %w", err)
	}

	user, err := s.userRepo.FindByID(ctx, stored.UserID)
	if err != nil {
		return nil, ErrNotFound
	}
	if !user.IsActive() {
		return nil, fmt.Errorf("%w: account is %s", ErrForbidden, user.Status)
	}

	tokenPair, err := s.jwtManager.GenerateTokenPair(user.ID, user.Username, user.Email)
	if err != nil {
		return nil, fmt.Errorf("refresh: generate tokens: %w", err)
	}

	newHash := hashToken(tokenPair.RefreshToken)
	expiresAt := time.Now().UTC().Add(s.jwtManager.RefreshExpiryDuration())
	newToken := entity.NewRefreshToken(user.ID, newHash, expiresAt, userAgent, ip)
	if err := s.tokenRepo.Save(ctx, newToken); err != nil {
		return nil, fmt.Errorf("refresh: save new token: %w", err)
	}

	return &dto.AuthResponse{
		AccessToken:  tokenPair.AccessToken,
		RefreshToken: tokenPair.RefreshToken,
		TokenType:    "Bearer",
		ExpiresAt:    tokenPair.ExpiresAt,
		User:         *mapUserToDTO(user),
	}, nil
}

// Logout revokes all refresh tokens for the user (logs out all devices).
func (s *IdentityService) Logout(ctx context.Context, userID uuid.UUID) error {
	return s.tokenRepo.RevokeAllForUser(ctx, userID)
}

// ChangePassword allows a user to change their own password.
func (s *IdentityService) ChangePassword(ctx context.Context, userID uuid.UUID, req dto.ChangePasswordRequest) error {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return ErrNotFound
	}
	if err := user.ChangePassword(req.CurrentPassword, req.NewPassword, s.policy); err != nil {
		return err
	}
	user.RecordEvent(entity.NewPasswordChangedEvent(user.ID, "self_change"))
	if err := s.userRepo.Save(ctx, user); err != nil {
		return fmt.Errorf("change password: save: %w", err)
	}
	_ = s.tokenRepo.RevokeAllForUser(ctx, userID) // Invalidate all sessions.
	_ = s.publishEvents(ctx, user.PullEvents())
	return nil
}

// ForgotPassword generates and stores a password reset token.
// In production, the token would be emailed. Here we return it for now.
func (s *IdentityService) ForgotPassword(ctx context.Context, req dto.ForgotPasswordRequest, tokenExpiry time.Duration) (string, error) {
	user, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		// Return success even if email not found (prevents email enumeration).
		return "", nil
	}
	token := uuid.NewString()
	expiresAt := time.Now().UTC().Add(tokenExpiry)
	user.SetPasswordResetToken(token, expiresAt)
	if err := s.userRepo.Save(ctx, user); err != nil {
		return "", fmt.Errorf("forgot password: save: %w", err)
	}
	return token, nil
}

// ResetPassword completes a password reset using a token.
func (s *IdentityService) ResetPassword(ctx context.Context, req dto.ResetPasswordRequest) error {
	// In a real system, we'd look up by token hash. For simplicity, we scan (or store token separately).
	// This would normally use a dedicated token table. For now we handle via user lookup.
	return errors.New("not implemented: requires token lookup table")
}

// ─── User Management Use Cases ────────────────────────────────────────────────

// GetUser returns a user by ID.
func (s *IdentityService) GetUser(ctx context.Context, id uuid.UUID) (*dto.UserDTO, error) {
	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	roles, _ := s.userRoleRepo.FindRolesByUserID(ctx, id)
	user.Roles = derefRoles(roles)
	return mapUserToDTO(user), nil
}

// ListUsers returns a paginated list of users.
func (s *IdentityService) ListUsers(ctx context.Context, filter repository.UserFilter) ([]*dto.UserDTO, int64, error) {
	users, total, err := s.userRepo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	dtos := make([]*dto.UserDTO, len(users))
	for i, u := range users {
		dtos[i] = mapUserToDTO(u)
	}
	return dtos, total, nil
}

// UpdateUserStatus allows admins to change a user's account status.
func (s *IdentityService) UpdateUserStatus(ctx context.Context, targetID, changedBy uuid.UUID, req dto.UpdateUserStatusRequest) error {
	user, err := s.userRepo.FindByID(ctx, targetID)
	if err != nil {
		return ErrNotFound
	}
	oldStatus := user.Status
	switch entity.UserStatus(req.Status) {
	case entity.UserStatusActive:
		user.Activate()
	case entity.UserStatusInactive:
		user.Deactivate()
	case entity.UserStatusSuspended:
		user.Suspend()
	default:
		return fmt.Errorf("invalid status: %s", req.Status)
	}
	user.RecordEvent(entity.NewUserStatusChangedEvent(user.ID, oldStatus, user.Status, changedBy))
	if err := s.userRepo.Save(ctx, user); err != nil {
		return fmt.Errorf("update status: save: %w", err)
	}
	_ = s.publishEvents(ctx, user.PullEvents())
	return nil
}

// UpdateProfile allows a user to update their own profile.
func (s *IdentityService) UpdateProfile(ctx context.Context, userID uuid.UUID, req dto.UpdateProfileRequest) (*dto.UserDTO, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, ErrNotFound
	}
	user.UpdateProfile(req.FullName, req.Phone)
	if err := s.userRepo.Save(ctx, user); err != nil {
		return nil, fmt.Errorf("update profile: save: %w", err)
	}
	return mapUserToDTO(user), nil
}

// AssignRole assigns a role to a user.
func (s *IdentityService) AssignRole(ctx context.Context, userID, roleID uuid.UUID) error {
	role, err := s.roleRepo.FindByID(ctx, roleID)
	if err != nil {
		return fmt.Errorf("%w: role", ErrNotFound)
	}
	if err := s.userRoleRepo.AssignRole(ctx, userID, roleID); err != nil {
		return err
	}
	// Sync Casbin
	userSub := fmt.Sprintf("user:%s", userID.String())
	_ = s.enforcer.AddRoleForUser(userSub, role.Code)
	_ = s.publishEvents(ctx, []domain.DomainEvent{entity.NewUserRoleAssignedEvent(userID, []uuid.UUID{roleID})})
	return nil
}

// AssignUserRoles replaces all roles of a user with a new set of role IDs.
func (s *IdentityService) AssignUserRoles(ctx context.Context, userID uuid.UUID, req dto.AssignRolesRequest) error {
	if _, err := s.userRepo.FindByID(ctx, userID); err != nil {
		return ErrNotFound
	}

	roleUUIDs := make([]uuid.UUID, 0, len(req.RoleIDs))
	roleCodes := make([]string, 0, len(req.RoleIDs))
	for _, idStr := range req.RoleIDs {
		rid, err := uuid.Parse(idStr)
		if err != nil {
			continue
		}
		r, err := s.roleRepo.FindByID(ctx, rid)
		if err == nil {
			roleUUIDs = append(roleUUIDs, rid)
			roleCodes = append(roleCodes, r.Code)
		}
	}

	if err := s.userRoleRepo.ReplaceRoles(ctx, userID, roleUUIDs); err != nil {
		return fmt.Errorf("assign user roles: %w", err)
	}

	userSub := fmt.Sprintf("user:%s", userID.String())
	_ = s.enforcer.SyncUserRoles(userSub, roleCodes)
	_ = s.publishEvents(ctx, []domain.DomainEvent{entity.NewUserRoleAssignedEvent(userID, roleUUIDs)})
	return nil
}

// RemoveRole removes a role from a user.
func (s *IdentityService) RemoveRole(ctx context.Context, userID, roleID uuid.UUID) error {
	role, err := s.roleRepo.FindByID(ctx, roleID)
	if err == nil {
		userSub := fmt.Sprintf("user:%s", userID.String())
		_ = s.enforcer.RemoveRoleForUser(userSub, role.Code)
	}
	if err := s.userRoleRepo.RemoveRole(ctx, userID, roleID); err != nil {
		return err
	}
	_ = s.publishEvents(ctx, []domain.DomainEvent{entity.NewUserRoleRemovedEvent(userID, roleID)})
	return nil
}

// ─── Role Management Use Cases ─────────────────────────────────────────────────

// CreateRole creates a new role with optional initial permissions.
func (s *IdentityService) CreateRole(ctx context.Context, req dto.CreateRoleRequest) (*dto.RoleDTO, error) {
	if exists, _ := s.roleRepo.ExistsByName(ctx, req.Name); exists {
		return nil, fmt.Errorf("%w: role name already exists", ErrConflict)
	}

	code := req.Code
	if code == "" {
		code = strings.ToLower(strings.ReplaceAll(req.Name, " ", "_"))
	}
	if exists, _ := s.roleRepo.ExistsByCode(ctx, code); exists {
		return nil, fmt.Errorf("%w: role code %q already exists", ErrConflict, code)
	}

	role, err := entity.NewRoleWithCode(req.Name, code, req.Description, false)
	if err != nil {
		return nil, err
	}

	if err := s.roleRepo.Save(ctx, role); err != nil {
		return nil, fmt.Errorf("create role: save: %w", err)
	}

	permUUIDs := make([]uuid.UUID, 0, len(req.PermissionIDs))
	permNames := make([]string, 0, len(req.PermissionIDs))
	for _, permIDStr := range req.PermissionIDs {
		pid, err := uuid.Parse(permIDStr)
		if err != nil {
			continue
		}
		permUUIDs = append(permUUIDs, pid)
	}

	if len(permUUIDs) > 0 {
		_ = s.roleRepo.ReplacePermissions(ctx, role.ID, permUUIDs)
		perms, _ := s.permRepo.FindByIDs(ctx, permUUIDs)
		for _, p := range perms {
			permNames = append(permNames, p.Name)
		}
	}

	_ = s.enforcer.SyncRolePermissions(role.Code, permNames)
	_ = s.publishEvents(ctx, []domain.DomainEvent{entity.NewRoleCreatedEvent(role.ID, role.Code, role.Name)})

	updated, _ := s.roleRepo.FindByID(ctx, role.ID)
	return mapRoleToDTO(updated), nil
}

// GetRole returns a role by ID.
func (s *IdentityService) GetRole(ctx context.Context, id uuid.UUID) (*dto.RoleDTO, error) {
	role, err := s.roleRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	cnt, _ := s.roleRepo.CountAssignedUsers(ctx, id)
	role.UsersCount = int(cnt)
	return mapRoleToDTO(role), nil
}

// UpdateRole updates an existing role.
func (s *IdentityService) UpdateRole(ctx context.Context, id uuid.UUID, req dto.UpdateRoleRequest) (*dto.RoleDTO, error) {
	role, err := s.roleRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}

	if err := role.UpdateDetails(req.Name, req.Description); err != nil {
		return nil, err
	}

	if err := s.roleRepo.Save(ctx, role); err != nil {
		return nil, fmt.Errorf("update role: save: %w", err)
	}

	permUUIDs := make([]uuid.UUID, 0, len(req.PermissionIDs))
	permNames := make([]string, 0, len(req.PermissionIDs))
	for _, permIDStr := range req.PermissionIDs {
		pid, err := uuid.Parse(permIDStr)
		if err != nil {
			continue
		}
		permUUIDs = append(permUUIDs, pid)
	}

	_ = s.roleRepo.ReplacePermissions(ctx, role.ID, permUUIDs)
	if len(permUUIDs) > 0 {
		perms, _ := s.permRepo.FindByIDs(ctx, permUUIDs)
		for _, p := range perms {
			permNames = append(permNames, p.Name)
		}
	}

	_ = s.enforcer.SyncRolePermissions(role.Code, permNames)
	_ = s.publishEvents(ctx, []domain.DomainEvent{entity.NewRoleUpdatedEvent(role.ID, role.Code, role.Name)})

	updated, _ := s.roleRepo.FindByID(ctx, role.ID)
	return mapRoleToDTO(updated), nil
}

// DeleteRole deletes a custom role. System roles and roles with active users cannot be deleted.
func (s *IdentityService) DeleteRole(ctx context.Context, id uuid.UUID) error {
	role, err := s.roleRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}

	if err := role.CanDelete(); err != nil {
		return fmt.Errorf("%w: %s", ErrForbidden, err.Error())
	}

	assignedUsers, _ := s.roleRepo.CountAssignedUsers(ctx, id)
	if assignedUsers > 0 {
		return fmt.Errorf("%w: cannot delete role assigned to %d user(s)", ErrConflict, assignedUsers)
	}

	_ = s.enforcer.RemoveRolePolicies(role.Code)

	if err := s.roleRepo.Delete(ctx, id); err != nil {
		return fmt.Errorf("delete role: %w", err)
	}

	_ = s.publishEvents(ctx, []domain.DomainEvent{entity.NewRoleDeletedEvent(id, role.Code)})
	return nil
}

// ListRoles returns all roles.
func (s *IdentityService) ListRoles(ctx context.Context) ([]*dto.RoleDTO, error) {
	roles, err := s.roleRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]*dto.RoleDTO, len(roles))
	for i, r := range roles {
		result[i] = mapRoleToDTO(r)
	}
	return result, nil
}

// ListRolesPaginated returns a paginated list of roles.
func (s *IdentityService) ListRolesPaginated(ctx context.Context, filter repository.RoleFilter) ([]*dto.RoleDTO, int64, error) {
	roles, total, err := s.roleRepo.ListPaginated(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	result := make([]*dto.RoleDTO, len(roles))
	for i, r := range roles {
		result[i] = mapRoleToDTO(r)
	}
	return result, total, nil
}

// CreatePermission creates a new permission.
func (s *IdentityService) CreatePermission(ctx context.Context, req dto.CreatePermissionRequest) (*dto.PermissionDTO, error) {
	perm, err := entity.NewPermissionWithMetadata(req.Name, req.Description, req.Module, req.DisplayName, req.Category)
	if err != nil {
		return nil, err
	}
	if err := s.permRepo.Save(ctx, perm); err != nil {
		return nil, fmt.Errorf("create permission: save: %w", err)
	}
	return mapPermissionToDTO(perm), nil
}

// GetGroupedPermissions returns all permissions grouped by module.
func (s *IdentityService) GetGroupedPermissions(ctx context.Context) ([]*dto.PermissionGroupDTO, error) {
	groupedMap, err := s.permRepo.ListGroupedByModule(ctx)
	if err != nil {
		return nil, err
	}

	modulesOrder := []string{"Workforce", "Planning", "Production", "Dashboard", "Identity", "Audit"}
	result := make([]*dto.PermissionGroupDTO, 0, len(groupedMap))

	for _, mod := range modulesOrder {
		if perms, exists := groupedMap[mod]; exists {
			dtos := make([]dto.PermissionDTO, len(perms))
			for i, p := range perms {
				dtos[i] = *mapPermissionToDTO(p)
			}
			result = append(result, &dto.PermissionGroupDTO{
				Module:      mod,
				Permissions: dtos,
			})
			delete(groupedMap, mod)
		}
	}

	// Any remaining modules
	for mod, perms := range groupedMap {
		dtos := make([]dto.PermissionDTO, len(perms))
		for i, p := range perms {
			dtos[i] = *mapPermissionToDTO(p)
		}
		result = append(result, &dto.PermissionGroupDTO{
			Module:      mod,
			Permissions: dtos,
		})
	}

	return result, nil
}

// ListPermissions returns all permissions.
func (s *IdentityService) ListPermissions(ctx context.Context) ([]*dto.PermissionDTO, error) {
	perms, err := s.permRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]*dto.PermissionDTO, len(perms))
	for i, p := range perms {
		result[i] = mapPermissionToDTO(p)
	}
	return result, nil
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

// publishEvents serialises domain events and writes them to the outbox table.
func (s *IdentityService) publishEvents(ctx context.Context, events []domain.DomainEvent) error {
	for _, ev := range events {
		payload, err := outbox.MarshalEvent(ev)
		if err != nil {
			return err
		}
		outboxEvent := outbox.NewEvent(ev.EventName(), ev.EventName(), payload)
		if err := s.outboxRepo.Save(ctx, outboxEvent); err != nil {
			return err
		}
	}
	return nil
}

// hashToken hashes a plain token with SHA-256 for safe database storage.
func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

func mapUserToDTO(u *entity.User) *dto.UserDTO {
	d := &dto.UserDTO{
		ID:          u.ID,
		Username:    u.Username,
		Email:       u.Email,
		FullName:    u.FullName,
		Phone:       u.Phone,
		Status:      string(u.Status),
		LastLoginAt: u.LastLoginAt,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
	}
	for _, r := range u.Roles {
		d.Roles = append(d.Roles, *mapRoleToDTO(&r))
	}
	return d
}

func mapRoleToDTO(r *entity.Role) *dto.RoleDTO {
	d := &dto.RoleDTO{
		ID:          r.ID,
		Name:        r.Name,
		Code:        r.Code,
		Description: r.Description,
		IsSystem:    r.IsSystem,
		UsersCount:  r.UsersCount,
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
	}
	for _, p := range r.Permissions {
		d.Permissions = append(d.Permissions, *mapPermissionToDTO(&p))
	}
	return d
}

func mapPermissionToDTO(p *entity.Permission) *dto.PermissionDTO {
	disp := p.DisplayName
	if disp == "" {
		disp = p.Name
	}
	mod := p.Module
	if mod == "" {
		mod = "Identity"
	}
	return &dto.PermissionDTO{
		ID:          p.ID,
		Name:        p.Name,
		Description: p.Description,
		Resource:    p.Resource,
		Action:      p.Action,
		Module:      mod,
		DisplayName: disp,
		Category:    p.Category,
	}
}

func derefRoles(roles []*entity.Role) []entity.Role {
	result := make([]entity.Role, len(roles))
	for i, r := range roles {
		result[i] = *r
	}
	return result
}
