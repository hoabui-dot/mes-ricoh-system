// Package pagination provides reusable offset-based pagination helpers
// for MES API list endpoints.
package pagination

import (
	"math"
	"strconv"

	"github.com/gin-gonic/gin"
)

const (
	defaultPage     = 1
	defaultPageSize = 20
	maxPageSize     = 100
)

// Params holds parsed pagination query parameters.
type Params struct {
	Page     int
	PageSize int
}

// Offset returns the database offset for the current page.
func (p Params) Offset() int {
	return (p.Page - 1) * p.PageSize
}

// Limit returns the database limit (alias for PageSize).
func (p Params) Limit() int {
	return p.PageSize
}

// TotalPages calculates the total number of pages for a given total item count.
func (p Params) TotalPages(totalItems int64) int {
	if p.PageSize == 0 {
		return 0
	}
	return int(math.Ceil(float64(totalItems) / float64(p.PageSize)))
}

// FromContext extracts and validates pagination parameters from a Gin context.
// Falls back to sensible defaults when parameters are missing or invalid.
func FromContext(c *gin.Context) Params {
	page := parseIntOr(c.Query("page"), defaultPage)
	pageSize := parseIntOr(c.Query("page_size"), defaultPageSize)

	if page < 1 {
		page = defaultPage
	}
	if pageSize < 1 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}

	return Params{Page: page, PageSize: pageSize}
}

func parseIntOr(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return n
}
