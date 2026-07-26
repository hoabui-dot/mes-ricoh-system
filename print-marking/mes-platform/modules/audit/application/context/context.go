package context

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type contextKey string

const (
	TraceKey       contextKey = "trace_id"
	CorrelationKey contextKey = "correlation_id"
	UserKey        contextKey = "user_id"
)

// ToGoContext maps Gin context variables into Go context values so GORM can read them.
func ToGoContext(c *gin.Context) context.Context {
	ctx := c.Request.Context()

	if traceID := c.GetString("trace_id"); traceID != "" {
		ctx = context.WithValue(ctx, TraceKey, traceID)
	}
	if correlationID := c.GetString("correlation_id"); correlationID != "" {
		ctx = context.WithValue(ctx, CorrelationKey, correlationID)
	}
	if userIDStr := c.GetString("user_id"); userIDStr != "" {
		if u, err := uuid.Parse(userIDStr); err == nil {
			ctx = context.WithValue(ctx, UserKey, u)
		}
	}

	return ctx
}

func GetTraceID(ctx context.Context) string {
	if val, ok := ctx.Value(TraceKey).(string); ok {
		return val
	}
	return ""
}

func GetCorrelationID(ctx context.Context) string {
	if val, ok := ctx.Value(CorrelationKey).(string); ok {
		return val
	}
	return ""
}

func GetUserID(ctx context.Context) *uuid.UUID {
	if val, ok := ctx.Value(UserKey).(uuid.UUID); ok {
		return &val
	}
	return nil
}
