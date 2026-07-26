package route

import (
	"github.com/gin-gonic/gin"
	"github.com/nd/mes-platform/modules/audit/presentation/handler"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/shared/middleware"
)

func Register(
	router *gin.RouterGroup,
	h *handler.AuditHandler,
	jwtManager *jwt.Manager,
) {
	protected := router.Group("").Use(middleware.Authenticate(jwtManager))

	// Audit Logs Retrieval
	protected.GET("/audit/logs", h.GetAuditLogs)
	protected.GET("/audit/logs/:id", h.GetAuditLogByID)
}
