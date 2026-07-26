package rbac_test

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/nd/mes-platform/modules/identity/infrastructure/rbac"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRBAC_EnforceDefaultPolicies(t *testing.T) {
	// Create in-memory SQLite database
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	// Create new RBAC enforcer
	enforcer, err := rbac.NewEnforcer(db)
	require.NoError(t, err)

	// Seed policies
	err = enforcer.SeedDefaultPolicies()
	require.NoError(t, err)

	// Test case scenarios
	tests := []struct {
		subject    string
		permission string
		expected   bool
	}{
		// 1. super_admin wildcard checks
		{"super_admin", "user.create", true},
		{"super_admin", "worker.delete", true},
		{"super_admin", "audit.view", true},
		{"super_admin", "some.nonexistent.permission", true},

		// 2. admin checks
		{"admin", "user.create", true},
		{"admin", "user.delete", true},
		{"admin", "role.manage", true},
		{"admin", "worker.create", true},
		{"admin", "planning.publish", true},
		{"admin", "production.release", true},
		{"admin", "audit.view", true},
		{"admin", "dashboard.view", true},

		// 3. manager checks
		{"manager", "user.view", true},
		{"manager", "user.create", false},
		{"manager", "worker.update", true},
		{"manager", "worker.delete", false},
		{"manager", "planning.publish", true},
		{"manager", "production.release", true},
		{"manager", "audit.view", true},
		{"manager", "role.manage", false},

		// 4. operator checks
		{"operator", "dashboard.view", true},
		{"operator", "worker.view", true},
		{"operator", "worker.create", false},
		{"operator", "planning.publish", false},
		{"operator", "production.release", false},
		{"operator", "audit.view", false},
	}

	for _, tt := range tests {
		allowed, err := enforcer.EnforcePermission(tt.subject, tt.permission)
		require.NoError(t, err)
		assert.Equalf(t, tt.expected, allowed, "subject: %s, permission: %s", tt.subject, tt.permission)
	}
}

func TestRBAC_AddRemoveUserRoles(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	enforcer, err := rbac.NewEnforcer(db)
	require.NoError(t, err)

	err = enforcer.SeedDefaultPolicies()
	require.NoError(t, err)

	userSubject := "user_john_doe"

	// John starts with no roles
	roles, err := enforcer.GetRolesForUser(userSubject)
	require.NoError(t, err)
	assert.Empty(t, roles)

	// Give John the operator role
	err = enforcer.AddRoleForUser(userSubject, "operator")
	require.NoError(t, err)

	// John can now view the dashboard
	allowed, err := enforcer.EnforcePermission(userSubject, "dashboard.view")
	require.NoError(t, err)
	assert.True(t, allowed)

	// John cannot release production order
	allowed, err = enforcer.EnforcePermission(userSubject, "production.release")
	require.NoError(t, err)
	assert.False(t, allowed)

	// Upgrade John to manager
	err = enforcer.AddRoleForUser(userSubject, "manager")
	require.NoError(t, err)

	// Now John can release production orders (transitive / multiple roles check)
	allowed, err = enforcer.EnforcePermission(userSubject, "production.release")
	require.NoError(t, err)
	assert.True(t, allowed)

	// Remove manager role
	err = enforcer.RemoveRoleForUser(userSubject, "manager")
	require.NoError(t, err)

	// John cannot release production orders anymore
	allowed, err = enforcer.EnforcePermission(userSubject, "production.release")
	require.NoError(t, err)
	assert.False(t, allowed)
}
