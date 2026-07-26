package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/production/application/dto"
	"github.com/nd/mes-platform/modules/production/application/service"
	"github.com/nd/mes-platform/modules/production/domain/repository"
	"github.com/nd/mes-platform/shared/pagination"
	"github.com/nd/mes-platform/shared/response"
)

type ProductionHandler struct {
	svc *service.ProductionService
}

func NewProductionHandler(svc *service.ProductionService) *ProductionHandler {
	return &ProductionHandler{svc: svc}
}

// ─── Routing Endpoints ────────────────────────────────────────────────────────

func (h *ProductionHandler) CreateRouting(c *gin.Context) {
	var req dto.CreateRoutingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}
	r, err := h.svc.CreateRouting(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.Created(c, r)
}

func (h *ProductionHandler) ListRoutings(c *gin.Context) {
	routings, err := h.svc.ListRoutings(c.Request.Context())
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, routings)
}

func (h *ProductionHandler) GetRouting(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid routing ID format")
		return
	}
	r, err := h.svc.GetRouting(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "routing")
		return
	}
	response.OK(c, r)
}

// ─── Production Order Endpoints ───────────────────────────────────────────────

func (h *ProductionHandler) CreateProductionOrder(c *gin.Context) {
	var req dto.CreateProductionOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}
	order, err := h.svc.CreateProductionOrder(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrConflict) {
			response.Conflict(c, err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.Created(c, order)
}

func (h *ProductionHandler) GetProductionOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid production order ID format")
		return
	}
	order, err := h.svc.GetProductionOrder(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "production order")
		return
	}
	response.OK(c, order)
}

func (h *ProductionHandler) ListProductionOrders(c *gin.Context) {
	p := pagination.FromContext(c)
	filter := repository.ProductionOrderFilter{
		Status:   c.Query("status"),
		Page:     p.Page,
		PageSize: p.PageSize,
	}
	orders, total, err := h.svc.ListProductionOrders(c.Request.Context(), filter)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.List(c, orders, p.Page, p.PageSize, total)
}

func (h *ProductionHandler) ReleaseProductionOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid production order ID format")
		return
	}
	if err := h.svc.ReleaseProductionOrder(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "production order")
			return
		}
		response.UnprocessableEntity(c, "INVALID_TRANSITION", err.Error())
		return
	}
	response.NoContent(c)
}

func (h *ProductionHandler) CancelProductionOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid production order ID format")
		return
	}
	if err := h.svc.CancelProductionOrder(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "production order")
			return
		}
		response.UnprocessableEntity(c, "INVALID_TRANSITION", err.Error())
		return
	}
	response.NoContent(c)
}

func (h *ProductionHandler) UpdatePriority(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid production order ID format")
		return
	}
	var req dto.UpdatePriorityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}
	if err := h.svc.UpdatePriority(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "production order")
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.NoContent(c)
}

// ─── Work Order Endpoints ─────────────────────────────────────────────────────

func (h *ProductionHandler) CreateWorkOrder(c *gin.Context) {
	var req dto.CreateWorkOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}
	wo, err := h.svc.CreateWorkOrder(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "production order or routing")
			return
		}
		if errors.Is(err, service.ErrTransition) {
			response.UnprocessableEntity(c, "INVALID_TRANSITION", err.Error())
			return
		}
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.Created(c, wo)
}

func (h *ProductionHandler) GetWorkOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid work order ID format")
		return
	}
	wo, err := h.svc.GetWorkOrder(c.Request.Context(), id)
	if err != nil {
		response.NotFound(c, "work order")
		return
	}
	response.OK(c, wo)
}

func (h *ProductionHandler) ListWorkOrders(c *gin.Context) {
	p := pagination.FromContext(c)
	filter := repository.WorkOrderFilter{
		Status:   c.Query("status"),
		Page:     p.Page,
		PageSize: p.PageSize,
	}
	if poID := c.Query("production_order_id"); poID != "" {
		if id, err := uuid.Parse(poID); err == nil {
			filter.ProductionOrderID = &id
		}
	}
	workOrders, total, err := h.svc.ListWorkOrders(c.Request.Context(), filter)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.List(c, workOrders, p.Page, p.PageSize, total)
}

func (h *ProductionHandler) StartWorkOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid work order ID format")
		return
	}
	if err := h.svc.StartWorkOrder(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "work order")
			return
		}
		response.UnprocessableEntity(c, "INVALID_TRANSITION", err.Error())
		return
	}
	response.NoContent(c)
}

func (h *ProductionHandler) CompleteWorkOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid work order ID format")
		return
	}
	if err := h.svc.CompleteWorkOrder(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "work order")
			return
		}
		response.UnprocessableEntity(c, "INVALID_TRANSITION", err.Error())
		return
	}
	response.NoContent(c)
}

func (h *ProductionHandler) ProcessGatewayEvent(c *gin.Context) {
	var req dto.GatewayEventPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}
	if err := h.svc.ProcessGatewayEvent(c.Request.Context(), req); err != nil {
		response.BadRequest(c, "BAD_REQUEST", err.Error())
		return
	}
	response.OK(c, gin.H{"status": "processed"})
}

func (h *ProductionHandler) StreamProductionOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid production order ID format")
		return
	}

	clientID := uuid.New().String()
	updateCh := h.svc.Subscribe(clientID)
	defer h.svc.Unsubscribe(clientID)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// Send initial state immediately
	initDTO, err := h.svc.GetProductionOrder(c.Request.Context(), id)
	if err == nil && initDTO != nil {
		h.writeSSEEvent(c.Writer, "order_update", initDTO)
	}

	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case dto, ok := <-updateCh:
			if !ok {
				return
			}
			// Only send updates relevant to the subscribed order ID
			if dto.ID == id {
				h.writeSSEEvent(c.Writer, "order_update", dto)
			}
		case <-heartbeat.C:
			fmt.Fprintf(c.Writer, ": heartbeat\n\n")
			c.Writer.Flush()
		}
	}
}

func (h *ProductionHandler) writeSSEEvent(w gin.ResponseWriter, event string, data any) {
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload)
	w.(http.Flusher).Flush()
}

func (h *ProductionHandler) CreateDispatchPlan(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid production order ID format")
		return
	}

	var req dto.CreateDispatchPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	plan, err := h.svc.CreateDispatchPlan(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "production order")
			return
		}
		response.UnprocessableEntity(c, "ERROR", err.Error())
		return
	}

	response.Created(c, plan)
}

func (h *ProductionHandler) ListDispatchPlans(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid production order ID format")
		return
	}

	plans, err := h.svc.ListDispatchPlans(c.Request.Context(), id)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}

	response.OK(c, plans)
}

func (h *ProductionHandler) GenerateWorkOrders(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid dispatch plan ID format")
		return
	}

	if err := h.svc.GenerateWorkOrders(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "dispatch plan")
			return
		}
		response.UnprocessableEntity(c, "ERROR", err.Error())
		return
	}

	response.OK(c, gin.H{"status": "generation_started"})
}

func (h *ProductionHandler) DispatchWorkOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid work order ID format")
		return
	}

	var req dto.DispatchWorkOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.DispatchWorkOrder(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "work order")
			return
		}
		response.UnprocessableEntity(c, "ERROR", err.Error())
		return
	}

	response.OK(c, gin.H{"status": "dispatched"})
}

func (h *ProductionHandler) BulkDispatchWorkOrders(c *gin.Context) {
	var req dto.BulkDispatchWorkOrdersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.svc.BulkDispatchWorkOrders(c.Request.Context(), req); err != nil {
		response.UnprocessableEntity(c, "ERROR", err.Error())
		return
	}

	response.OK(c, gin.H{"status": "dispatched"})
}

func (h *ProductionHandler) CancelWorkOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid work order ID format")
		return
	}

	if err := h.svc.CancelWorkOrder(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "work order")
			return
		}
		response.UnprocessableEntity(c, "ERROR", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *ProductionHandler) PauseWorkOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid work order ID format")
		return
	}

	if err := h.svc.PauseWorkOrder(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "work order")
			return
		}
		response.UnprocessableEntity(c, "ERROR", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *ProductionHandler) ResumeWorkOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.BadRequest(c, "INVALID_ID", "invalid work order ID format")
		return
	}

	if err := h.svc.ResumeWorkOrder(c.Request.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			response.NotFound(c, "work order")
			return
		}
		response.UnprocessableEntity(c, "ERROR", err.Error())
		return
	}

	response.NoContent(c)
}

func (h *ProductionHandler) StreamWorkOrders(c *gin.Context) {
	clientID := uuid.New().String()
	updateCh := h.svc.SubscribeWorkOrders(clientID)
	defer h.svc.UnsubscribeWorkOrders(clientID)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case dtoWo, ok := <-updateCh:
			if !ok {
				return
			}
			h.writeSSEEvent(c.Writer, "work_order_update", dtoWo)
		case <-heartbeat.C:
			fmt.Fprintf(c.Writer, ": heartbeat\n\n")
			c.Writer.Flush()
		}
	}
}
