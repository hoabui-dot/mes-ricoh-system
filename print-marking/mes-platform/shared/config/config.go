// Package config loads MES Platform configuration from environment variables
// and optional .env files using Viper. All configuration is strongly typed
// and validated at startup — never use raw env lookups in application code.
package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config is the root configuration structure for the MES Platform.
// It is built once at startup and injected wherever needed.
type Config struct {
	App       AppConfig
	Database  DatabaseConfig
	Redis     RedisConfig
	RabbitMQ  RabbitMQConfig
	JWT       JWTConfig
	Casbin    CasbinConfig
	Log       LogConfig
	Metrics   MetricsConfig
	OTEL      OTELConfig
	Outbox    OutboxConfig
	RateLimit RateLimitConfig
	Password  PasswordPolicyConfig
	CORS      CORSConfig
	Gateway   GatewayConfig
}

type GatewayConfig struct {
	URL string
}

// AppConfig holds general application settings.
type AppConfig struct {
	Name     string
	Env      string
	Port     int
	Host     string
	Timezone string
}

// DatabaseConfig holds PostgreSQL connection settings.
type DatabaseConfig struct {
	Host            string
	Port            int
	User            string
	Password        string
	DBName          string
	SSLMode         string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

// RedisConfig holds Redis connection settings.
type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
	PoolSize int
}

// RabbitMQConfig holds RabbitMQ connection settings.
type RabbitMQConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	VHost    string
	Exchange string
}

// JWTConfig holds JWT token settings.
type JWTConfig struct {
	Secret              string
	AccessExpiryMinutes int
	RefreshExpiryDays   int
	Issuer              string
	Audience            string
}

// CasbinConfig holds Casbin RBAC settings.
type CasbinConfig struct {
	ModelPath string
}

// LogConfig holds logging settings.
type LogConfig struct {
	Level  string
	Format string
}

// MetricsConfig holds Prometheus metrics settings.
type MetricsConfig struct {
	Enabled bool
	Path    string
}

// OTELConfig holds OpenTelemetry settings.
type OTELConfig struct {
	Enabled          bool
	ExporterEndpoint string
}

// OutboxConfig holds outbox worker settings.
type OutboxConfig struct {
	PollIntervalSeconds int
	BatchSize           int
}

// RateLimitConfig holds rate limiting settings.
type RateLimitConfig struct {
	RequestsPerMinute     int
	AuthRequestsPerMinute int
}

// PasswordPolicyConfig holds password complexity requirements.
type PasswordPolicyConfig struct {
	MinLength        int
	RequireUppercase bool
	RequireLowercase bool
	RequireNumber    bool
	RequireSpecial   bool
	ResetTokenExpiry time.Duration
}

// CORSConfig holds CORS allowed origins.
type CORSConfig struct {
	AllowedOrigins []string
}

// Load reads configuration from environment variables and an optional .env file.
// Call this exactly once at application startup.
func Load() (*Config, error) {
	v := viper.New()

	// Read from environment variables.
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Attempt to read .env file (not mandatory — Docker will inject env vars directly).
	v.SetConfigFile(".env")
	v.SetConfigType("env")
	_ = v.ReadInConfig() // Ignore error — file is optional in production.

	setDefaults(v)

	cfg := &Config{}
	if err := bind(v, cfg); err != nil {
		return nil, fmt.Errorf("config: binding failed: %w", err)
	}

	if err := validate(cfg); err != nil {
		return nil, fmt.Errorf("config: validation failed: %w", err)
	}

	return cfg, nil
}

// setDefaults applies safe default values for all optional settings.
func setDefaults(v *viper.Viper) {
	v.SetDefault("APP_NAME", "mes-platform")
	v.SetDefault("APP_ENV", "production")
	v.SetDefault("APP_PORT", 8080)
	v.SetDefault("APP_HOST", "0.0.0.0")
	v.SetDefault("APP_TIMEZONE", "UTC")

	v.SetDefault("DB_HOST", "localhost")
	v.SetDefault("DB_PORT", 5432)
	v.SetDefault("DB_SSL_MODE", "disable")
	v.SetDefault("DB_MAX_OPEN_CONNS", 25)
	v.SetDefault("DB_MAX_IDLE_CONNS", 10)
	v.SetDefault("DB_CONN_MAX_LIFETIME_MINUTES", 60)

	v.SetDefault("REDIS_HOST", "localhost")
	v.SetDefault("REDIS_PORT", 6379)
	v.SetDefault("REDIS_DB", 0)
	v.SetDefault("REDIS_POOL_SIZE", 10)

	v.SetDefault("RABBITMQ_HOST", "localhost")
	v.SetDefault("RABBITMQ_PORT", 5672)
	v.SetDefault("RABBITMQ_USER", "guest")
	v.SetDefault("RABBITMQ_PASSWORD", "guest")
	v.SetDefault("RABBITMQ_VHOST", "/")
	v.SetDefault("RABBITMQ_EXCHANGE", "mes.events")

	v.SetDefault("JWT_ACCESS_EXPIRY_MINUTES", 15)
	v.SetDefault("JWT_REFRESH_EXPIRY_DAYS", 30)
	v.SetDefault("JWT_ISSUER", "mes-platform")
	v.SetDefault("JWT_AUDIENCE", "mes-users")

	v.SetDefault("CASBIN_MODEL_PATH", "./configs/casbin_model.conf")

	v.SetDefault("LOG_LEVEL", "info")
	v.SetDefault("LOG_FORMAT", "json")

	v.SetDefault("METRICS_ENABLED", true)
	v.SetDefault("METRICS_PATH", "/metrics")

	v.SetDefault("OTEL_ENABLED", false)

	v.SetDefault("OUTBOX_POLL_INTERVAL_SECONDS", 5)
	v.SetDefault("OUTBOX_BATCH_SIZE", 100)

	v.SetDefault("RATE_LIMIT_REQUESTS_PER_MINUTE", 60)
	v.SetDefault("RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE", 10)

	v.SetDefault("PASSWORD_MIN_LENGTH", 8)
	v.SetDefault("PASSWORD_REQUIRE_UPPERCASE", true)
	v.SetDefault("PASSWORD_REQUIRE_LOWERCASE", true)
	v.SetDefault("PASSWORD_REQUIRE_NUMBER", true)
	v.SetDefault("PASSWORD_REQUIRE_SPECIAL", false)
	v.SetDefault("PASSWORD_RESET_TOKEN_EXPIRY_MINUTES", 30)

	v.SetDefault("CORS_ALLOWED_ORIGINS", "http://localhost:3100")
	v.SetDefault("GATEWAY_URL", "http://localhost:5008")
}

// bind maps Viper keys to the typed Config struct.
func bind(v *viper.Viper, cfg *Config) error {
	cfg.App = AppConfig{
		Name:     v.GetString("APP_NAME"),
		Env:      v.GetString("APP_ENV"),
		Port:     v.GetInt("APP_PORT"),
		Host:     v.GetString("APP_HOST"),
		Timezone: v.GetString("APP_TIMEZONE"),
	}

	cfg.Database = DatabaseConfig{
		Host:            v.GetString("DB_HOST"),
		Port:            v.GetInt("DB_PORT"),
		User:            v.GetString("DB_USER"),
		Password:        v.GetString("DB_PASSWORD"),
		DBName:          v.GetString("DB_NAME"),
		SSLMode:         v.GetString("DB_SSL_MODE"),
		MaxOpenConns:    v.GetInt("DB_MAX_OPEN_CONNS"),
		MaxIdleConns:    v.GetInt("DB_MAX_IDLE_CONNS"),
		ConnMaxLifetime: time.Duration(v.GetInt("DB_CONN_MAX_LIFETIME_MINUTES")) * time.Minute,
	}

	cfg.Redis = RedisConfig{
		Host:     v.GetString("REDIS_HOST"),
		Port:     v.GetInt("REDIS_PORT"),
		Password: v.GetString("REDIS_PASSWORD"),
		DB:       v.GetInt("REDIS_DB"),
		PoolSize: v.GetInt("REDIS_POOL_SIZE"),
	}

	cfg.RabbitMQ = RabbitMQConfig{
		Host:     v.GetString("RABBITMQ_HOST"),
		Port:     v.GetInt("RABBITMQ_PORT"),
		User:     v.GetString("RABBITMQ_USER"),
		Password: v.GetString("RABBITMQ_PASSWORD"),
		VHost:    v.GetString("RABBITMQ_VHOST"),
		Exchange: v.GetString("RABBITMQ_EXCHANGE"),
	}

	cfg.JWT = JWTConfig{
		Secret:              v.GetString("JWT_SECRET"),
		AccessExpiryMinutes: v.GetInt("JWT_ACCESS_EXPIRY_MINUTES"),
		RefreshExpiryDays:   v.GetInt("JWT_REFRESH_EXPIRY_DAYS"),
		Issuer:              v.GetString("JWT_ISSUER"),
		Audience:            v.GetString("JWT_AUDIENCE"),
	}

	cfg.Casbin = CasbinConfig{
		ModelPath: v.GetString("CASBIN_MODEL_PATH"),
	}

	cfg.Log = LogConfig{
		Level:  v.GetString("LOG_LEVEL"),
		Format: v.GetString("LOG_FORMAT"),
	}

	cfg.Metrics = MetricsConfig{
		Enabled: v.GetBool("METRICS_ENABLED"),
		Path:    v.GetString("METRICS_PATH"),
	}

	cfg.OTEL = OTELConfig{
		Enabled:          v.GetBool("OTEL_ENABLED"),
		ExporterEndpoint: v.GetString("OTEL_EXPORTER_OTLP_ENDPOINT"),
	}

	cfg.Outbox = OutboxConfig{
		PollIntervalSeconds: v.GetInt("OUTBOX_POLL_INTERVAL_SECONDS"),
		BatchSize:           v.GetInt("OUTBOX_BATCH_SIZE"),
	}

	cfg.RateLimit = RateLimitConfig{
		RequestsPerMinute:     v.GetInt("RATE_LIMIT_REQUESTS_PER_MINUTE"),
		AuthRequestsPerMinute: v.GetInt("RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE"),
	}

	resetExpiry := time.Duration(v.GetInt("PASSWORD_RESET_TOKEN_EXPIRY_MINUTES")) * time.Minute
	cfg.Password = PasswordPolicyConfig{
		MinLength:        v.GetInt("PASSWORD_MIN_LENGTH"),
		RequireUppercase: v.GetBool("PASSWORD_REQUIRE_UPPERCASE"),
		RequireLowercase: v.GetBool("PASSWORD_REQUIRE_LOWERCASE"),
		RequireNumber:    v.GetBool("PASSWORD_REQUIRE_NUMBER"),
		RequireSpecial:   v.GetBool("PASSWORD_REQUIRE_SPECIAL"),
		ResetTokenExpiry: resetExpiry,
	}

	allowedOrigins := strings.Split(v.GetString("CORS_ALLOWED_ORIGINS"), ",")
	cfg.CORS = CORSConfig{
		AllowedOrigins: allowedOrigins,
	}

	cfg.Gateway = GatewayConfig{
		URL: v.GetString("GATEWAY_URL"),
	}

	return nil
}

// validate ensures required fields are present.
func validate(cfg *Config) error {
	if cfg.Database.User == "" {
		return fmt.Errorf("DB_USER is required")
	}
	if cfg.Database.Password == "" {
		return fmt.Errorf("DB_PASSWORD is required")
	}
	if cfg.Database.DBName == "" {
		return fmt.Errorf("DB_NAME is required")
	}
	if cfg.JWT.Secret == "" {
		return fmt.Errorf("JWT_SECRET is required")
	}
	if len(cfg.JWT.Secret) < 32 {
		return fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}
	return nil
}
