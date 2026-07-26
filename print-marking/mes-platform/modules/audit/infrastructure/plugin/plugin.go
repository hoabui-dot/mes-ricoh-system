package plugin

import (
	"context"
	"encoding/json"
	"reflect"
	"sync"

	"github.com/google/uuid"
	auditcontext "github.com/nd/mes-platform/modules/audit/application/context"
	"github.com/nd/mes-platform/modules/audit/domain/entity"
	"github.com/nd/mes-platform/modules/audit/domain/repository"
	"gorm.io/gorm"
)

type AuditPlugin struct {
	repo repository.AuditRepository
	mu   sync.RWMutex
	// Cache map of old states for updates, keyed by db statement pointer or context
	oldStates map[uintptr]string
}

func NewAuditPlugin(repo repository.AuditRepository) *AuditPlugin {
	return &AuditPlugin{
		repo:      repo,
		oldStates: make(map[uintptr]string),
	}
}

func (p *AuditPlugin) Name() string {
	return "AuditPlugin"
}

func (p *AuditPlugin) Initialize(db *gorm.DB) error {
	// Register After Create
	if err := db.Callback().Create().After("gorm:create").Register("audit:after_create", p.afterCreate); err != nil {
		return err
	}

	// Register Before Update (to capture old state)
	if err := db.Callback().Update().Before("gorm:update").Register("audit:before_update", p.beforeUpdate); err != nil {
		return err
	}

	// Register After Update (to compare and log changes)
	if err := db.Callback().Update().After("gorm:update").Register("audit:after_update", p.afterUpdate); err != nil {
		return err
	}

	// Register Before Delete
	if err := db.Callback().Delete().Before("gorm:delete").Register("audit:before_delete", p.beforeDelete); err != nil {
		return err
	}

	return nil
}

func (p *AuditPlugin) afterCreate(db *gorm.DB) {
	if db.Error != nil || db.Statement.Table == "audit_logs" {
		return
	}

	ctx := db.Statement.Context
	traceID := auditcontext.GetTraceID(ctx)
	if traceID == "" {
		return // only audit tracked request flows
	}
	correlationID := auditcontext.GetCorrelationID(ctx)
	userID := auditcontext.GetUserID(ctx)

	newValBytes, err := json.Marshal(db.Statement.Dest)
	if err != nil {
		return
	}

	entityID := p.getPrimaryKey(db)

	logEntry, _ := entity.NewAuditLog(
		traceID,
		correlationID,
		userID,
		"CREATE",
		db.Statement.Table,
		entityID,
		"",
		string(newValBytes),
	)
	if logEntry != nil {
		_ = p.repo.Save(context.Background(), logEntry)
	}
}

func (p *AuditPlugin) beforeUpdate(db *gorm.DB) {
	if db.Error != nil || db.Statement.Table == "audit_logs" {
		return
	}

	ctx := db.Statement.Context
	traceID := auditcontext.GetTraceID(ctx)
	if traceID == "" {
		return
	}

	// Fetch current state from DB before update runs
	primaryKey := p.getPrimaryKey(db)
	if primaryKey == "" {
		return
	}

	var oldModels []map[string]any
	err := db.Session(&gorm.Session{NewDB: true}).
		Table(db.Statement.Table).
		Where("id = ?", primaryKey).
		Limit(1).
		Find(&oldModels).Error
	if err != nil || len(oldModels) == 0 {
		return
	}

	bytes, err := json.Marshal(oldModels[0])
	if err == nil {
		p.mu.Lock()
		key := uintptr(db.Statement.ReflectValue.UnsafeAddr())
		p.oldStates[key] = string(bytes)
		p.mu.Unlock()
	}
}

func (p *AuditPlugin) afterUpdate(db *gorm.DB) {
	if db.Error != nil || db.Statement.Table == "audit_logs" {
		return
	}

	ctx := db.Statement.Context
	traceID := auditcontext.GetTraceID(ctx)
	if traceID == "" {
		return
	}
	correlationID := auditcontext.GetCorrelationID(ctx)
	userID := auditcontext.GetUserID(ctx)

	key := uintptr(db.Statement.ReflectValue.UnsafeAddr())
	p.mu.RLock()
	oldJSON, exists := p.oldStates[key]
	p.mu.RUnlock()

	if !exists {
		return
	}

	p.mu.Lock()
	delete(p.oldStates, key)
	p.mu.Unlock()

	// Query new values
	primaryKey := p.getPrimaryKey(db)
	var newModels []map[string]any
	err := db.Session(&gorm.Session{NewDB: true}).
		Table(db.Statement.Table).
		Where("id = ?", primaryKey).
		Limit(1).
		Find(&newModels).Error
	if err != nil || len(newModels) == 0 {
		return
	}

	newJSONBytes, err := json.Marshal(newModels[0])
	if err != nil {
		return
	}

	logEntry, _ := entity.NewAuditLog(
		traceID,
		correlationID,
		userID,
		"UPDATE",
		db.Statement.Table,
		primaryKey,
		oldJSON,
		string(newJSONBytes),
	)
	if logEntry != nil {
		_ = p.repo.Save(context.Background(), logEntry)
	}
}

func (p *AuditPlugin) beforeDelete(db *gorm.DB) {
	if db.Error != nil || db.Statement.Table == "audit_logs" {
		return
	}

	ctx := db.Statement.Context
	traceID := auditcontext.GetTraceID(ctx)
	if traceID == "" {
		return
	}
	correlationID := auditcontext.GetCorrelationID(ctx)
	userID := auditcontext.GetUserID(ctx)

	primaryKey := p.getPrimaryKey(db)
	if primaryKey == "" {
		return
	}

	var oldModels []map[string]any
	err := db.Session(&gorm.Session{NewDB: true}).
		Table(db.Statement.Table).
		Where("id = ?", primaryKey).
		Limit(1).
		Find(&oldModels).Error
	if err != nil || len(oldModels) == 0 {
		return
	}

	bytes, err := json.Marshal(oldModels[0])
	if err != nil {
		return
	}

	logEntry, _ := entity.NewAuditLog(
		traceID,
		correlationID,
		userID,
		"DELETE",
		db.Statement.Table,
		primaryKey,
		string(bytes),
		"",
	)
	if logEntry != nil {
		_ = p.repo.Save(context.Background(), logEntry)
	}
}

func (p *AuditPlugin) getPrimaryKey(db *gorm.DB) string {
	// 1. Try GORM Schema PrimaryFields first if available
	if db.Statement.Schema != nil && len(db.Statement.Schema.PrimaryFields) > 0 {
		field := db.Statement.Schema.PrimaryFields[0]
		val, zero := field.ValueOf(db.Statement.Context, db.Statement.ReflectValue)
		if !zero {
			switch id := val.(type) {
			case uuid.UUID:
				return id.String()
			case string:
				return id
			}
		}
	}

	// 2. Fallback to using reflection to extract field named "ID" from statement destination/model
	dest := db.Statement.Dest
	if dest == nil {
		dest = db.Statement.Model
	}
	if dest != nil {
		val := reflect.ValueOf(dest)
		for val.Kind() == reflect.Ptr {
			val = val.Elem()
		}
		if val.Kind() == reflect.Struct {
			idField := val.FieldByName("ID")
			if idField.IsValid() {
				switch idVal := idField.Interface().(type) {
				case uuid.UUID:
					return idVal.String()
				case string:
					return idVal
				}
			}
		}
	}

	return ""
}
