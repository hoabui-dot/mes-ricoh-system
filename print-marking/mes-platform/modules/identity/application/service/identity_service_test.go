package service_test

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/identity/application/dto"
	"github.com/nd/mes-platform/modules/identity/application/service"
	"github.com/nd/mes-platform/modules/identity/domain/entity"
	"github.com/nd/mes-platform/modules/identity/infrastructure/model"
	"github.com/nd/mes-platform/modules/identity/infrastructure/persistence"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/outbox"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// MockOutboxRepository implements the OutboxRepository interface for testing.
type MockOutboxRepository struct {
	Events []*outbox.Event
}

func (m *MockOutboxRepository) Save(ctx context.Context, event *outbox.Event) error {
	m.Events = append(m.Events, event)
	return nil
}

type mockEnforcer struct{}

func (m *mockEnforcer) SyncRolePermissions(roleCode string, permNames []string) error { return nil }
func (m *mockEnforcer) SyncUserRoles(userSub string, roleCodes []string) error          { return nil }
func (m *mockEnforcer) RemoveRolePolicies(roleCode string) error                       { return nil }
func (m *mockEnforcer) AddRoleForUser(user, role string) error                          { return nil }
func (m *mockEnforcer) RemoveRoleForUser(user, role string) error                       { return nil }

func setupTestDB(t *testing.T) (*gorm.DB, *MockOutboxRepository, *service.IdentityService) {
	// Use in-memory SQLite
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	// Migrate schemas
	err = db.AutoMigrate(
		&model.UserModel{},
		&model.RoleModel{},
		&model.PermissionModel{},
		&model.RefreshTokenModel{},
		&model.OutboxEventModel{},
		&model.AuditLogModel{},
	)
	require.NoError(t, err)

	// Initialize repositories
	userRepo := persistence.NewGormUserRepository(db)
	roleRepo := persistence.NewGormRoleRepository(db)
	permRepo := persistence.NewGormPermissionRepository(db)
	tokenRepo := persistence.NewGormRefreshTokenRepository(db)
	userRoleRepo := persistence.NewGormUserRoleRepository(db)
	outboxRepo := &MockOutboxRepository{}

	// Setup JWT Manager
	jwtMgr, err := jwt.NewManager(jwt.Config{
		Secret:              "super_secret_key_at_least_64_characters_long_for_testing_purposes",
		AccessExpiryMinutes: 15,
		RefreshExpiryDays:   30,
		Issuer:              "test-issuer",
		Audience:            "test-audience",
	})
	require.NoError(t, err)

	// Password policy
	policy := entity.PasswordPolicy{
		MinLength:        8,
		RequireUppercase: true,
		RequireLowercase: true,
		RequireNumber:    true,
		RequireSpecial:   false,
	}

	log := logger.NewNop()

	svc := service.NewIdentityService(
		userRepo,
		roleRepo,
		permRepo,
		tokenRepo,
		userRoleRepo,
		outboxRepo,
		&mockEnforcer{},
		jwtMgr,
		policy,
		log,
	)

	return db, outboxRepo, svc
}

func TestIdentityService_Register_Success(t *testing.T) {
	_, outboxRepo, svc := setupTestDB(t)

	req := dto.RegisterUserRequest{
		Username: "newuser",
		Email:    "newuser@example.com",
		FullName: "New User",
		Password: "Password123",
	}

	userDto, err := svc.Register(context.Background(), req)
	require.NoError(t, err)
	require.NotNil(t, userDto)

	assert.Equal(t, "newuser", userDto.Username)
	assert.Equal(t, "newuser@example.com", userDto.Email)
	assert.Equal(t, "New User", userDto.FullName)
	assert.Equal(t, "active", userDto.Status)

	// Verify domain event registered in outbox
	assert.Len(t, outboxRepo.Events, 1)
	assert.Equal(t, "mes.identity.UserRegistered", outboxRepo.Events[0].EventName)
}

func TestIdentityService_Register_Conflict(t *testing.T) {
	_, _, svc := setupTestDB(t)

	req := dto.RegisterUserRequest{
		Username: "conflictuser",
		Email:    "conflict@example.com",
		FullName: "Conflict User",
		Password: "Password123",
	}

	_, err := svc.Register(context.Background(), req)
	require.NoError(t, err)

	// Try registering with same email
	reqSameEmail := dto.RegisterUserRequest{
		Username: "otherusername",
		Email:    "conflict@example.com",
		FullName: "Other User",
		Password: "Password123",
	}
	_, err = svc.Register(context.Background(), reqSameEmail)
	assert.ErrorIs(t, err, service.ErrConflict)

	// Try registering with same username
	reqSameUser := dto.RegisterUserRequest{
		Username: "conflictuser",
		Email:    "otheremail@example.com",
		FullName: "Other User",
		Password: "Password123",
	}
	_, err = svc.Register(context.Background(), reqSameUser)
	assert.ErrorIs(t, err, service.ErrConflict)
}

func TestIdentityService_Login_Success(t *testing.T) {
	_, outboxRepo, svc := setupTestDB(t)

	// 1. Register a user first
	regReq := dto.RegisterUserRequest{
		Username: "loginuser",
		Email:    "login@example.com",
		FullName: "Login User",
		Password: "Password123",
	}
	_, err := svc.Register(context.Background(), regReq)
	require.NoError(t, err)

	// Clear outbox after registration to isolate login events
	outboxRepo.Events = nil

	// 2. Perform Login
	loginReq := dto.LoginRequest{
		Email:    "login@example.com",
		Password: "Password123",
	}
	resp, err := svc.Login(context.Background(), loginReq, "TestAgent", "127.0.0.1")
	require.NoError(t, err)
	require.NotNil(t, resp)

	assert.NotEmpty(t, resp.AccessToken)
	assert.NotEmpty(t, resp.RefreshToken)
	assert.Equal(t, "Bearer", resp.TokenType)
	assert.Equal(t, "loginuser", resp.User.Username)

	// Login sets last login time and writes event to outbox
	assert.Len(t, outboxRepo.Events, 1)
	assert.Equal(t, "mes.identity.UserLoggedIn", outboxRepo.Events[0].EventName)
}

func TestIdentityService_Login_InvalidCredentials(t *testing.T) {
	_, _, svc := setupTestDB(t)

	// Register user
	regReq := dto.RegisterUserRequest{
		Username: "loginuser",
		Email:    "login@example.com",
		FullName: "Login User",
		Password: "Password123",
	}
	_, err := svc.Register(context.Background(), regReq)
	require.NoError(t, err)

	// Wrong password
	loginReq := dto.LoginRequest{
		Email:    "login@example.com",
		Password: "WrongPassword",
	}
	_, err = svc.Login(context.Background(), loginReq, "TestAgent", "127.0.0.1")
	assert.ErrorIs(t, err, service.ErrUnauthorized)

	// Non-existent email
	loginReq2 := dto.LoginRequest{
		Email:    "nonexistent@example.com",
		Password: "Password123",
	}
	_, err = svc.Login(context.Background(), loginReq2, "TestAgent", "127.0.0.1")
	assert.ErrorIs(t, err, service.ErrUnauthorized)
}

func TestIdentityService_Refresh_Success(t *testing.T) {
	_, _, svc := setupTestDB(t)

	regReq := dto.RegisterUserRequest{
		Username: "refreshuser",
		Email:    "refresh@example.com",
		FullName: "Refresh User",
		Password: "Password123",
	}
	_, err := svc.Register(context.Background(), regReq)
	require.NoError(t, err)

	loginReq := dto.LoginRequest{
		Email:    "refresh@example.com",
		Password: "Password123",
	}
	loginResp, err := svc.Login(context.Background(), loginReq, "TestAgent", "127.0.0.1")
	require.NoError(t, err)

	// Rotation/Refresh
	refreshReq := dto.RefreshTokenRequest{
		RefreshToken: loginResp.RefreshToken,
	}
	refreshResp, err := svc.Refresh(context.Background(), refreshReq, "TestAgent", "127.0.0.1")
	require.NoError(t, err)
	require.NotNil(t, refreshResp)

	assert.NotEmpty(t, refreshResp.AccessToken)
	assert.NotEmpty(t, refreshResp.RefreshToken)
	assert.NotEqual(t, loginResp.RefreshToken, refreshResp.RefreshToken) // Token rotated!

	// Old refresh token must be invalid now
	_, err = svc.Refresh(context.Background(), refreshReq, "TestAgent", "127.0.0.1")
	assert.ErrorIs(t, err, service.ErrUnauthorized)
}

func TestIdentityService_Logout(t *testing.T) {
	_, _, svc := setupTestDB(t)

	regReq := dto.RegisterUserRequest{
		Username: "logoutuser",
		Email:    "logout@example.com",
		FullName: "Logout User",
		Password: "Password123",
	}
	u, err := svc.Register(context.Background(), regReq)
	require.NoError(t, err)

	loginReq := dto.LoginRequest{
		Email:    "logout@example.com",
		Password: "Password123",
	}
	loginResp, err := svc.Login(context.Background(), loginReq, "TestAgent", "127.0.0.1")
	require.NoError(t, err)

	// Logout
	err = svc.Logout(context.Background(), u.ID)
	require.NoError(t, err)

	// Refresh token should be revoked and fail
	refreshReq := dto.RefreshTokenRequest{
		RefreshToken: loginResp.RefreshToken,
	}
	_, err = svc.Refresh(context.Background(), refreshReq, "TestAgent", "127.0.0.1")
	assert.ErrorIs(t, err, service.ErrUnauthorized)
}

func TestIdentityService_ChangePassword(t *testing.T) {
	_, outboxRepo, svc := setupTestDB(t)

	regReq := dto.RegisterUserRequest{
		Username: "passworduser",
		Email:    "password@example.com",
		FullName: "Password User",
		Password: "Password123",
	}
	u, err := svc.Register(context.Background(), regReq)
	require.NoError(t, err)

	outboxRepo.Events = nil

	// Change Password
	changeReq := dto.ChangePasswordRequest{
		CurrentPassword: "Password123",
		NewPassword:     "NewPassword456",
	}
	err = svc.ChangePassword(context.Background(), u.ID, changeReq)
	require.NoError(t, err)

	// Outbox should contain PasswordChangedEvent
	assert.Len(t, outboxRepo.Events, 1)
	assert.Equal(t, "mes.identity.PasswordChanged", outboxRepo.Events[0].EventName)

	// Try login with old password
	loginReq := dto.LoginRequest{
		Email:    "password@example.com",
		Password: "Password123",
	}
	_, err = svc.Login(context.Background(), loginReq, "TestAgent", "127.0.0.1")
	assert.ErrorIs(t, err, service.ErrUnauthorized)

	// Try login with new password
	loginReq.Password = "NewPassword456"
	loginResp, err := svc.Login(context.Background(), loginReq, "TestAgent", "127.0.0.1")
	require.NoError(t, err)
	assert.NotNil(t, loginResp)
}

func TestIdentityService_UpdateProfile(t *testing.T) {
	_, _, svc := setupTestDB(t)

	regReq := dto.RegisterUserRequest{
		Username: "profileuser",
		Email:    "profile@example.com",
		FullName: "Profile User",
		Password: "Password123",
	}
	u, err := svc.Register(context.Background(), regReq)
	require.NoError(t, err)

	updateReq := dto.UpdateProfileRequest{
		FullName: "Updated Full Name",
		Phone:    "123456789",
	}
	updatedUser, err := svc.UpdateProfile(context.Background(), u.ID, updateReq)
	require.NoError(t, err)

	assert.Equal(t, "Updated Full Name", updatedUser.FullName)
	assert.Equal(t, "123456789", updatedUser.Phone)

	// Get user again to confirm persistence
	got, err := svc.GetUser(context.Background(), u.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Full Name", got.FullName)
	assert.Equal(t, "123456789", got.Phone)
}

func TestIdentityService_UpdateUserStatus(t *testing.T) {
	_, outboxRepo, svc := setupTestDB(t)

	regReq := dto.RegisterUserRequest{
		Username: "statususer",
		Email:    "status@example.com",
		FullName: "Status User",
		Password: "Password123",
	}
	u, err := svc.Register(context.Background(), regReq)
	require.NoError(t, err)

	outboxRepo.Events = nil

	adminID := uuid.New()
	statusReq := dto.UpdateUserStatusRequest{
		Status: "suspended",
	}

	err = svc.UpdateUserStatus(context.Background(), u.ID, adminID, statusReq)
	require.NoError(t, err)

	// Get user and verify suspended status
	got, err := svc.GetUser(context.Background(), u.ID)
	require.NoError(t, err)
	assert.Equal(t, "suspended", got.Status)

	// UserStatusChangedEvent should be in outbox
	assert.Len(t, outboxRepo.Events, 1)
	assert.Equal(t, "mes.identity.UserStatusChanged", outboxRepo.Events[0].EventName)

	// Login should fail for suspended user
	loginReq := dto.LoginRequest{
		Email:    "status@example.com",
		Password: "Password123",
	}
	_, err = svc.Login(context.Background(), loginReq, "TestAgent", "127.0.0.1")
	assert.ErrorIs(t, err, service.ErrForbidden)
}
