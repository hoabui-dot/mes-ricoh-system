// Package rbac provides the Casbin RBAC enforcer setup for the MES Platform.
// Permissions follow the <resource>.<action> convention, e.g. "user.create".
// The enforcer uses a GORM adapter so policies are stored in PostgreSQL.
package rbac

import (
	"fmt"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
	gormadapter "github.com/casbin/gorm-adapter/v3"
	"gorm.io/gorm"
)

// ModelText is the Casbin RBAC model definition stored inline.
// Using role-permission (g) + permission policy (p) for fine-grained control.
const ModelText = `
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act || g(r.sub, "super_admin") || r.sub == "super_admin"
`

// Enforcer wraps the Casbin SyncedEnforcer for concurrent use.
type Enforcer struct {
	e *casbin.SyncedEnforcer
}

// NewEnforcer creates a Casbin RBAC enforcer backed by PostgreSQL via GORM.
// The casbin_rule table is created automatically by the GORM adapter.
func NewEnforcer(db *gorm.DB) (*Enforcer, error) {
	adapter, err := gormadapter.NewAdapterByDB(db)
	if err != nil {
		return nil, fmt.Errorf("casbin: create adapter: %w", err)
	}

	m, err := newModelFromText()
	if err != nil {
		return nil, fmt.Errorf("casbin: load model: %w", err)
	}

	enforcer, err := casbin.NewSyncedEnforcer(m, adapter)
	if err != nil {
		return nil, fmt.Errorf("casbin: new enforcer: %w", err)
	}

	if err := enforcer.LoadPolicy(); err != nil {
		return nil, fmt.Errorf("casbin: load policy: %w", err)
	}

	// Enable auto-save so policy changes are persisted immediately.
	enforcer.EnableAutoSave(true)

	return &Enforcer{e: enforcer}, nil
}

// Enforce checks whether subject (role name) has permission to perform act on obj.
// obj is the resource (e.g. "user"), act is the action (e.g. "create").
// Call as: enforcer.Enforce(roleName, "user", "create")
func (e *Enforcer) Enforce(subject, object, action string) (bool, error) {
	return e.e.Enforce(subject, object, action)
}

// EnforcePermission checks a full permission string like "user.create".
func (e *Enforcer) EnforcePermission(subject, permission string) (bool, error) {
	// Parse "resource.action" format.
	resource, action := splitPermission(permission)
	if resource == "" || action == "" {
		return false, fmt.Errorf("casbin: invalid permission format: %q", permission)
	}
	return e.e.Enforce(subject, resource, action)
}

// AddRoleForUser assigns a role to a subject.
func (e *Enforcer) AddRoleForUser(user, role string) error {
	_, err := e.e.AddRoleForUser(user, role)
	return err
}

// RemoveRoleForUser removes a role from a subject.
func (e *Enforcer) RemoveRoleForUser(user, role string) error {
	_, err := e.e.DeleteRoleForUser(user, role)
	return err
}

// AddPolicy adds a permission policy: (role, resource, action).
func (e *Enforcer) AddPolicy(role, resource, action string) error {
	_, err := e.e.AddPolicy(role, resource, action)
	return err
}

// RemovePolicy removes a permission policy.
func (e *Enforcer) RemovePolicy(role, resource, action string) error {
	_, err := e.e.RemovePolicy(role, resource, action)
	return err
}

// GetRolesForUser returns all roles assigned to a user/subject.
func (e *Enforcer) GetRolesForUser(user string) ([]string, error) {
	return e.e.GetRolesForUser(user)
}

// LoadPolicy reloads policies from the database. Call after bulk policy changes.
func (e *Enforcer) LoadPolicy() error {
	return e.e.LoadPolicy()
}

// SyncRolePermissions updates the Casbin policies for a given role code.
func (e *Enforcer) SyncRolePermissions(roleCode string, permNames []string) error {
	// Delete all existing permissions for role
	if _, err := e.e.DeletePermissionsForUser(roleCode); err != nil {
		return fmt.Errorf("casbin: delete role permissions: %w", err)
	}
	for _, perm := range permNames {
		resource, action := splitPermission(perm)
		if resource != "" && action != "" {
			if _, err := e.e.AddPolicy(roleCode, resource, action); err != nil {
				return fmt.Errorf("casbin: add policy (%s, %s, %s): %w", roleCode, resource, action, err)
			}
		}
	}
	return e.e.SavePolicy()
}

// SyncUserRoles updates the Casbin role groupings for a user subject (e.g. "user:<uuid>").
func (e *Enforcer) SyncUserRoles(userSub string, roleCodes []string) error {
	if _, err := e.e.DeleteRolesForUser(userSub); err != nil {
		return fmt.Errorf("casbin: delete user roles: %w", err)
	}
	for _, roleCode := range roleCodes {
		if roleCode != "" {
			if _, err := e.e.AddRoleForUser(userSub, roleCode); err != nil {
				return fmt.Errorf("casbin: add user role (%s, %s): %w", userSub, roleCode, err)
			}
		}
	}
	return e.e.SavePolicy()
}

// RemoveRolePolicies deletes all policies and role associations for a deleted role code.
func (e *Enforcer) RemoveRolePolicies(roleCode string) error {
	if _, err := e.e.DeleteRole(roleCode); err != nil {
		return fmt.Errorf("casbin: delete role (%s): %w", roleCode, err)
	}
	if _, err := e.e.DeletePermissionsForUser(roleCode); err != nil {
		return fmt.Errorf("casbin: delete role permissions (%s): %w", roleCode, err)
	}
	return e.e.SavePolicy()
}

// SeedDefaultPolicies seeds the default MES permission policies.
// This is idempotent — duplicate policies are silently ignored by Casbin.
func (e *Enforcer) SeedDefaultPolicies() error {
	policies := defaultPolicies()
	for _, p := range policies {
		if _, err := e.e.AddPolicy(p[0], p[1], p[2]); err != nil {
			return fmt.Errorf("casbin: seed policy %v: %w", p, err)
		}
	}
	return nil
}

// defaultPolicies returns the initial permission set for the MES system.
func defaultPolicies() [][]string {
	return [][]string{
		// super_admin wildcard is handled in the model matcher.

		// admin role
		{"admin", "user", "create"},
		{"admin", "user", "view"},
		{"admin", "user", "update"},
		{"admin", "user", "delete"},
		{"admin", "role", "manage"},
		{"admin", "permission", "manage"},
		{"admin", "worker", "create"},
		{"admin", "worker", "read"},
		{"admin", "worker", "view"},
		{"admin", "worker", "update"},
		{"admin", "worker", "delete"},
		{"admin", "worker", "restore"},
		{"admin", "skill", "manage"},
		{"admin", "department", "manage"},
		{"admin", "workshop", "manage"},
		{"admin", "team", "manage"},
		{"admin", "certificate", "manage"},
		{"admin", "planning", "publish"},
		{"admin", "planning", "override"},
		{"admin", "production", "release"},
		{"admin", "dashboard", "view"},
		{"admin", "audit", "view"},
		{"admin", "assignment", "override"},
		{"admin", "workflow", "create"},
		{"admin", "workflow", "view"},
		{"admin", "workflow", "update"},
		{"admin", "workflow", "publish"},
		{"admin", "workflow", "archive"},
		{"admin", "workflow", "clone"},
		{"admin", "workflow", "delete"},
		{"admin", "operation", "create"},
		{"admin", "operation", "update"},
		{"admin", "operation", "delete"},
		{"admin", "operation", "move"},

		// manager role
		{"manager", "user", "view"},
		{"manager", "worker", "read"},
		{"manager", "worker", "view"},
		{"manager", "worker", "update"},
		{"manager", "planning", "publish"},
		{"manager", "production", "release"},
		{"manager", "dashboard", "view"},
		{"manager", "assignment", "override"},
		{"manager", "audit", "view"},
		{"manager", "workflow", "create"},
		{"manager", "workflow", "view"},
		{"manager", "workflow", "update"},
		{"manager", "workflow", "publish"},
		{"manager", "workflow", "archive"},
		{"manager", "workflow", "clone"},
		{"manager", "operation", "create"},
		{"manager", "operation", "update"},
		{"manager", "operation", "delete"},
		{"manager", "operation", "move"},

		// operator role
		{"operator", "dashboard", "view"},
		{"operator", "worker", "read"},
		{"operator", "worker", "view"},
		{"operator", "workflow", "view"},
	}
}

func newModelFromText() (model.Model, error) {
	m, err := model.NewModelFromString(ModelText)
	if err != nil {
		return nil, err
	}
	return m, nil
}

func splitPermission(permission string) (string, string) {
	for i, c := range permission {
		if c == '.' {
			return permission[:i], permission[i+1:]
		}
	}
	return "", ""
}
