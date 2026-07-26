package route

import (
	"github.com/gin-gonic/gin"
	"github.com/nd/mes-platform/modules/notification/presentation/handler"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/shared/middleware"
)

func Register(
	router *gin.RouterGroup,
	h *handler.NotificationHandler,
	jwtManager *jwt.Manager,
) {
	protected := router.Group("").Use(middleware.Authenticate(jwtManager))

	// Alert Center Endpoints
	protected.GET("/alerts", h.ListAlerts)
	protected.PATCH("/alerts/:id/read", h.MarkRead)
	protected.POST("/alerts/read-all", h.MarkAllRead) // Using POST or PATCH (standard is POST/PATCH, let's register both or just matching what's standard)
}
