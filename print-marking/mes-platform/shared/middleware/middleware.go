// Package middleware provides Gin middleware for the MES Platform.
// All middleware functions are pure — no global state, no side effects outside the request context.
package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/response"
	"go.uber.org/zap"
)

// ─── Request Tracing ──────────────────────────────────────────────────────────

// Tracing injects a unique RequestID and TraceID into every request context.
// Downstream handlers and middleware read these values from c.Get("trace_id") etc.
func Tracing() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = uuid.NewString()
		}
		traceID := c.GetHeader("X-Trace-ID")
		if traceID == "" {
			traceID = uuid.NewString()
		}
		correlationID := c.GetHeader("X-Correlation-ID")
		if correlationID == "" {
			correlationID = uuid.NewString()
		}

		c.Set("request_id", requestID)
		c.Set("trace_id", traceID)
		c.Set("correlation_id", correlationID)

		c.Header("X-Request-ID", requestID)
		c.Header("X-Trace-ID", traceID)
		c.Header("X-Correlation-ID", correlationID)

		c.Next()
	}
}

// ─── Structured Request Logging ───────────────────────────────────────────────

// RequestLogger logs every HTTP request with structured Zap fields.
// Log includes: method, path, status, latency, client IP, request/trace IDs.
func RequestLogger(log *logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery
		if raw != "" {
			path += "?" + raw
		}

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		fields := []zap.Field{
			zap.String("method", c.Request.Method),
			zap.String("path", path),
			zap.Int("status", status),
			zap.Duration("latency", latency),
			zap.String("client_ip", c.ClientIP()),
		}

		if rid, ok := c.Get("request_id"); ok {
			fields = append(fields, logger.RequestID(rid.(string)))
		}
		if tid, ok := c.Get("trace_id"); ok {
			fields = append(fields, logger.TraceID(tid.(string)))
		}

		switch {
		case status >= http.StatusInternalServerError:
			log.Error("HTTP request", fields...)
		case status >= http.StatusBadRequest:
			log.Warn("HTTP request", fields...)
		default:
			log.Info("HTTP request", fields...)
		}
	}
}

// ─── JWT Authentication ───────────────────────────────────────────────────────

// Authenticate validates the Bearer JWT token and injects Claims into the context.
// On failure it aborts with 401. Protected routes must call this middleware.
func Authenticate(jwtManager *jwt.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			response.Unauthorized(c, "authorization header is required")
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			response.Unauthorized(c, "invalid authorization header format, expected: Bearer <token>")
			c.Abort()
			return
		}

		claims, err := jwtManager.ValidateClaims(parts[1])
		if err != nil {
			response.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}

		c.Set("user_id", claims.UserID.String())
		c.Set("username", claims.Username)
		c.Set("email", claims.Email)
		c.Next()
	}
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

// Recovery catches panics and returns a structured 500 response instead of crashing.
func Recovery(log *logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				traceID := ""
				if tid, ok := c.Get("trace_id"); ok {
					traceID = tid.(string)
				}
				log.Error("panic recovered",
					zap.Any("error", err),
					logger.TraceID(traceID),
					zap.String("path", c.Request.URL.Path),
				)
				response.InternalServerError(c, traceID)
				c.Abort()
			}
		}()
		c.Next()
	}
}
