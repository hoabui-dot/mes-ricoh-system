// Package logger provides a structured, leveled logger built on Zap.
// All services must use this logger rather than the standard library log package.
// The logger supports request-scoped fields via context propagation.
package logger

import (
	"context"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// contextKey is an unexported type for logger context keys to avoid collisions.
type contextKey struct{}

// Logger wraps zap.Logger to provide context-aware logging.
type Logger struct {
	zap *zap.Logger
}

// New creates a new Logger with the given log level and format.
// level: "debug", "info", "warn", "error"
// format: "json" or "console"
func New(level, format string) (*Logger, error) {
	lvl, err := zapcore.ParseLevel(level)
	if err != nil {
		lvl = zapcore.InfoLevel
	}

	var cfg zap.Config
	if format == "console" {
		cfg = zap.NewDevelopmentConfig()
		cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	} else {
		cfg = zap.NewProductionConfig()
	}
	cfg.Level = zap.NewAtomicLevelAt(lvl)

	zapLogger, err := cfg.Build(
		zap.AddCallerSkip(1),
		zap.AddStacktrace(zapcore.ErrorLevel),
	)
	if err != nil {
		return nil, err
	}

	return &Logger{zap: zapLogger}, nil
}

// NewNop returns a no-op logger suitable for tests.
func NewNop() *Logger {
	return &Logger{zap: zap.NewNop()}
}

// WithContext returns a logger enriched with context-propagated fields.
func (l *Logger) WithContext(ctx context.Context) *Logger {
	fields := fieldsFromContext(ctx)
	if len(fields) == 0 {
		return l
	}
	return &Logger{zap: l.zap.With(fields...)}
}

// With returns a logger with additional fields attached.
func (l *Logger) With(fields ...zap.Field) *Logger {
	return &Logger{zap: l.zap.With(fields...)}
}

// Debug logs a message at debug level.
func (l *Logger) Debug(msg string, fields ...zap.Field) {
	l.zap.Debug(msg, fields...)
}

// Info logs a message at info level.
func (l *Logger) Info(msg string, fields ...zap.Field) {
	l.zap.Info(msg, fields...)
}

// Warn logs a message at warn level.
func (l *Logger) Warn(msg string, fields ...zap.Field) {
	l.zap.Warn(msg, fields...)
}

// Error logs a message at error level.
func (l *Logger) Error(msg string, fields ...zap.Field) {
	l.zap.Error(msg, fields...)
}

// Fatal logs a message at fatal level and calls os.Exit(1).
func (l *Logger) Fatal(msg string, fields ...zap.Field) {
	l.zap.Fatal(msg, fields...)
}

// Sync flushes any buffered log entries. Defer this on application shutdown.
func (l *Logger) Sync() error {
	return l.zap.Sync()
}

// Zap returns the underlying zap.Logger for interoperability with libraries.
func (l *Logger) Zap() *zap.Logger {
	return l.zap
}

// ─── Context Integration ───────────────────────────────────────────────────────

// ctxFields stores zap.Fields inside the context.
type ctxFields []zap.Field

// WithFields enriches the context with structured log fields.
// Use this in middleware to attach request-scoped identifiers.
func WithFields(ctx context.Context, fields ...zap.Field) context.Context {
	existing, _ := ctx.Value(contextKey{}).(ctxFields)
	merged := make(ctxFields, len(existing)+len(fields))
	copy(merged, existing)
	copy(merged[len(existing):], fields)
	return context.WithValue(ctx, contextKey{}, merged)
}

// fieldsFromContext extracts zap.Fields stored in the context.
func fieldsFromContext(ctx context.Context) []zap.Field {
	if ctx == nil {
		return nil
	}
	fields, _ := ctx.Value(contextKey{}).(ctxFields)
	return fields
}

// ─── Field Constructors (thin wrappers for common MES fields) ─────────────────

// TraceID returns a zap.Field for the distributed trace ID.
func TraceID(id string) zap.Field { return zap.String("trace_id", id) }

// CorrelationID returns a zap.Field for the correlation ID.
func CorrelationID(id string) zap.Field { return zap.String("correlation_id", id) }

// RequestID returns a zap.Field for the HTTP request ID.
func RequestID(id string) zap.Field { return zap.String("request_id", id) }

// UserID returns a zap.Field for the authenticated user ID.
func UserID(id string) zap.Field { return zap.String("user_id", id) }

// Module returns a zap.Field identifying the module emitting the log.
func Module(name string) zap.Field { return zap.String("module", name) }

// Err returns a zap.Field for an error.
func Err(err error) zap.Field { return zap.Error(err) }
