package route

import (
	"github.com/gin-gonic/gin"
	"github.com/nd/mes-platform/modules/production/presentation/handler"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/shared/middleware"
)

func Register(
	router *gin.RouterGroup,
	h *handler.ProductionHandler,
	wfH *handler.WorkflowHandler,
	jwtManager *jwt.Manager,
) {
	protected := router.Group("").Use(middleware.Authenticate(jwtManager))

	// Workflows
	protected.POST("/workflows", wfH.CreateWorkflow)
	protected.PUT("/workflows/:id", wfH.UpdateWorkflow)
	protected.GET("/workflows/:id", wfH.GetWorkflow)
	protected.GET("/workflows", wfH.SearchWorkflows)
	protected.POST("/workflows/:id/clone", wfH.CloneWorkflow)
	protected.POST("/workflows/:id/publish", wfH.PublishWorkflow)
	protected.POST("/workflows/:id/archive", wfH.ArchiveWorkflow)
	protected.POST("/workflows/:id/validate", wfH.ValidateWorkflow)

	// Workflow Operations
	protected.POST("/workflows/:id/operations", wfH.AddOperation)
	protected.PUT("/workflows/:id/operations/:opId", wfH.UpdateOperation)
	protected.DELETE("/workflows/:id/operations/:opId", wfH.RemoveOperation)
	protected.POST("/workflows/:id/operations/:opId/move", wfH.MoveOperation)

	// Routings
	protected.POST("/routings", h.CreateRouting)
	protected.GET("/routings", h.ListRoutings)
	protected.GET("/routings/:id", h.GetRouting)

	// Production Orders
	protected.POST("/production-orders", h.CreateProductionOrder)
	protected.GET("/production-orders", h.ListProductionOrders)
	protected.GET("/production-orders/:id", h.GetProductionOrder)
	protected.PATCH("/production-orders/:id/release", h.ReleaseProductionOrder)
	protected.PATCH("/production-orders/:id/cancel", h.CancelProductionOrder)
	protected.PATCH("/production-orders/:id/priority", h.UpdatePriority)
	protected.POST("/production-orders/:id/dispatch-plans", h.CreateDispatchPlan)
	protected.GET("/production-orders/:id/dispatch-plans", h.ListDispatchPlans)

	// Dispatch Plans
	protected.POST("/dispatch-plans/:id/generate-work-orders", h.GenerateWorkOrders)

	// Work Orders
	protected.POST("/work-orders", h.CreateWorkOrder)
	protected.GET("/work-orders", h.ListWorkOrders)
	protected.GET("/work-orders/:id", h.GetWorkOrder)
	protected.POST("/work-orders/bulk-dispatch", h.BulkDispatchWorkOrders)
	protected.POST("/work-orders/:id/dispatch", h.DispatchWorkOrder)
	protected.POST("/work-orders/:id/cancel", h.CancelWorkOrder)
	protected.POST("/work-orders/:id/pause", h.PauseWorkOrder)
	protected.POST("/work-orders/:id/resume", h.ResumeWorkOrder)

	// Integration endpoints (unauthenticated for SSE/Webhooks simplicity)
	router.POST("/production/gateway/events", h.ProcessGatewayEvent)
	router.GET("/production-orders/:id/stream", h.StreamProductionOrder)
	router.GET("/work-orders/stream", h.StreamWorkOrders)
}
