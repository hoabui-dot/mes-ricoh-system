package persistence

import (
	"github.com/nd/mes-platform/modules/identity/domain/entity"
	"github.com/nd/mes-platform/modules/identity/infrastructure/model"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Model → Entity mappers ───────────────────────────────────────────────────

func modelToUser(m *model.UserModel) *entity.User {
	u := &entity.User{}
	u.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
		DeletedAt: m.DeletedAt,
	}
	u.Username = m.Username
	u.Email = m.Email
	u.PasswordHash = m.PasswordHash
	u.FullName = m.FullName
	u.Phone = m.Phone
	u.Status = entity.UserStatus(m.Status)
	u.LastLoginAt = m.LastLoginAt
	u.PasswordResetToken = m.PasswordResetToken
	u.PasswordResetExpiresAt = m.PasswordResetExpiresAt
	for _, r := range m.Roles {
		u.Roles = append(u.Roles, *modelToRole(&r))
	}
	return u
}

func modelToRole(m *model.RoleModel) *entity.Role {
	r := &entity.Role{}
	r.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	r.Name = m.Name
	r.Code = m.Code
	r.Description = m.Description
	r.IsSystem = m.IsSystem
	for _, p := range m.Permissions {
		r.Permissions = append(r.Permissions, *modelToPermission(&p))
	}
	return r
}

func modelToPermission(m *model.PermissionModel) *entity.Permission {
	p := &entity.Permission{}
	p.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	p.Name = m.Name
	p.Description = m.Description
	p.Resource = m.Resource
	p.Action = m.Action
	p.Module = m.Module
	p.DisplayName = m.DisplayName
	p.Category = m.Category
	return p
}

func modelToRefreshToken(m *model.RefreshTokenModel) *entity.RefreshToken {
	t := &entity.RefreshToken{}
	t.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	t.UserID = m.UserID
	t.TokenHash = m.TokenHash
	t.ExpiresAt = m.ExpiresAt
	t.RevokedAt = m.RevokedAt
	t.UserAgent = m.UserAgent
	t.IPAddress = m.IPAddress
	return t
}

// ─── Entity → Model mappers ───────────────────────────────────────────────────

func userToModel(u *entity.User) *model.UserModel {
	m := &model.UserModel{
		ID:                     u.ID,
		Username:               u.Username,
		Email:                  u.Email,
		PasswordHash:           u.PasswordHash,
		FullName:               u.FullName,
		Phone:                  u.Phone,
		Status:                 string(u.Status),
		LastLoginAt:            u.LastLoginAt,
		PasswordResetToken:     u.PasswordResetToken,
		PasswordResetExpiresAt: u.PasswordResetExpiresAt,
		CreatedAt:              u.CreatedAt,
		UpdatedAt:              u.UpdatedAt,
		DeletedAt:              u.DeletedAt,
	}
	return m
}

func roleToModel(r *entity.Role) *model.RoleModel {
	return &model.RoleModel{
		ID:          r.ID,
		Name:        r.Name,
		Code:        r.Code,
		Description: r.Description,
		IsSystem:    r.IsSystem,
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
	}
}

func permissionToModel(p *entity.Permission) *model.PermissionModel {
	return &model.PermissionModel{
		ID:          p.ID,
		Name:        p.Name,
		Description: p.Description,
		Resource:    p.Resource,
		Action:      p.Action,
		Module:      p.Module,
		DisplayName: p.DisplayName,
		Category:    p.Category,
		CreatedAt:   p.CreatedAt,
		UpdatedAt:   p.UpdatedAt,
	}
}

func refreshTokenToModel(t *entity.RefreshToken) *model.RefreshTokenModel {
	return &model.RefreshTokenModel{
		ID:        t.ID,
		UserID:    t.UserID,
		TokenHash: t.TokenHash,
		ExpiresAt: t.ExpiresAt,
		RevokedAt: t.RevokedAt,
		UserAgent: t.UserAgent,
		IPAddress: t.IPAddress,
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
}
