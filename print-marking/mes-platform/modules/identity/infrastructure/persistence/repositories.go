// Package persistence provides GORM-backed repository implementations for the Identity module.
package persistence

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/identity/domain/entity"
	"github.com/nd/mes-platform/modules/identity/domain/repository"
	"github.com/nd/mes-platform/modules/identity/infrastructure/model"
	"github.com/nd/mes-platform/shared/outbox"
	"gorm.io/gorm"
)

// ─── User Repository ──────────────────────────────────────────────────────────

// GormUserRepository is the GORM-backed implementation of UserRepository.
type GormUserRepository struct {
	db *gorm.DB
}

// NewGormUserRepository creates a new GormUserRepository.
func NewGormUserRepository(db *gorm.DB) *GormUserRepository {
	return &GormUserRepository{db: db}
}

// Save creates or updates a User.
func (r *GormUserRepository) Save(ctx context.Context, user *entity.User) error {
	m := userToModel(user)
	result := r.db.WithContext(ctx).Save(&m)
	return result.Error
}

// FindByID looks up a User by primary key.
func (r *GormUserRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.User, error) {
	var m model.UserModel
	err := r.db.WithContext(ctx).
		Preload("Roles.Permissions").
		Where("id = ? AND deleted_at IS NULL", id).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find user by id: %w", err)
	}
	return modelToUser(&m), nil
}

// FindByEmail looks up a User by email.
func (r *GormUserRepository) FindByEmail(ctx context.Context, email string) (*entity.User, error) {
	var m model.UserModel
	err := r.db.WithContext(ctx).
		Preload("Roles.Permissions").
		Where("email = ? AND deleted_at IS NULL", email).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find user by email: %w", err)
	}
	return modelToUser(&m), nil
}

// FindByUsername looks up a User by username.
func (r *GormUserRepository) FindByUsername(ctx context.Context, username string) (*entity.User, error) {
	var m model.UserModel
	err := r.db.WithContext(ctx).
		Where("username = ? AND deleted_at IS NULL", username).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrUserNotFound
	}
	return modelToUser(&m), err
}

// ExistsByEmail returns true if an active user with the email exists.
func (r *GormUserRepository) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.UserModel{}).
		Where("email = ? AND deleted_at IS NULL", email).Count(&count).Error
	return count > 0, err
}

// ExistsByUsername returns true if an active user with the username exists.
func (r *GormUserRepository) ExistsByUsername(ctx context.Context, username string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.UserModel{}).
		Where("username = ? AND deleted_at IS NULL", username).Count(&count).Error
	return count > 0, err
}

// List returns a filtered, paginated list of users.
func (r *GormUserRepository) List(ctx context.Context, filter repository.UserFilter) ([]*entity.User, int64, error) {
	query := r.db.WithContext(ctx).Model(&model.UserModel{}).Where("deleted_at IS NULL")

	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Search != "" {
		like := "%" + filter.Search + "%"
		query = query.Where("username LIKE ? OR email LIKE ? OR full_name LIKE ?", like, like, like)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (filter.Page - 1) * filter.PageSize
	var models []model.UserModel
	if err := query.Preload("Roles").Offset(offset).Limit(filter.PageSize).
		Order("created_at DESC").Find(&models).Error; err != nil {
		return nil, 0, err
	}

	users := make([]*entity.User, len(models))
	for i, m := range models {
		users[i] = modelToUser(&m)
	}
	return users, total, nil
}

// Delete soft-deletes a user.
func (r *GormUserRepository) Delete(ctx context.Context, id uuid.UUID) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&model.UserModel{}).
		Where("id = ?", id).Update("deleted_at", now).Error
}

// ─── Role Repository ──────────────────────────────────────────────────────────

// GormRoleRepository is the GORM-backed implementation of RoleRepository.
type GormRoleRepository struct {
	db *gorm.DB
}

// NewGormRoleRepository creates a new GormRoleRepository.
func NewGormRoleRepository(db *gorm.DB) *GormRoleRepository {
	return &GormRoleRepository{db: db}
}

func (r *GormRoleRepository) Save(ctx context.Context, role *entity.Role) error {
	m := roleToModel(role)
	return r.db.WithContext(ctx).Save(&m).Error
}

func (r *GormRoleRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Role, error) {
	var m model.RoleModel
	err := r.db.WithContext(ctx).Preload("Permissions").Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrRoleNotFound
	}
	return modelToRole(&m), err
}

func (r *GormRoleRepository) FindByName(ctx context.Context, name string) (*entity.Role, error) {
	var m model.RoleModel
	err := r.db.WithContext(ctx).Preload("Permissions").Where("name = ?", name).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrRoleNotFound
	}
	return modelToRole(&m), err
}

func (r *GormRoleRepository) FindByCode(ctx context.Context, code string) (*entity.Role, error) {
	var m model.RoleModel
	err := r.db.WithContext(ctx).Preload("Permissions").Where("code = ?", code).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrRoleNotFound
	}
	return modelToRole(&m), err
}

func (r *GormRoleRepository) ExistsByName(ctx context.Context, name string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.RoleModel{}).Where("name = ?", name).Count(&count).Error
	return count > 0, err
}

func (r *GormRoleRepository) ExistsByCode(ctx context.Context, code string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.RoleModel{}).Where("code = ?", code).Count(&count).Error
	return count > 0, err
}

func (r *GormRoleRepository) List(ctx context.Context) ([]*entity.Role, error) {
	var models []model.RoleModel
	if err := r.db.WithContext(ctx).Preload("Permissions").Order("is_system DESC, name ASC").Find(&models).Error; err != nil {
		return nil, err
	}
	roles := make([]*entity.Role, len(models))
	for i, m := range models {
		roles[i] = modelToRole(&m)
		roles[i].UsersCount = int(r.countUsersForRole(ctx, m.ID))
	}
	return roles, nil
}

func (r *GormRoleRepository) ListPaginated(ctx context.Context, filter repository.RoleFilter) ([]*entity.Role, int64, error) {
	query := r.db.WithContext(ctx).Model(&model.RoleModel{})
	if filter.Search != "" {
		s := "%" + filter.Search + "%"
		query = query.Where("name ILIKE ? OR code ILIKE ? OR description ILIKE ?", s, s, s)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	sortCol := "is_system DESC, created_at DESC"
	if filter.SortBy != "" {
		dir := "ASC"
		if filter.Sort == "desc" || filter.Sort == "DESC" {
			dir = "DESC"
		}
		switch filter.SortBy {
		case "name":
			sortCol = "name " + dir
		case "code":
			sortCol = "code " + dir
		case "created_at":
			sortCol = "created_at " + dir
		}
	}

	page := filter.Page
	if page < 1 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var models []model.RoleModel
	if err := query.Preload("Permissions").Order(sortCol).Limit(pageSize).Offset(offset).Find(&models).Error; err != nil {
		return nil, 0, err
	}

	roles := make([]*entity.Role, len(models))
	for i, m := range models {
		roles[i] = modelToRole(&m)
		roles[i].UsersCount = int(r.countUsersForRole(ctx, m.ID))
	}
	return roles, total, nil
}

func (r *GormRoleRepository) countUsersForRole(ctx context.Context, roleID uuid.UUID) int64 {
	var count int64
	_ = r.db.WithContext(ctx).Table("identity_user_roles").Where("role_id = ?", roleID).Count(&count).Error
	return count
}

func (r *GormRoleRepository) CountAssignedUsers(ctx context.Context, roleID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Table("identity_user_roles").Where("role_id = ?", roleID).Count(&count).Error
	return count, err
}

func (r *GormRoleRepository) AssignPermission(ctx context.Context, roleID, permissionID uuid.UUID) error {
	role := model.RoleModel{ID: roleID}
	perm := model.PermissionModel{ID: permissionID}
	return r.db.WithContext(ctx).Model(&role).Association("Permissions").Append(&perm)
}

func (r *GormRoleRepository) RemovePermission(ctx context.Context, roleID, permissionID uuid.UUID) error {
	role := model.RoleModel{ID: roleID}
	perm := model.PermissionModel{ID: permissionID}
	return r.db.WithContext(ctx).Model(&role).Association("Permissions").Delete(&perm)
}

func (r *GormRoleRepository) ReplacePermissions(ctx context.Context, roleID uuid.UUID, permissionIDs []uuid.UUID) error {
	role := model.RoleModel{ID: roleID}
	perms := make([]model.PermissionModel, len(permissionIDs))
	for i, pid := range permissionIDs {
		perms[i] = model.PermissionModel{ID: pid}
	}
	return r.db.WithContext(ctx).Model(&role).Association("Permissions").Replace(&perms)
}

func (r *GormRoleRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		role := model.RoleModel{ID: id}
		if err := tx.Model(&role).Association("Permissions").Clear(); err != nil {
			return err
		}
		return tx.Delete(&role).Error
	})
}

// ─── Permission Repository ────────────────────────────────────────────────────

// GormPermissionRepository is the GORM-backed implementation of PermissionRepository.
type GormPermissionRepository struct {
	db *gorm.DB
}

// NewGormPermissionRepository creates a new GormPermissionRepository.
func NewGormPermissionRepository(db *gorm.DB) *GormPermissionRepository {
	return &GormPermissionRepository{db: db}
}

func (r *GormPermissionRepository) Save(ctx context.Context, perm *entity.Permission) error {
	m := permissionToModel(perm)
	return r.db.WithContext(ctx).Save(&m).Error
}

func (r *GormPermissionRepository) FindByID(ctx context.Context, id uuid.UUID) (*entity.Permission, error) {
	var m model.PermissionModel
	if err := r.db.WithContext(ctx).First(&m, id).Error; err != nil {
		return nil, repository.ErrPermissionNotFound
	}
	return modelToPermission(&m), nil
}

func (r *GormPermissionRepository) FindByName(ctx context.Context, name string) (*entity.Permission, error) {
	var m model.PermissionModel
	if err := r.db.WithContext(ctx).Where("name = ?", name).First(&m).Error; err != nil {
		return nil, repository.ErrPermissionNotFound
	}
	return modelToPermission(&m), nil
}

func (r *GormPermissionRepository) FindByIDs(ctx context.Context, ids []uuid.UUID) ([]*entity.Permission, error) {
	var models []model.PermissionModel
	if err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&models).Error; err != nil {
		return nil, err
	}
	perms := make([]*entity.Permission, len(models))
	for i, m := range models {
		perms[i] = modelToPermission(&m)
	}
	return perms, nil
}

func (r *GormPermissionRepository) List(ctx context.Context) ([]*entity.Permission, error) {
	var models []model.PermissionModel
	if err := r.db.WithContext(ctx).Order("module ASC, name ASC").Find(&models).Error; err != nil {
		return nil, err
	}
	perms := make([]*entity.Permission, len(models))
	for i, m := range models {
		perms[i] = modelToPermission(&m)
	}
	return perms, nil
}

func (r *GormPermissionRepository) ListGroupedByModule(ctx context.Context) (map[string][]*entity.Permission, error) {
	perms, err := r.List(ctx)
	if err != nil {
		return nil, err
	}
	grouped := make(map[string][]*entity.Permission)
	for _, p := range perms {
		mod := p.Module
		if mod == "" {
			mod = "Identity"
		}
		grouped[mod] = append(grouped[mod], p)
	}
	return grouped, nil
}

func (r *GormPermissionRepository) FindByUserID(ctx context.Context, userID uuid.UUID) ([]*entity.Permission, error) {
	var models []model.PermissionModel
	err := r.db.WithContext(ctx).
		Joins("JOIN identity_role_permissions irp ON irp.permission_id = identity_permissions.id").
		Joins("JOIN identity_user_roles iur ON iur.role_id = irp.role_id").
		Where("iur.user_id = ?", userID).
		Distinct().
		Find(&models).Error
	if err != nil {
		return nil, err
	}
	perms := make([]*entity.Permission, len(models))
	for i, m := range models {
		perms[i] = modelToPermission(&m)
	}
	return perms, nil
}

// ─── Refresh Token Repository ──────────────────────────────────────────────────

// GormRefreshTokenRepository is the GORM-backed implementation of RefreshTokenRepository.
type GormRefreshTokenRepository struct {
	db *gorm.DB
}

// NewGormRefreshTokenRepository creates a new GormRefreshTokenRepository.
func NewGormRefreshTokenRepository(db *gorm.DB) *GormRefreshTokenRepository {
	return &GormRefreshTokenRepository{db: db}
}

func (r *GormRefreshTokenRepository) Save(ctx context.Context, token *entity.RefreshToken) error {
	m := refreshTokenToModel(token)
	return r.db.WithContext(ctx).Save(&m).Error
}

func (r *GormRefreshTokenRepository) FindByTokenHash(ctx context.Context, tokenHash string) (*entity.RefreshToken, error) {
	var m model.RefreshTokenModel
	err := r.db.WithContext(ctx).Where("token_hash = ?", tokenHash).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, repository.ErrTokenNotFound
	}
	return modelToRefreshToken(&m), err
}

func (r *GormRefreshTokenRepository) RevokeAllForUser(ctx context.Context, userID uuid.UUID) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&model.RefreshTokenModel{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now).Error
}

func (r *GormRefreshTokenRepository) DeleteExpired(ctx context.Context) (int64, error) {
	result := r.db.WithContext(ctx).
		Where("expires_at < ?", time.Now().UTC()).
		Delete(&model.RefreshTokenModel{})
	return result.RowsAffected, result.Error
}

// ─── User Role Repository ──────────────────────────────────────────────────────

// GormUserRoleRepository manages user-role associations.
type GormUserRoleRepository struct {
	db *gorm.DB
}

// NewGormUserRoleRepository creates a new GormUserRoleRepository.
func NewGormUserRoleRepository(db *gorm.DB) *GormUserRoleRepository {
	return &GormUserRoleRepository{db: db}
}

func (r *GormUserRoleRepository) AssignRole(ctx context.Context, userID, roleID uuid.UUID) error {
	user := model.UserModel{ID: userID}
	role := model.RoleModel{ID: roleID}
	return r.db.WithContext(ctx).Model(&user).Association("Roles").Append(&role)
}

func (r *GormUserRoleRepository) AssignRoles(ctx context.Context, userID uuid.UUID, roleIDs []uuid.UUID) error {
	user := model.UserModel{ID: userID}
	roles := make([]model.RoleModel, len(roleIDs))
	for i, id := range roleIDs {
		roles[i] = model.RoleModel{ID: id}
	}
	return r.db.WithContext(ctx).Model(&user).Association("Roles").Append(&roles)
}

func (r *GormUserRoleRepository) ReplaceRoles(ctx context.Context, userID uuid.UUID, roleIDs []uuid.UUID) error {
	user := model.UserModel{ID: userID}
	roles := make([]model.RoleModel, len(roleIDs))
	for i, id := range roleIDs {
		roles[i] = model.RoleModel{ID: id}
	}
	return r.db.WithContext(ctx).Model(&user).Association("Roles").Replace(&roles)
}

func (r *GormUserRoleRepository) RemoveRole(ctx context.Context, userID, roleID uuid.UUID) error {
	user := model.UserModel{ID: userID}
	role := model.RoleModel{ID: roleID}
	return r.db.WithContext(ctx).Model(&user).Association("Roles").Delete(&role)
}

func (r *GormUserRoleRepository) FindRolesByUserID(ctx context.Context, userID uuid.UUID) ([]*entity.Role, error) {
	var user model.UserModel
	if err := r.db.WithContext(ctx).Preload("Roles.Permissions").First(&user, userID).Error; err != nil {
		return nil, err
	}
	roles := make([]*entity.Role, len(user.Roles))
	for i, r := range user.Roles {
		roles[i] = modelToRole(&r)
	}
	return roles, nil
}

// ─── Outbox Repository ────────────────────────────────────────────────────────

// GormOutboxRepository is the identity module's outbox repository.
type GormOutboxRepository struct {
	db *gorm.DB
}

// NewGormOutboxRepository creates a new GormOutboxRepository for the identity module.
func NewGormOutboxRepository(db *gorm.DB) *GormOutboxRepository {
	return &GormOutboxRepository{db: db}
}

// Save persists a new outbox event.
func (r *GormOutboxRepository) Save(ctx context.Context, event *outbox.Event) error {
	m := &model.OutboxEventModel{
		ID:         event.ID,
		EventName:  event.EventName,
		RoutingKey: event.RoutingKey,
		Payload:    event.Payload,
		Status:     string(event.Status),
		RetryCount: event.RetryCount,
		Error:      event.Error,
		CreatedAt:  event.CreatedAt,
		UpdatedAt:  event.UpdatedAt,
	}
	return r.db.WithContext(ctx).Create(m).Error
}
