package route

import (
	"github.com/gin-gonic/gin"
	"github.com/nd/mes-platform/modules/projection/presentation/handler"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/shared/middleware"
)

func Register(
	router *gin.RouterGroup,
	h *handler.ProjectionHandler,
	jwtManager *jwt.Manager,
) {
	protected := router.Group("").Use(middleware.Authenticate(jwtManager))

	// Dashboard read endpoints
	protected.GET("/dashboard", h.GetDashboard)
	protected.POST("/dashboard/refresh", h.RefreshDashboard)

	// Statistics
	protected.GET("/dashboard/stats/orders", h.GetOrderStats)
	protected.GET("/dashboard/stats/workers", h.GetTopWorkers)

	// Real-time SSE stream (client connects and holds open)
	protected.GET("/dashboard/stream", h.StreamDashboard)
}
