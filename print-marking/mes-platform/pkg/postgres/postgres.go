// Package postgres provides a production-grade PostgreSQL connection pool
// backed by GORM. It enforces connection pool limits, health checking, and
// automatic migration registration.
package postgres

import (
	"fmt"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

// Config holds all PostgreSQL connection settings.
type Config struct {
	Host            string
	Port            int
	User            string
	Password        string
	DBName          string
	SSLMode         string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	// LogLevel controls GORM query logging (Silent=1, Error=2, Warn=3, Info=4).
	LogLevel int
}

// DB wraps *gorm.DB so that callers always go through the interface boundary.
type DB struct {
	*gorm.DB
}

// New creates a new PostgreSQL connection pool from config.
// It returns an error if the connection or ping fails.
func New(cfg Config) (*DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s TimeZone=UTC",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode,
	)

	logLevel := logger.LogLevel(cfg.LogLevel)
	if logLevel == 0 {
		logLevel = logger.Silent
	}

	gormCfg := &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
		NamingStrategy: schema.NamingStrategy{
			SingularTable: false,
		},
		PrepareStmt:                              true,
		DisableForeignKeyConstraintWhenMigrating: false,
	}

	db, err := gorm.Open(postgres.Open(dsn), gormCfg)
	if err != nil {
		return nil, fmt.Errorf("postgres: failed to open connection: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("postgres: failed to get underlying sql.DB: %w", err)
	}

	maxOpen := cfg.MaxOpenConns
	if maxOpen == 0 {
		maxOpen = 25
	}
	maxIdle := cfg.MaxIdleConns
	if maxIdle == 0 {
		maxIdle = 10
	}
	lifetime := cfg.ConnMaxLifetime
	if lifetime == 0 {
		lifetime = 60 * time.Minute
	}

	sqlDB.SetMaxOpenConns(maxOpen)
	sqlDB.SetMaxIdleConns(maxIdle)
	sqlDB.SetConnMaxLifetime(lifetime)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("postgres: ping failed: %w", err)
	}

	return &DB{db}, nil
}

// Ping checks the database connectivity. Use in health checks.
func (db *DB) Ping() error {
	sqlDB, err := db.DB.DB()
	if err != nil {
		return fmt.Errorf("postgres: cannot get sql.DB: %w", err)
	}
	return sqlDB.Ping()
}

// Close gracefully closes the connection pool.
func (db *DB) Close() error {
	sqlDB, err := db.DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
