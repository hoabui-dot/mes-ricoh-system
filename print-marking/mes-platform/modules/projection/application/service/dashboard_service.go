package service

import (
	"context"
	"sync"
	"time"

	"github.com/nd/mes-platform/modules/projection/application/builder"
	"github.com/nd/mes-platform/modules/projection/domain/readmodel"
	"github.com/nd/mes-platform/modules/projection/domain/repository"
	"github.com/nd/mes-platform/pkg/logger"
)

// DashboardService orchestrates dashboard read model queries and rebuild triggers.
type DashboardService struct {
	dashboardRepo repository.DashboardRepository
	orderRepo     repository.OrderStatsRepository
	workerRepo    repository.WorkerStatsRepository
	builder       *builder.ProjectionBuilder
	log           *logger.Logger

	// SSE subscriber management
	mu          sync.RWMutex
	subscribers map[string]chan *readmodel.DashboardSnapshot
}

func NewDashboardService(
	dashboardRepo repository.DashboardRepository,
	orderRepo repository.OrderStatsRepository,
	workerRepo repository.WorkerStatsRepository,
	b *builder.ProjectionBuilder,
	log *logger.Logger,
) *DashboardService {
	return &DashboardService{
		dashboardRepo: dashboardRepo,
		orderRepo:     orderRepo,
		workerRepo:    workerRepo,
		builder:       b,
		log:           log.With(logger.Module("projection")),
		subscribers:   make(map[string]chan *readmodel.DashboardSnapshot),
	}
}

// GetDashboard returns the latest dashboard snapshot.
// If no snapshot exists today, it triggers a rebuild first.
func (s *DashboardService) GetDashboard(ctx context.Context) (*readmodel.DashboardSnapshot, error) {
	today := time.Now().UTC()
	snapshot, err := s.dashboardRepo.GetSnapshot(ctx, today)
	if err != nil {
		return nil, err
	}
	if snapshot == nil {
		// No snapshot for today yet — build it on demand
		snapshot, err = s.builder.RebuildDashboard(ctx)
		if err != nil {
			return nil, err
		}
	}
	return snapshot, nil
}

// RefreshDashboard forces a rebuild of today's dashboard snapshot and
// notifies all SSE subscribers.
func (s *DashboardService) RefreshDashboard(ctx context.Context) (*readmodel.DashboardSnapshot, error) {
	snapshot, err := s.builder.RebuildDashboard(ctx)
	if err != nil {
		return nil, err
	}
	s.broadcast(snapshot)
	return snapshot, nil
}

// GetOrderStats retrieves order statistics for a period type.
func (s *DashboardService) GetOrderStats(ctx context.Context, period readmodel.StatsPeriod, limit int) ([]*readmodel.OrderStats, error) {
	return s.orderRepo.List(ctx, period, limit)
}

// GetTopWorkers retrieves the top-performing workers for the current period.
func (s *DashboardService) GetTopWorkers(ctx context.Context, period readmodel.StatsPeriod, limit int) ([]*readmodel.WorkerStats, error) {
	return s.workerRepo.ListTopWorkers(ctx, period, time.Now().UTC(), limit)
}

// ─── SSE Pub/Sub ──────────────────────────────────────────────────────────────

// Subscribe returns a channel that receives dashboard snapshot updates.
// The caller must call Unsubscribe when done (e.g., when the SSE connection closes).
func (s *DashboardService) Subscribe(clientID string) <-chan *readmodel.DashboardSnapshot {
	ch := make(chan *readmodel.DashboardSnapshot, 4)
	s.mu.Lock()
	s.subscribers[clientID] = ch
	s.mu.Unlock()
	return ch
}

// Unsubscribe removes a subscriber and closes its channel.
func (s *DashboardService) Unsubscribe(clientID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ch, ok := s.subscribers[clientID]; ok {
		close(ch)
		delete(s.subscribers, clientID)
	}
}

// broadcast pushes a new snapshot to all active SSE subscribers (non-blocking).
func (s *DashboardService) broadcast(snapshot *readmodel.DashboardSnapshot) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, ch := range s.subscribers {
		select {
		case ch <- snapshot:
		default: // drop if channel buffer is full — SSE clients reconnect
		}
	}
}

// StartPeriodicRebuild launches a background goroutine that rebuilds the
// dashboard snapshot every interval and notifies subscribers.
func (s *DashboardService) StartPeriodicRebuild(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				snapshot, err := s.builder.RebuildDashboard(ctx)
				if err != nil {
					s.log.Error("periodic dashboard rebuild failed", logger.Err(err))
					continue
				}
				s.broadcast(snapshot)
			case <-ctx.Done():
				return
			}
		}
	}()
}
