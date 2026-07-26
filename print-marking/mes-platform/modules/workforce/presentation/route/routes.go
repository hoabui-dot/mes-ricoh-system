package route

import (
	"github.com/gin-gonic/gin"
	"github.com/nd/mes-platform/modules/workforce/presentation/handler"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/shared/middleware"
)

func Register(
	router *gin.RouterGroup,
	h *handler.WorkforceHandler,
	jwtManager *jwt.Manager,
) {
	// All workforce routes require authentication
	protected := router.Group("").Use(middleware.Authenticate(jwtManager))

	// Org Tree Routes
	protected.POST("/departments", h.CreateDepartment)
	protected.GET("/departments", h.ListDepartments)
	protected.GET("/departments/:id", h.GetDepartment)
	protected.PUT("/departments/:id", h.UpdateDepartment)
	protected.DELETE("/departments/:id", h.DeleteDepartment)

	protected.POST("/departments/:id/workshops", h.CreateWorkshop)
	protected.GET("/workshops", h.ListWorkshops)
	protected.GET("/workshops/:id", h.GetWorkshop)
	protected.PUT("/workshops/:id", h.UpdateWorkshop)
	protected.DELETE("/workshops/:id", h.DeleteWorkshop)

	protected.POST("/workshops/:id/teams", h.CreateTeam)
	protected.GET("/teams", h.ListTeams)
	protected.GET("/teams/:id", h.GetTeam)
	protected.PUT("/teams/:id", h.UpdateTeam)
	protected.DELETE("/teams/:id", h.DeleteTeam)

	// Skill catalog Routes
	protected.POST("/skills", h.CreateSkill)
	protected.GET("/skills", h.ListSkills)
	protected.PUT("/skills/:id", h.UpdateSkill)
	protected.DELETE("/skills/:id", h.DeleteSkill)

	// Worker CRUD & Actions Routes
	protected.POST("/workers", h.CreateWorker)
	protected.GET("/workers", h.ListWorkers)
	protected.GET("/workers/:id", h.GetWorker)
	protected.PUT("/workers/:id", h.UpdateWorker)
	protected.DELETE("/workers/:id", h.DeleteWorker)
	protected.PATCH("/workers/:id/restore", h.RestoreWorker)
	protected.PATCH("/workers/:id/availability", h.UpdateAvailability)

	// Worker Skills & Certificates
	protected.PUT("/workers/:id/skills", h.UpdateWorkerSkills)
	protected.POST("/workers/:id/certificates", h.AddCertificate)
	protected.GET("/workers/:id/certificates", h.ListWorkerCertificates)
}
