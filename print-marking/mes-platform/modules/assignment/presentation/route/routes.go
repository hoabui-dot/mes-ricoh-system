package route

import (
	"github.com/gin-gonic/gin"
	"github.com/nd/mes-platform/modules/assignment/presentation/handler"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/shared/middleware"
)

func Register(
	router *gin.RouterGroup,
	h *handler.AssignmentHandler,
	jwtManager *jwt.Manager,
) {
	protected := router.Group("").Use(middleware.Authenticate(jwtManager))

	// Propose & List
	protected.POST("/assignments/propose", h.ProposeAssignment)
	protected.GET("/assignments", h.ListAssignments)
	protected.GET("/assignments/history", h.GetAssignmentHistory) // before :id to avoid conflict
	protected.GET("/assignments/:id", h.GetAssignment)

	// Manager review actions
	protected.PATCH("/assignments/:id/approve", h.ApproveAssignment)
	protected.PATCH("/assignments/:id/reject", h.RejectAssignment)
	protected.POST("/assignments/:id/override", h.OverrideAssignment)
}
