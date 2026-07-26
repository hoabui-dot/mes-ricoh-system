package route

import (
	"github.com/gin-gonic/gin"
	"github.com/nd/mes-platform/modules/planning/presentation/handler"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/shared/middleware"
)

func Register(
	router *gin.RouterGroup,
	h *handler.PlanningHandler,
	jwtManager *jwt.Manager,
) {
	// All planning endpoints require a valid JWT token and use /planning prefix
	protected := router.Group("/planning").Use(middleware.Authenticate(jwtManager))

	// Shift Templates
	protected.POST("/shift-templates", h.CreateShiftTemplate)
	protected.GET("/shift-templates", h.ListShiftTemplates)
	protected.PUT("/shift-templates/:id", h.UpdateShiftTemplate)
	protected.DELETE("/shift-templates/:id", h.DeleteShiftTemplate)

	// Daily Shift Plans
	protected.POST("/shifts", h.CreateShift)
	protected.GET("/shifts", h.ListShifts)
	protected.POST("/shifts/:id/teams", h.AssignTeamToShift)
	protected.POST("/shifts/:id/workers", h.AssignWorkerToShift)
	protected.DELETE("/shifts/:id/workers/:workerId", h.RemoveWorkerSchedule)

	// Calendar generation & grid
	protected.POST("/calendar/generate", h.GenerateCalendar)
	protected.GET("/calendar/grid", h.GetScheduleGrid)
	protected.POST("/calendar/assign-team", h.AssignTeamSchedule)

	// Workers Availability
	protected.GET("/workers/availability", h.GetWorkersAvailability)

	// Holidays catalog
	protected.POST("/holidays", h.CreateHoliday)
	protected.GET("/holidays", h.ListHolidays)

	// Leave requests
	protected.POST("/leaves", h.RequestLeave)
	protected.PATCH("/leaves/:id/approve", h.ApproveLeave)
	protected.PATCH("/leaves/:id/reject", h.RejectLeave)
	protected.GET("/leaves", h.ListLeaves)

	// Overtime requests
	protected.POST("/overtimes", h.RequestOvertime)
	protected.PATCH("/overtimes/:id/approve", h.ApproveOvertime)
	protected.PATCH("/overtimes/:id/reject", h.RejectOvertime)
	protected.GET("/overtimes", h.ListOvertimes)
}
