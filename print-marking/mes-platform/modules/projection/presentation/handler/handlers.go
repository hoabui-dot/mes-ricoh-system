package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/projection/application/service"
	"github.com/nd/mes-platform/modules/projection/domain/readmodel"
	"github.com/nd/mes-platform/shared/response"
)

type ProjectionHandler struct {
	svc *service.DashboardService
}

func NewProjectionHandler(svc *service.DashboardService) *ProjectionHandler {
	return &ProjectionHandler{svc: svc}
}

// GetDashboard returns the current factory dashboard snapshot.
// GET /dashboard
func (h *ProjectionHandler) GetDashboard(c *gin.Context) {
	snapshot, err := h.svc.GetDashboard(c.Request.Context())
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, snapshot)
}

// RefreshDashboard forces a snapshot rebuild (manager/admin action).
// POST /dashboard/refresh
func (h *ProjectionHandler) RefreshDashboard(c *gin.Context) {
	snapshot, err := h.svc.RefreshDashboard(c.Request.Context())
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, snapshot)
}

// GetOrderStats returns time-series order statistics.
// GET /dashboard/stats/orders?period=daily&limit=30
func (h *ProjectionHandler) GetOrderStats(c *gin.Context) {
	period := readmodel.StatsPeriod(c.DefaultQuery("period", "daily"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))

	stats, err := h.svc.GetOrderStats(c.Request.Context(), period, limit)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, stats)
}

// GetTopWorkers returns the top-performing workers by assignment score.
// GET /dashboard/stats/workers?period=monthly&limit=10
func (h *ProjectionHandler) GetTopWorkers(c *gin.Context) {
	period := readmodel.StatsPeriod(c.DefaultQuery("period", "monthly"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	workers, err := h.svc.GetTopWorkers(c.Request.Context(), period, limit)
	if err != nil {
		response.InternalServerError(c, c.GetString("trace_id"))
		return
	}
	response.OK(c, workers)
}

// StreamDashboard opens a Server-Sent Events (SSE) connection.
// The client receives a full dashboard snapshot immediately on connect,
// then receives updates whenever the projection is rebuilt.
// GET /dashboard/stream
func (h *ProjectionHandler) StreamDashboard(c *gin.Context) {
	clientID := uuid.New().String()

	// Subscribe to snapshot updates
	snapCh := h.svc.Subscribe(clientID)
	defer h.svc.Unsubscribe(clientID)

	// SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // nginx support

	// Send initial snapshot immediately
	initSnapshot, err := h.svc.GetDashboard(c.Request.Context())
	if err == nil && initSnapshot != nil {
		h.writeSSEEvent(c.Writer, "snapshot", initSnapshot)
	}

	// Heartbeat every 30 seconds to keep the connection alive through proxies
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			// Client disconnected
			return
		case snap, ok := <-snapCh:
			if !ok {
				return // Channel closed by Unsubscribe
			}
			h.writeSSEEvent(c.Writer, "snapshot", snap)
		case <-heartbeat.C:
			fmt.Fprintf(c.Writer, ": heartbeat\n\n")
			c.Writer.Flush()
		}
	}
}

// writeSSEEvent serialises data as a typed SSE event and flushes immediately.
func (h *ProjectionHandler) writeSSEEvent(w gin.ResponseWriter, event string, data any) {
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload)
	w.(http.Flusher).Flush()
}
