// Package response provides a unified JSON response envelope for all MES API endpoints.
// Every handler must return responses through this package to ensure consistency.
package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Envelope is the standard API response body.
type Envelope struct {
	Success    bool        `json:"success"`
	Data       any         `json:"data,omitempty"`
	Error      *APIError   `json:"error,omitempty"`
	Pagination *Pagination `json:"pagination,omitempty"`
	TraceID    string      `json:"trace_id,omitempty"`
	RequestID  string      `json:"request_id,omitempty"`
}

// APIError carries a machine-readable code and a human-readable message.
type APIError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details []FieldError   `json:"details,omitempty"`
}

// FieldError represents a validation error on a specific field.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Pagination holds page metadata returned alongside list responses.
type Pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	TotalItems int64 `json:"total_items"`
	TotalPages int   `json:"total_pages"`
}

// ─── Success Helpers ───────────────────────────────────────────────────────────

// OK returns HTTP 200 with the given data payload.
func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, envelope(c, true, data, nil, nil))
}

// Created returns HTTP 201 with the created resource.
func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, envelope(c, true, data, nil, nil))
}

// NoContent returns HTTP 204 with no body.
func NoContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

// List returns HTTP 200 with data and pagination metadata.
func List(c *gin.Context, data any, page, pageSize int, total int64) {
	totalPages := int(total) / pageSize
	if int(total)%pageSize != 0 {
		totalPages++
	}
	p := &Pagination{
		Page:       page,
		PageSize:   pageSize,
		TotalItems: total,
		TotalPages: totalPages,
	}
	c.JSON(http.StatusOK, envelope(c, true, data, nil, p))
}

// ─── Error Helpers ─────────────────────────────────────────────────────────────

// BadRequest returns HTTP 400 with validation error details.
func BadRequest(c *gin.Context, code, msg string, details ...FieldError) {
	apiErr := &APIError{Code: code, Message: msg, Details: details}
	c.JSON(http.StatusBadRequest, envelope(c, false, nil, apiErr, nil))
}

// Unauthorized returns HTTP 401.
func Unauthorized(c *gin.Context, msg string) {
	c.JSON(http.StatusUnauthorized, envelope(c, false, nil, &APIError{
		Code: "UNAUTHORIZED", Message: msg,
	}, nil))
}

// Forbidden returns HTTP 403.
func Forbidden(c *gin.Context, msg string) {
	c.JSON(http.StatusForbidden, envelope(c, false, nil, &APIError{
		Code: "FORBIDDEN", Message: msg,
	}, nil))
}

// NotFound returns HTTP 404.
func NotFound(c *gin.Context, resource string) {
	c.JSON(http.StatusNotFound, envelope(c, false, nil, &APIError{
		Code: "NOT_FOUND", Message: resource + " not found",
	}, nil))
}

// Conflict returns HTTP 409 for duplicate resource errors.
func Conflict(c *gin.Context, msg string) {
	c.JSON(http.StatusConflict, envelope(c, false, nil, &APIError{
		Code: "CONFLICT", Message: msg,
	}, nil))
}

// UnprocessableEntity returns HTTP 422 for business rule violations.
func UnprocessableEntity(c *gin.Context, code, msg string) {
	c.JSON(http.StatusUnprocessableEntity, envelope(c, false, nil, &APIError{
		Code: code, Message: msg,
	}, nil))
}

// TooManyRequests returns HTTP 429 for rate limit violations.
func TooManyRequests(c *gin.Context) {
	c.JSON(http.StatusTooManyRequests, envelope(c, false, nil, &APIError{
		Code: "RATE_LIMITED", Message: "too many requests, please slow down",
	}, nil))
}

// InternalServerError returns HTTP 500. Never expose internal error details in production.
func InternalServerError(c *gin.Context, traceID string) {
	c.JSON(http.StatusInternalServerError, envelope(c, false, nil, &APIError{
		Code:    "INTERNAL_ERROR",
		Message: "an unexpected error occurred, please contact support (trace_id: " + traceID + ")",
	}, nil))
}

// ─── Private ──────────────────────────────────────────────────────────────────

func envelope(c *gin.Context, success bool, data any, err *APIError, pagination *Pagination) Envelope {
	env := Envelope{
		Success:    success,
		Data:       data,
		Error:      err,
		Pagination: pagination,
	}
	if traceID, ok := c.Get("trace_id"); ok {
		env.TraceID, _ = traceID.(string)
	}
	if requestID, ok := c.Get("request_id"); ok {
		env.RequestID, _ = requestID.(string)
	}
	return env
}
