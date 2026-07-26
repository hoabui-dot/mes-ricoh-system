package entity_test

import (
	"testing"
	"time"

	"github.com/nd/mes-platform/modules/identity/domain/entity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// defaultPolicy is a test password policy with all requirements enabled.
func defaultPolicy() entity.PasswordPolicy {
	return entity.PasswordPolicy{
		MinLength:        8,
		RequireUppercase: true,
		RequireLowercase: true,
		RequireNumber:    true,
		RequireSpecial:   false,
	}
}

// TestUnit_NewUser_Success verifies that a valid user can be created.
func TestUnit_NewUser_Success(t *testing.T) {
	policy := defaultPolicy()
	user, err := entity.NewUser("johndoe", "john@example.com", "John Doe", "Password1", policy)
	require.NoError(t, err)
	assert.NotEmpty(t, user.ID)
	assert.Equal(t, "johndoe", user.Username)
	assert.Equal(t, "john@example.com", user.Email)
	assert.Equal(t, "John Doe", user.FullName)
	assert.Equal(t, entity.UserStatusActive, user.Status)
	assert.NotEmpty(t, user.PasswordHash)
	// Password must not be stored in plaintext.
	assert.NotEqual(t, "Password1", user.PasswordHash)
}

// TestUnit_NewUser_InvalidEmail verifies that an invalid email is rejected.
func TestUnit_NewUser_InvalidEmail(t *testing.T) {
	policy := defaultPolicy()
	_, err := entity.NewUser("johndoe", "not-an-email", "John Doe", "Password1", policy)
	assert.ErrorContains(t, err, "invalid email")
}

// TestUnit_NewUser_EmptyUsername verifies that an empty username is rejected.
func TestUnit_NewUser_EmptyUsername(t *testing.T) {
	policy := defaultPolicy()
	_, err := entity.NewUser("", "john@example.com", "John Doe", "Password1", policy)
	assert.ErrorContains(t, err, "username is required")
}

// TestUnit_NewUser_WeakPassword verifies that weak passwords are rejected.
func TestUnit_NewUser_WeakPassword(t *testing.T) {
	policy := defaultPolicy()

	tests := []struct {
		name     string
		password string
		errMsg   string
	}{
		{"too short", "Abc1", "at least 8"},
		{"no uppercase", "password1", "uppercase"},
		{"no number", "Password", "number"},
		{"no lowercase", "PASSWORD1", "lowercase"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := entity.NewUser("user", "user@example.com", "User", tt.password, policy)
			assert.ErrorContains(t, err, tt.errMsg)
		})
	}
}

// TestUnit_User_VerifyPassword verifies correct password validation.
func TestUnit_User_VerifyPassword(t *testing.T) {
	policy := defaultPolicy()
	user, err := entity.NewUser("johndoe", "john@example.com", "John Doe", "Password1", policy)
	require.NoError(t, err)

	assert.True(t, user.VerifyPassword("Password1"), "correct password should verify")
	assert.False(t, user.VerifyPassword("WrongPass1"), "wrong password should fail")
}

// TestUnit_User_ChangePassword verifies password change logic.
func TestUnit_User_ChangePassword(t *testing.T) {
	policy := defaultPolicy()
	user, _ := entity.NewUser("johndoe", "john@example.com", "John Doe", "Password1", policy)

	// Correct old password.
	err := user.ChangePassword("Password1", "NewPass99", policy)
	require.NoError(t, err)
	assert.True(t, user.VerifyPassword("NewPass99"))
	assert.False(t, user.VerifyPassword("Password1"))
}

// TestUnit_User_ChangePassword_WrongOld verifies that wrong current password is rejected.
func TestUnit_User_ChangePassword_WrongOld(t *testing.T) {
	policy := defaultPolicy()
	user, _ := entity.NewUser("johndoe", "john@example.com", "John Doe", "Password1", policy)

	err := user.ChangePassword("WrongOld1", "NewPass99", policy)
	assert.ErrorContains(t, err, "current password is incorrect")
}

// TestUnit_User_DomainEvents verifies that creating a user records a domain event.
func TestUnit_User_DomainEvents(t *testing.T) {
	policy := defaultPolicy()
	user, _ := entity.NewUser("johndoe", "john@example.com", "John Doe", "Password1", policy)

	events := user.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.identity.UserRegistered", events[0].EventName())

	// After pulling, events should be empty.
	events2 := user.PullEvents()
	assert.Empty(t, events2)
}

// TestUnit_User_StatusTransitions verifies user status state machine.
func TestUnit_User_StatusTransitions(t *testing.T) {
	policy := defaultPolicy()
	user, _ := entity.NewUser("johndoe", "john@example.com", "John Doe", "Password1", policy)
	assert.True(t, user.IsActive())

	user.Suspend()
	assert.Equal(t, entity.UserStatusSuspended, user.Status)
	assert.False(t, user.IsActive())

	user.Activate()
	assert.Equal(t, entity.UserStatusActive, user.Status)
	assert.True(t, user.IsActive())

	user.Deactivate()
	assert.Equal(t, entity.UserStatusInactive, user.Status)
}

// TestUnit_PasswordPolicy_Validate tests all policy rules independently.
func TestUnit_PasswordPolicy_Validate(t *testing.T) {
	policy := entity.PasswordPolicy{
		MinLength:        10,
		RequireUppercase: true,
		RequireLowercase: true,
		RequireNumber:    true,
		RequireSpecial:   true,
	}

	assert.Error(t, policy.Validate("Short1!"))
	assert.Error(t, policy.Validate("nouppercase1!nouppercase"))
	assert.Error(t, policy.Validate("NOLOWERCASE1!NOLOWERCASE"))
	assert.Error(t, policy.Validate("NoNumber!NoNumber"))
	assert.Error(t, policy.Validate("NoSpecial1NoSpecial1"))
	assert.NoError(t, policy.Validate("Secure1!Safe"))
}

// TestUnit_NewRole verifies role creation validation.
func TestUnit_NewRole(t *testing.T) {
	role, err := entity.NewRole("manager", "Factory manager")
	require.NoError(t, err)
	assert.Equal(t, "manager", role.Name)
	assert.NotEmpty(t, role.ID)

	_, err = entity.NewRole("", "empty name")
	assert.Error(t, err)
}

// TestUnit_NewPermission verifies permission naming convention.
func TestUnit_NewPermission(t *testing.T) {
	perm, err := entity.NewPermission("worker.create", "Create workers")
	require.NoError(t, err)
	assert.Equal(t, "worker", perm.Resource)
	assert.Equal(t, "create", perm.Action)

	_, err = entity.NewPermission("invalidformat", "no dot")
	assert.ErrorContains(t, err, "convention")
}

// TestUnit_RefreshToken_IsValid tests token validity checks.
func TestUnit_RefreshToken_IsValid(t *testing.T) {
	t.Run("valid token is valid", func(t *testing.T) {
		user, _ := entity.NewUser("u", "u@x.com", "U", "Password1", defaultPolicy())
		token := entity.NewRefreshToken(user.ID, "hash123",
			time.Now().UTC().Add(24*time.Hour), "Mozilla/5.0", "127.0.0.1")
		assert.True(t, token.IsValid())
	})

	t.Run("revoked token is invalid", func(t *testing.T) {
		user, _ := entity.NewUser("u", "u@x.com", "U", "Password1", defaultPolicy())
		token := entity.NewRefreshToken(user.ID, "hash123",
			time.Now().UTC().Add(24*time.Hour), "Mozilla/5.0", "127.0.0.1")
		token.Revoke()
		assert.False(t, token.IsValid())
	})

	t.Run("expired token is invalid", func(t *testing.T) {
		user, _ := entity.NewUser("u", "u@x.com", "U", "Password1", defaultPolicy())
		token := entity.NewRefreshToken(user.ID, "hash123",
			time.Now().UTC().Add(-1*time.Hour), "Mozilla/5.0", "127.0.0.1")
		assert.False(t, token.IsValid())
	})
}
