package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/production/application/dto"
	"github.com/nd/mes-platform/modules/production/domain/entity"
	"github.com/nd/mes-platform/modules/production/domain/repository"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/shared/domain"
	"github.com/nd/mes-platform/shared/outbox"
)

var (
	ErrNotFound   = errors.New("not found")
	ErrConflict   = errors.New("conflict")
	ErrValidation = errors.New("validation error")
	ErrTransition = errors.New("invalid status transition")
)

type OutboxRepository interface {
	Save(ctx context.Context, event *outbox.Event) error
}

type GatewayClient interface {
	SendProductionOrder(ctx context.Context, order *entity.ProductionOrder) (string, error)
	SendWorkOrder(ctx context.Context, req any) (string, error)
	GetWorkOrderDetail(ctx context.Context, jobNo string) (map[string]interface{}, error)
}

type ProductionService struct {
	orderRepo    repository.ProductionOrderRepository
	workRepo     repository.WorkOrderRepository
	routingRepo  repository.RoutingRepository
	eventRepo    repository.ProductionOrderEventRepository
	outboxRepo   OutboxRepository
	gatewayCli   GatewayClient
	planRepo     repository.DispatchPlanRepository
	timelineRepo repository.WorkOrderTimelineRepository
	workflowRepo repository.WorkflowRepository
	log          *logger.Logger

	mu            sync.RWMutex
	subscribers   map[string]chan *dto.ProductionOrderDTO
	woSubscribers map[string]chan *dto.WorkOrderDTO
}

func NewProductionService(
	orderRepo repository.ProductionOrderRepository,
	workRepo repository.WorkOrderRepository,
	routingRepo repository.RoutingRepository,
	eventRepo repository.ProductionOrderEventRepository,
	outboxRepo OutboxRepository,
	gatewayCli GatewayClient,
	planRepo repository.DispatchPlanRepository,
	timelineRepo repository.WorkOrderTimelineRepository,
	workflowRepo repository.WorkflowRepository,
	log *logger.Logger,
) *ProductionService {
	return &ProductionService{
		orderRepo:     orderRepo,
		workRepo:      workRepo,
		routingRepo:   routingRepo,
		eventRepo:     eventRepo,
		outboxRepo:    outboxRepo,
		gatewayCli:    gatewayCli,
		planRepo:      planRepo,
		timelineRepo:  timelineRepo,
		workflowRepo:  workflowRepo,
		log:           log.With(logger.Module("production")),
		subscribers:   make(map[string]chan *dto.ProductionOrderDTO),
		woSubscribers: make(map[string]chan *dto.WorkOrderDTO),
	}
}

// ─── Routing Use Cases ────────────────────────────────────────────────────────

func (s *ProductionService) CreateRouting(ctx context.Context, req dto.CreateRoutingRequest) (*dto.RoutingDTO, error) {
	if existing, _ := s.routingRepo.FindByName(ctx, req.Name); existing != nil {
		return nil, fmt.Errorf("%w: routing with name %q already exists", ErrConflict, req.Name)
	}

	// Build operation value objects
	ops := make([]entity.Operation, 0, len(req.Operations))
	for _, opReq := range req.Operations {
		op, err := entity.NewOperation(
			uuid.Nil, // routing ID assigned by NewRouting
			opReq.Sequence,
			opReq.Name,
			opReq.MachineType,
			opReq.EstimatedMinutes,
			opReq.MinOperators,
			opReq.MaxOperators,
			opReq.RequiredSkills,
		)
		if err != nil {
			return nil, fmt.Errorf("%w: operation seq %d: %s", ErrValidation, opReq.Sequence, err.Error())
		}
		ops = append(ops, *op)
	}

	routing, err := entity.NewRouting(req.Name, req.Description, ops)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.routingRepo.Save(ctx, routing); err != nil {
		return nil, err
	}

	return mapRoutingToDTO(routing), nil
}

func (s *ProductionService) GetRouting(ctx context.Context, id uuid.UUID) (*dto.RoutingDTO, error) {
	r, err := s.routingRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	return mapRoutingToDTO(r), nil
}

func (s *ProductionService) ListRoutings(ctx context.Context) ([]*dto.RoutingDTO, error) {
	routings, err := s.routingRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	dtos := make([]*dto.RoutingDTO, len(routings))
	for i, r := range routings {
		dtos[i] = mapRoutingToDTO(r)
	}
	return dtos, nil
}

// ─── Production Order Use Cases ───────────────────────────────────────────────

func (s *ProductionService) CreateProductionOrder(ctx context.Context, req dto.CreateProductionOrderRequest) (*dto.ProductionOrderDTO, error) {
	if existing, _ := s.orderRepo.FindByOrderNumber(ctx, req.OrderNumber); existing != nil {
		return nil, fmt.Errorf("%w: order number %q already exists", ErrConflict, req.OrderNumber)
	}

	var dueDate *time.Time
	if req.DueDate != nil && *req.DueDate != "" {
		t, err := time.Parse("2006-01-02", *req.DueDate)
		if err != nil {
			return nil, fmt.Errorf("%w: due_date must be in YYYY-MM-DD format", ErrValidation)
		}
		dueDate = &t
	}

	var workflowID *uuid.UUID
	if req.WorkflowID != nil && *req.WorkflowID != "" {
		parsed, err := uuid.Parse(*req.WorkflowID)
		if err != nil {
			return nil, fmt.Errorf("%w: workflow_id must be a valid UUID", ErrValidation)
		}
		workflowID = &parsed
	}

	order, err := entity.NewProductionOrder(
		req.OrderNumber,
		req.Customer,
		req.Product,
		req.ProductRevision,
		workflowID,
		req.Quantity,
		req.Priority,
		dueDate,
		req.Notes,
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.orderRepo.Save(ctx, order); err != nil {
		return nil, err
	}

	// Create initial timeline event
	initEvent := entity.NewProductionOrderEvent(order.ID, "OrderCreated", "draft", "Đơn hàng sản xuất được tạo ở dạng nháp.", time.Now())
	if err := s.eventRepo.Save(ctx, initEvent); err != nil {
		s.log.Error("failed to save initial production order timeline event", logger.Err(err))
	}

	_ = s.publishEvents(ctx, order.PullEvents())
	return mapOrderToDTO(order), nil
}

func (s *ProductionService) GetProductionOrder(ctx context.Context, id uuid.UUID) (*dto.ProductionOrderDTO, error) {
	order, err := s.orderRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	events, err := s.eventRepo.ListByProductionOrderID(ctx, id)
	if err != nil {
		s.log.Error("failed to list production order events", logger.Err(err))
	}

	orderDTO := mapOrderToDTO(order)
	if len(events) > 0 {
		orderDTO.Events = make([]dto.ProductionOrderEventDTO, len(events))
		for i, ev := range events {
			orderDTO.Events[i] = dto.ProductionOrderEventDTO{
				ID:                ev.ID,
				ProductionOrderID: ev.ProductionOrderID,
				EventType:         ev.EventType,
				Status:            ev.Status,
				Message:           ev.Message,
				OccurredAt:        ev.OccurredAt,
			}
		}
	}
	return orderDTO, nil
}

func (s *ProductionService) ListProductionOrders(ctx context.Context, filter repository.ProductionOrderFilter) ([]*dto.ProductionOrderDTO, int64, error) {
	orders, total, err := s.orderRepo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	dtos := make([]*dto.ProductionOrderDTO, len(orders))
	for i, o := range orders {
		dtos[i] = mapOrderToDTO(o)
	}
	return dtos, total, nil
}

func (s *ProductionService) ReleaseProductionOrder(ctx context.Context, id uuid.UUID) error {
	order, err := s.orderRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if err := order.Release(); err != nil {
		return fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}
	order.ApprovalStatus = "approved"
	order.ProductionStatus = "planned"
	if err := s.orderRepo.Save(ctx, order); err != nil {
		return err
	}

	// Create Release event in timeline
	relEvent := entity.NewProductionOrderEvent(order.ID, "OrderReleased", "released", "Đơn hàng được phê duyệt và phát hành. Đang tự động khởi tạo các Đơn làm việc.", time.Now())
	_ = s.eventRepo.Save(ctx, relEvent)

	// Automatically generate Work Orders
	// Find/create default routing
	routings, err := s.routingRepo.List(ctx)
	var routingID uuid.UUID
	if err == nil && len(routings) > 0 {
		routingID = routings[0].ID
	} else {
		op, _ := entity.NewOperation(uuid.Nil, 1, "Default Operation", "Combined", 10, 1, 1, []string{})
		r, _ := entity.NewRouting("Default Routing", "Fallback routing", []entity.Operation{*op})
		_ = s.routingRepo.Save(ctx, r)
		routingID = r.ID
	}

	// Retrieve Workflow Operations from Template
	var workflowOps []entity.WorkflowOperation
	if order.WorkflowID != nil && s.workflowRepo != nil {
		wf, err := s.workflowRepo.FindByID(ctx, *order.WorkflowID)
		if err == nil {
			workflowOps = wf.Operations
			s.log.Info(fmt.Sprintf("retrieved workflow operations for release: workflow_id=%s, count=%d", order.WorkflowID.String(), len(workflowOps)))
		} else {
			s.log.Error(fmt.Sprintf("failed to retrieve workflow operations for release: workflow_id=%s, err=%v", order.WorkflowID.String(), err))
		}
	} else {
		s.log.Warn(fmt.Sprintf("workflowID or workflowRepo is nil on release: workflow_id=%v, repo_nil=%t", order.WorkflowID, s.workflowRepo == nil))
	}

	// Spawn asynchronous generation of all Work Orders in a goroutine
	go func() {
		bgCtx := context.Background()
		for i := 1; i <= order.Quantity; i++ {
			wo, err := entity.NewWorkOrder(order.ID, routingID, i)
			if err != nil {
				s.log.Error(fmt.Sprintf("failed to create work order instance for index %d: %v", i, err))
				continue
			}
			wo.SerialNumber = fmt.Sprintf("SN-%s-%04d", order.OrderNumber, i)
			wo.Barcode = fmt.Sprintf("BC-%s-%04d", order.OrderNumber, i)
			wo.QRCode = fmt.Sprintf("QR-%s-%04d", order.OrderNumber, i)
			wo.TraceID = fmt.Sprintf("TR-%s-%04d", order.OrderNumber, i)

			woOps := make([]entity.WorkOrderOperation, len(workflowOps))
			for idx, op := range workflowOps {
				woOps[idx] = entity.WorkOrderOperation{
					ID:                   uuid.New(),
					WorkOrderID:          wo.ID,
					Sequence:             op.Sequence,
					OperationName:        op.OperationName,
					OperationType:        op.OperationType,
					Status:               "pending",
					EstimatedDuration:    op.EstimatedDuration,
					RetryLimit:           op.RetryLimit,
					IsRequired:           op.IsRequired,
					RequiresStation:      op.RequiresStation,
					DefaultStationType:   op.DefaultStationType,
					QualityCheckRequired: op.QualityCheckRequired,
					IsFinalOperation:     op.IsFinalOperation,
					CreatedAt:            time.Now().UTC(),
					UpdatedAt:            time.Now().UTC(),
				}
			}
			wo.Operations = woOps

			initialStep := "PRINT_LABEL"
			initialOperation := "PRINT_LABEL"
			if len(woOps) > 0 {
				initialStep = woOps[0].OperationName
				initialOperation = woOps[0].OperationType
			}

			wo.CurrentStep = initialStep
			wo.CurrentOperation = initialOperation
			wo.WorkflowProgress = 0
			wo.Status = entity.WorkOrderStatusPending

			if err := s.workRepo.Save(bgCtx, wo); err != nil {
				s.log.Error(fmt.Sprintf("failed to save work order during release generation for serial %s: %v", wo.SerialNumber, err))
			} else {
				s.log.Info(fmt.Sprintf("successfully saved work order during release generation for serial %s", wo.SerialNumber))
			}

			// Timeline log
			timelineLog := entity.NewWorkOrderTimeline(wo.ID, "Created", "SUCCESS", fmt.Sprintf("Đơn làm việc được khởi tạo tự động. Bước bắt đầu: %s.", initialStep))
			_ = s.timelineRepo.Save(bgCtx, timelineLog)

			s.broadcastWorkOrderUpdate(bgCtx, wo)
		}
	}()

	_ = s.publishEvents(ctx, order.PullEvents())
	return nil
}

func (s *ProductionService) CancelProductionOrder(ctx context.Context, id uuid.UUID) error {
	order, err := s.orderRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if err := order.Cancel(); err != nil {
		return fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}
	if err := s.orderRepo.Save(ctx, order); err != nil {
		return err
	}
	_ = s.publishEvents(ctx, order.PullEvents())
	return nil
}

func (s *ProductionService) UpdatePriority(ctx context.Context, id uuid.UUID, req dto.UpdatePriorityRequest) error {
	order, err := s.orderRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if err := order.UpdatePriority(req.Priority); err != nil {
		return fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}
	return s.orderRepo.Save(ctx, order)
}

// ─── Work Order Use Cases ─────────────────────────────────────────────────────

func (s *ProductionService) CreateWorkOrder(ctx context.Context, req dto.CreateWorkOrderRequest) (*dto.WorkOrderDTO, error) {
	productionOrderID, err := uuid.Parse(req.ProductionOrderID)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid production_order_id", ErrValidation)
	}
	routingID, err := uuid.Parse(req.RoutingID)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid routing_id", ErrValidation)
	}

	// Verify production order exists and is released
	order, err := s.orderRepo.FindByID(ctx, productionOrderID)
	if err != nil {
		return nil, fmt.Errorf("%w: production order", ErrNotFound)
	}
	if order.Status != entity.OrderStatusReleased &&
		order.Status != entity.OrderStatusSentToGateway &&
		order.Status != entity.OrderStatusAccepted &&
		order.Status != entity.OrderStatusInProgress {
		return nil, fmt.Errorf("%w: production order must be released, sent_to_gateway, accepted, or in_progress to create work orders", ErrTransition)
	}

	// Verify routing exists
	if _, err := s.routingRepo.FindByID(ctx, routingID); err != nil {
		return nil, fmt.Errorf("%w: routing", ErrNotFound)
	}

	wo, err := entity.NewWorkOrder(productionOrderID, routingID, req.Sequence)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	// Generate unique default values for serial_number to satisfy database constraints
	stationVal := ""
	if order.Station != nil {
		stationVal = *order.Station
	}
	wo.SerialNumber = fmt.Sprintf("SN-%s-%s-%d-%s", order.OrderNumber, stationVal, req.Sequence, uuid.New().String()[:8])
	wo.Barcode = fmt.Sprintf("BC-%s-%d", order.OrderNumber, req.Sequence)
	wo.QRCode = fmt.Sprintf("QR-%s-%d", order.OrderNumber, req.Sequence)
	wo.TraceID = fmt.Sprintf("TR-%s-%d", order.OrderNumber, req.Sequence)

	if err := s.workRepo.Save(ctx, wo); err != nil {
		return nil, err
	}

	_ = s.publishEvents(ctx, wo.PullEvents())
	return mapWorkOrderToDTO(wo), nil
}

func (s *ProductionService) GetWorkOrder(ctx context.Context, id uuid.UUID) (*dto.WorkOrderDTO, error) {
	wo, err := s.workRepo.FindByID(ctx, id)
	if err != nil {
		return nil, ErrNotFound
	}
	dtoWo := mapWorkOrderToDTO(wo)

	// Fetch timelines
	timelines, err := s.timelineRepo.ListByWorkOrderID(ctx, id)
	if err == nil && len(timelines) > 0 {
		dtoWo.Timelines = make([]dto.WorkOrderTimelineDTO, len(timelines))
		for i, t := range timelines {
			dtoWo.Timelines[i] = dto.WorkOrderTimelineDTO{
				ID:          t.ID,
				WorkOrderID: t.WorkOrderID,
				Stage:       t.Stage,
				Status:      t.Status,
				Detail:      t.Detail,
				OccurredAt:  t.OccurredAt,
			}
		}
	}

	// Fetch simulator details if gateway_job_id is set
	if wo.GatewayJobID != nil && *wo.GatewayJobID != "" {
		simDetail, err := s.gatewayCli.GetWorkOrderDetail(ctx, *wo.GatewayJobID)
		if err == nil {
			dtoWo.SimulatorDetails = simDetail
		}
	}

	return dtoWo, nil
}

func (s *ProductionService) ListWorkOrders(ctx context.Context, filter repository.WorkOrderFilter) ([]*dto.WorkOrderDTO, int64, error) {
	workOrders, total, err := s.workRepo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	dtos := make([]*dto.WorkOrderDTO, len(workOrders))
	for i, wo := range workOrders {
		dtos[i] = mapWorkOrderToDTO(wo)
	}
	return dtos, total, nil
}

func (s *ProductionService) StartWorkOrder(ctx context.Context, id uuid.UUID) error {
	wo, err := s.workRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if err := wo.Start(); err != nil {
		return fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}
	if err := s.workRepo.Save(ctx, wo); err != nil {
		return err
	}
	_ = s.publishEvents(ctx, wo.PullEvents())
	return nil
}

func (s *ProductionService) CompleteWorkOrder(ctx context.Context, id uuid.UUID) error {
	wo, err := s.workRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if err := wo.Complete(); err != nil {
		return fmt.Errorf("%w: %s", ErrTransition, err.Error())
	}
	if err := s.workRepo.Save(ctx, wo); err != nil {
		return err
	}
	_ = s.publishEvents(ctx, wo.PullEvents())
	return nil
}

// ─── Private helpers ──────────────────────────────────────────────────────────

func (s *ProductionService) publishEvents(ctx context.Context, events []domain.DomainEvent) error {
	for _, ev := range events {
		payload, err := outbox.MarshalEvent(ev)
		if err != nil {
			return err
		}
		outboxEvent := outbox.NewEvent(ev.EventName(), ev.EventName(), payload)
		if err := s.outboxRepo.Save(ctx, outboxEvent); err != nil {
			return err
		}
	}
	return nil
}

func mapRoutingToDTO(r *entity.Routing) *dto.RoutingDTO {
	ops := make([]dto.OperationDTO, len(r.Operations))
	for i, op := range r.Operations {
		ops[i] = dto.OperationDTO{
			ID:               op.ID,
			RoutingID:        op.RoutingID,
			Sequence:         op.Sequence,
			Name:             op.Name,
			MachineType:      op.MachineType,
			EstimatedMinutes: op.EstimatedMinutes,
			MinOperators:     op.MinOperators,
			MaxOperators:     op.MaxOperators,
			RequiredSkills:   op.RequiredSkills,
		}
	}
	return &dto.RoutingDTO{
		ID:                    r.ID,
		Name:                  r.Name,
		Description:           r.Description,
		Operations:            ops,
		TotalEstimatedMinutes: r.TotalEstimatedMinutes(),
		CreatedAt:             r.CreatedAt,
		UpdatedAt:             r.UpdatedAt,
	}
}

func mapDispatchPlanToDTO(p *entity.DispatchPlan) *dto.DispatchPlanDTO {
	return &dto.DispatchPlanDTO{
		ID:                p.ID,
		ProductionOrderID: p.ProductionOrderID,
		Quantity:          p.Quantity,
		Station:           p.Station,
		ExecutionTeam:     p.ExecutionTeam,
		DispatchStrategy:  p.DispatchStrategy,
		BatchSize:         p.BatchSize,
		Status:            string(p.Status),
		GeneratedCount:    p.GeneratedCount,
		CreatedAt:         p.CreatedAt,
		UpdatedAt:         p.UpdatedAt,
	}
}

func mapOrderToDTO(o *entity.ProductionOrder) *dto.ProductionOrderDTO {
	return &dto.ProductionOrderDTO{
		ID:                o.ID,
		OrderNumber:       o.OrderNumber,
		Customer:          o.Customer,
		Product:           o.Product,
		ProductRevision:   o.ProductRevision,
		WorkflowID:        o.WorkflowID,
		Quantity:          o.Quantity,
		Priority:          o.Priority,
		Status:            string(o.Status),
		ApprovalStatus:    o.ApprovalStatus,
		ProductionStatus:  o.ProductionStatus,
		OperationType:     o.OperationType,
		Station:           o.Station,
		GatewayOrderID:    o.GatewayOrderID,
		DueDate:           o.DueDate,
		Notes:             o.Notes,
		QuantityCompleted: o.QuantityCompleted,
		QuantityRunning:   o.QuantityRunning,
		QuantityFailed:    o.QuantityFailed,
		QuantityCancelled: o.QuantityCancelled,
		ScrapQuantity:     o.ScrapQuantity,
		CreatedAt:         o.CreatedAt,
		UpdatedAt:         o.UpdatedAt,
	}
}

func mapWorkOrderToDTO(wo *entity.WorkOrder) *dto.WorkOrderDTO {
	ops := make([]dto.WorkOrderOperationDTO, len(wo.Operations))
	for i, op := range wo.Operations {
		ops[i] = dto.WorkOrderOperationDTO{
			ID:                   op.ID,
			WorkOrderID:          op.WorkOrderID,
			Sequence:             op.Sequence,
			OperationName:        op.OperationName,
			OperationType:        op.OperationType,
			Status:               op.Status,
			EstimatedDuration:    op.EstimatedDuration,
			RetryLimit:           op.RetryLimit,
			IsRequired:           op.IsRequired,
			RequiresStation:      op.RequiresStation,
			DefaultStationType:   op.DefaultStationType,
			QualityCheckRequired: op.QualityCheckRequired,
			IsFinalOperation:     op.IsFinalOperation,
			StartedAt:            op.StartedAt,
			CompletedAt:          op.CompletedAt,
			AssignedStation:      op.AssignedStation,
			AssignedTeam:         op.AssignedTeam,
			Duration:             op.Duration,
			RetryCount:           op.RetryCount,
			Telemetry:            op.Telemetry,
			Result:               op.Result,
			Comments:             op.Comments,
		}
	}
	return &dto.WorkOrderDTO{
		ID:                wo.ID,
		ProductionOrderID: wo.ProductionOrderID,
		RoutingID:         wo.RoutingID,
		Sequence:          wo.Sequence,
		Status:            string(wo.Status),
		StartedAt:         wo.StartedAt,
		CompletedAt:       wo.CompletedAt,
		DispatchPlanID:    wo.DispatchPlanID,
		SerialNumber:      wo.SerialNumber,
		Barcode:           wo.Barcode,
		QRCode:            wo.QRCode,
		CurrentStep:       wo.CurrentStep,
		CurrentAttempt:    wo.CurrentAttempt,
		AssignedStation:   wo.AssignedStation,
		AssignedTeam:      wo.AssignedTeam,
		TraceID:           wo.TraceID,
		RetryHistory:      wo.RetryHistory,
		GatewayJobID:      wo.GatewayJobID,
		CurrentOperation:  wo.CurrentOperation,
		WorkflowProgress:  wo.WorkflowProgress,
		Operations:        ops,
		CreatedAt:         wo.CreatedAt,
		UpdatedAt:         wo.UpdatedAt,
	}
}

// ProcessGatewayEvent handles webhook status events sent from the Gateway.
func (s *ProductionService) ProcessGatewayEvent(ctx context.Context, req dto.GatewayEventPayload) error {
	// First, check if req.ProductionOrderID corresponds to a WorkOrder ID
	var wo *entity.WorkOrder
	var order *entity.ProductionOrder
	var err error

	if req.ProductionOrderID != "" {
		if id, parseErr := uuid.Parse(req.ProductionOrderID); parseErr == nil {
			wo, err = s.workRepo.FindByID(ctx, id)
		}
	}

	// 1. Fallback to lookup work order by serial number if matched in payload
	if (wo == nil || err != nil) && req.JobNo != "" {
		// Sometimes JobNo holds work order ID or serial number
		if id, parseErr := uuid.Parse(req.JobNo); parseErr == nil {
			wo, _ = s.workRepo.FindByID(ctx, id)
		}
	}

	if wo != nil {
		var timelineStatus string
		var transitionStatus entity.WorkOrderStatus

		// Find active operation snapshot to advance progress
		var activeOp *entity.WorkOrderOperation
		var activeIdx int = -1
		for i := range wo.Operations {
			if wo.Operations[i].OperationType == wo.CurrentOperation || wo.Operations[i].OperationName == wo.CurrentStep {
				activeOp = &wo.Operations[i]
				activeIdx = i
				break
			}
		}

		switch req.Status {
		case "QUEUED":
			timelineStatus = "QUEUED"
			transitionStatus = entity.WorkOrderStatusQueued
		case "ACCEPTED":
			timelineStatus = "ACCEPTED"
			transitionStatus = entity.WorkOrderStatusAccepted
		case "PROCESSING":
			timelineStatus = "PROCESSING"
			transitionStatus = entity.WorkOrderStatusPrinting
			if activeOp != nil {
				activeOp.Status = "running"
				if activeOp.StartedAt == nil {
					tNow := time.Now().UTC()
					activeOp.StartedAt = &tNow
				}
			}
		case "COMPLETED":
			timelineStatus = "COMPLETED"
			now := time.Now().UTC()
			if activeOp != nil {
				activeOp.Status = "completed"
				activeOp.CompletedAt = &now
				if activeOp.StartedAt != nil {
					activeOp.Duration = int(now.Sub(*activeOp.StartedAt).Seconds())
				}
				activeOp.Result = "PASSED"
				activeOp.Comments = req.Message
				activeOp.UpdatedAt = now
			}
			if activeIdx >= 0 && activeIdx < len(wo.Operations)-1 {
				// Advance to the next operation in the template list
				nextOp := &wo.Operations[activeIdx+1]
				wo.CurrentStep = nextOp.OperationName
				wo.CurrentOperation = nextOp.OperationType
				wo.WorkflowProgress = activeIdx + 1
				transitionStatus = entity.WorkOrderStatusPending
			} else {
				// Final operation is finished
				transitionStatus = entity.WorkOrderStatusCompleted
				wo.CurrentStep = "COMPLETED"
				wo.CompletedAt = &now
			}
		case "FAILED":
			timelineStatus = "FAILED"
			now := time.Now().UTC()
			if activeOp != nil {
				activeOp.Status = "failed"
				activeOp.CompletedAt = &now
				activeOp.Result = "FAILED"
				activeOp.Comments = req.Message
				activeOp.RetryCount++
				activeOp.UpdatedAt = now
				transitionStatus = entity.WorkOrderStatusVisionFailed
				wo.CurrentStep = activeOp.OperationName + " Failed"
			} else {
				transitionStatus = entity.WorkOrderStatusVisionFailed
				wo.CurrentStep = "FAILED"
			}
		default:
			timelineStatus = req.Status
			if strings.Contains(req.Status, "PRINT") {
				wo.CurrentStep = "PRINT"
				transitionStatus = entity.WorkOrderStatusPrinting
			} else if strings.Contains(req.Status, "LASER") {
				wo.CurrentStep = "LASER"
				transitionStatus = entity.WorkOrderStatusLaserRunning
			} else if strings.Contains(req.Status, "VISION") {
				wo.CurrentStep = "VISION"
				transitionStatus = entity.WorkOrderStatusVisionRunning
			} else {
				transitionStatus = entity.WorkOrderStatus(strings.ToLower(req.Status))
			}
		}

		wo.Status = transitionStatus
		wo.UpdatedAt = time.Now().UTC()

		if wo.GatewayJobID == nil || *wo.GatewayJobID == "" {
			wo.GatewayJobID = &req.JobNo
		}

		if err := s.workRepo.Save(ctx, wo); err != nil {
			return err
		}

		// Save timeline
		logEvent := entity.NewWorkOrderTimeline(wo.ID, timelineStatus, "SUCCESS", req.Message)
		_ = s.timelineRepo.Save(ctx, logEvent)

		// Broadcast update
		s.broadcastWorkOrderUpdate(ctx, wo)

		// Recalculate parent production order stats
		order, err = s.orderRepo.FindByID(ctx, wo.ProductionOrderID)
		if err == nil && order != nil {
			filter := repository.WorkOrderFilter{
				ProductionOrderID: &order.ID,
				PageSize:          100000,
			}
			workOrders, _, err := s.workRepo.List(ctx, filter)
			if err == nil {
				var completed, running, failed, cancelled int
				for _, w := range workOrders {
					switch w.Status {
					case entity.WorkOrderStatusCompleted:
						completed++
					case entity.WorkOrderStatusCancelled:
						cancelled++
					case entity.WorkOrderStatusVisionFailed, entity.WorkOrderStatusRejected:
						failed++
					case entity.WorkOrderStatusPending:
						// pending
					default:
						running++
					}
				}
				order.QuantityCompleted = completed
				order.QuantityRunning = running
				order.QuantityFailed = failed
				order.QuantityCancelled = cancelled

				if order.QuantityCompleted == order.Quantity {
					order.Status = entity.OrderStatusCompleted
				} else if order.QuantityCompleted+order.QuantityFailed+order.QuantityCancelled == order.Quantity {
					if order.QuantityFailed > 0 {
						order.Status = entity.OrderStatusFailed
					} else {
						order.Status = entity.OrderStatusCompleted
					}
				} else if order.QuantityRunning > 0 || order.QuantityCompleted > 0 {
					order.Status = entity.OrderStatusInProgress
				}

				_ = s.orderRepo.Save(ctx, order)
				s.broadcastOrderUpdate(ctx, order.ID)
			}
		}
		return nil
	}

	// Legacy Production Order handling:
	if req.ProductionOrderID != "" {
		if id, parseErr := uuid.Parse(req.ProductionOrderID); parseErr == nil {
			order, err = s.orderRepo.FindByID(ctx, id)
		}
	}
	if (order == nil || err != nil) && req.OrderNumber != "" {
		order, err = s.orderRepo.FindByOrderNumber(ctx, req.OrderNumber)
	}
	if order == nil || err != nil {
		order, err = s.orderRepo.FindByGatewayOrderID(ctx, req.JobNo)
	}
	if order == nil || err != nil {
		if id, parseErr := uuid.Parse(req.JobNo); parseErr == nil {
			order, err = s.orderRepo.FindByID(ctx, id)
		}
	}
	if err != nil || order == nil {
		return fmt.Errorf("process gateway event: order/workorder not found for job_no %s", req.JobNo)
	}

	if order.GatewayOrderID == nil || *order.GatewayOrderID == "" {
		_ = order.SentToGateway(req.JobNo)
	}

	var timelineStatus string
	var transitionErr error
	switch req.Status {
	case "QUEUED":
		timelineStatus = "queued"
		transitionErr = order.SentToGateway(req.JobNo)
	case "ACCEPTED":
		timelineStatus = "accepted"
		transitionErr = order.Accept()
	case "PROCESSING":
		timelineStatus = "in_progress"
		transitionErr = order.Start()
	case "COMPLETED":
		timelineStatus = "completed"
		transitionErr = order.Complete()
	case "FAILED":
		timelineStatus = "failed"
		transitionErr = order.Fail()
	default:
		timelineStatus = "in_progress"
	}

	if transitionErr != nil {
		s.log.Warn("state transition warning in gateway event processing", logger.Err(transitionErr))
	}

	if err := s.orderRepo.Save(ctx, order); err != nil {
		return err
	}

	ev := entity.NewProductionOrderEvent(order.ID, "GatewayStatusUpdated", timelineStatus, req.Message, req.OccurredAt)
	_ = s.eventRepo.Save(ctx, ev)

	s.broadcastOrderUpdate(ctx, order.ID)
	return nil
}

func (s *ProductionService) Subscribe(clientID string) <-chan *dto.ProductionOrderDTO {
	ch := make(chan *dto.ProductionOrderDTO, 10)
	s.mu.Lock()
	s.subscribers[clientID] = ch
	s.mu.Unlock()
	return ch
}

func (s *ProductionService) Unsubscribe(clientID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ch, ok := s.subscribers[clientID]; ok {
		close(ch)
		delete(s.subscribers, clientID)
	}
}

func (s *ProductionService) broadcastOrderUpdate(ctx context.Context, id uuid.UUID) {
	orderDTO, err := s.GetProductionOrder(ctx, id)
	if err != nil {
		s.log.Error("failed to get production order for broadcast", logger.Err(err))
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, ch := range s.subscribers {
		select {
		case ch <- orderDTO:
		default:
			// channel is full, skip
		}
	}
}

// ─── Dispatch Plan Service methods ───────────────────────────────────────────

func (s *ProductionService) CreateDispatchPlan(ctx context.Context, orderID uuid.UUID, req dto.CreateDispatchPlanRequest) (*dto.DispatchPlanDTO, error) {
	order, err := s.orderRepo.FindByID(ctx, orderID)
	if err != nil {
		return nil, ErrNotFound
	}
	if order.Status != entity.OrderStatusReleased && order.Status != entity.OrderStatusInProgress && order.Status != entity.OrderStatusAccepted && order.Status != entity.OrderStatusSentToGateway {
		return nil, fmt.Errorf("%w: order must be released to create dispatch plans", ErrTransition)
	}

	// Calculate current plan totals
	plans, err := s.planRepo.ListByProductionOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	totalPlanned := 0
	for _, p := range plans {
		totalPlanned += p.Quantity
	}
	if totalPlanned+req.Quantity > order.Quantity {
		return nil, fmt.Errorf("%w: total planned quantity (%d) cannot exceed production order quantity (%d)", ErrValidation, totalPlanned+req.Quantity, order.Quantity)
	}

	plan, err := entity.NewDispatchPlan(orderID, req.Quantity, req.Station, req.ExecutionTeam, req.DispatchStrategy, req.BatchSize)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrValidation, err.Error())
	}

	if err := s.planRepo.Save(ctx, plan); err != nil {
		return nil, err
	}

	return mapDispatchPlanToDTO(plan), nil
}

func (s *ProductionService) ListDispatchPlans(ctx context.Context, orderID uuid.UUID) ([]*dto.DispatchPlanDTO, error) {
	plans, err := s.planRepo.ListByProductionOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	dtos := make([]*dto.DispatchPlanDTO, len(plans))
	for i, p := range plans {
		dtos[i] = mapDispatchPlanToDTO(p)
	}
	return dtos, nil
}

func (s *ProductionService) GenerateWorkOrders(ctx context.Context, planID uuid.UUID) error {
	plan, err := s.planRepo.FindByID(ctx, planID)
	if err != nil {
		return ErrNotFound
	}
	if plan.Status != entity.DispatchPlanStatusPending {
		return fmt.Errorf("work orders already generated or generating for this plan")
	}

	order, err := s.orderRepo.FindByID(ctx, plan.ProductionOrderID)
	if err != nil {
		return ErrNotFound
	}

	// Find/create default routing
	routings, err := s.routingRepo.List(ctx)
	var routingID uuid.UUID
	if err == nil && len(routings) > 0 {
		routingID = routings[0].ID
	} else {
		op, _ := entity.NewOperation(uuid.Nil, 1, "Default Operation", "Combined", 10, 1, 1, []string{})
		r, _ := entity.NewRouting("Default Routing", "Fallback routing", []entity.Operation{*op})
		_ = s.routingRepo.Save(ctx, r)
		routingID = r.ID
	}

	// Start async generation
	go func() {
		bgCtx := context.Background()
		plan.Status = entity.DispatchPlanStatusGenerating
		_ = s.planRepo.Save(bgCtx, plan)

		for i := 1; i <= plan.Quantity; i++ {
			seq := plan.GeneratedCount + i
			wo, err := entity.NewWorkOrder(plan.ProductionOrderID, routingID, seq)
			if err != nil {
				continue
			}

			wo.DispatchPlanID = &plan.ID
			wo.SerialNumber = fmt.Sprintf("SN-%s-%s-%04d", order.OrderNumber, plan.Station, seq)
			wo.Barcode = fmt.Sprintf("BC-%s-%04d", order.OrderNumber, seq)
			wo.QRCode = fmt.Sprintf("QR-%s-%04d", order.OrderNumber, seq)
			wo.TraceID = fmt.Sprintf("TR-%s-%04d", order.OrderNumber, seq)
			wo.AssignedStation = plan.Station
			wo.AssignedTeam = plan.ExecutionTeam

			_ = s.workRepo.Save(bgCtx, wo)

			// Timeline log
			timelineLog := entity.NewWorkOrderTimeline(wo.ID, "Created", "SUCCESS", "Đơn làm việc được tạo tự động từ Dispatch Plan.")
			_ = s.timelineRepo.Save(bgCtx, timelineLog)

			plan.GeneratedCount = i
			_ = s.planRepo.Save(bgCtx, plan)

			s.broadcastWorkOrderUpdate(bgCtx, wo)

			// Sleep for smooth progress visual
			time.Sleep(15 * time.Millisecond)
		}

		plan.Status = entity.DispatchPlanStatusCompleted
		_ = s.planRepo.Save(bgCtx, plan)
	}()

	return nil
}

// ─── Dispatch Engine / Executions ────────────────────────────────────────────

func (s *ProductionService) DispatchWorkOrder(ctx context.Context, id uuid.UUID, req dto.DispatchWorkOrderRequest) error {
	wo, err := s.workRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if wo.Status != entity.WorkOrderStatusPending && wo.Status != entity.WorkOrderStatusCancelled && wo.Status != entity.WorkOrderStatusVisionFailed {
		return fmt.Errorf("work order is already dispatched or completed")
	}

	// Retrieve active operation snapshot
	var activeOp *entity.WorkOrderOperation
	for i := range wo.Operations {
		if wo.Operations[i].OperationType == wo.CurrentOperation || wo.Operations[i].OperationName == wo.CurrentStep {
			activeOp = &wo.Operations[i]
			break
		}
	}

	if activeOp != nil && !activeOp.RequiresStation {
		return fmt.Errorf("operation %q does not require a station and cannot be dispatched", activeOp.OperationName)
	}

	if activeOp != nil {
		now := time.Now().UTC()
		activeOp.Status = "running"
		activeOp.StartedAt = &now
		activeOp.AssignedStation = req.Station
		activeOp.AssignedTeam = req.Team
		activeOp.UpdatedAt = now
	}

	order, err := s.orderRepo.FindByID(ctx, wo.ProductionOrderID)
	if err != nil {
		return ErrNotFound
	}

	workflowName := "Default Workflow"
	if order.WorkflowID != nil {
		wf, err := s.workflowRepo.FindByID(ctx, *order.WorkflowID)
		if err == nil && wf != nil {
			workflowName = wf.WorkflowName
		}
	}

	// Prepare gateway payload
	mfg := time.Now()
	exp := mfg.AddDate(2, 0, 0)
	lot := fmt.Sprintf("LOT-%d-%02d-A", mfg.Year(), mfg.Month())

	gwPayload := struct {
		ProductionOrderID string `json:"production_order_id"`
		OrderNumber       string `json:"order_number"`
		OperationType     string `json:"operation_type"`
		Station           string `json:"station"`
		Priority          int    `json:"priority"`
		ProductID         string `json:"product_id"`
		LotNumber         string `json:"lot_number"`
		SerialNumber      string `json:"serial_number"`
		MfgDate           string `json:"mfg_date"`
		ExpDate           string `json:"exp_date"`
		Quantity          int    `json:"quantity"`
		WorkflowName      string `json:"workflow_name"`
		ProductName       string `json:"product_name"`
		ProductRevision   string `json:"product_revision"`
		Customer          string `json:"customer"`
		PlannedQuantity   int    `json:"planned_quantity"`
		CompletedQuantity int    `json:"completed_quantity"`
		RemainingQuantity int    `json:"remaining_quantity"`
		CurrentStep       string `json:"current_step"`
		AssignedTeam      string `json:"assigned_team"`
		Operator          string `json:"operator"`
	}{
		ProductionOrderID: wo.ID.String(), // Pass Work Order ID as ProductionOrderID for simulator mapping!
		OrderNumber:       order.OrderNumber,
		OperationType:     wo.CurrentOperation,
		Station:           req.Station,
		Priority:          order.Priority,
		ProductID:         order.Product,
		LotNumber:         lot,
		SerialNumber:      wo.SerialNumber,
		MfgDate:           mfg.Format("2006-01-02"),
		ExpDate:           exp.Format("2006-01-02"),
		Quantity:          1,
		WorkflowName:      workflowName,
		ProductName:       order.Product + " Industrial Part",
		ProductRevision:   order.ProductRevision,
		Customer:          order.Customer,
		PlannedQuantity:   order.Quantity,
		CompletedQuantity: order.QuantityCompleted,
		RemainingQuantity: order.Quantity - order.QuantityCompleted,
		CurrentStep:       wo.CurrentStep,
		AssignedTeam:      req.Team,
		Operator:          "admin.operator",
	}

	jobID, err := s.gatewayCli.SendWorkOrder(ctx, gwPayload)
	if err != nil {
		s.log.Error("failed to dispatch work order to simulator gateway", logger.Err(err))
		// Log failed attempt in timeline
		logEvent := entity.NewWorkOrderTimeline(wo.ID, "DISPATCH_FAILED", "FAILED", fmt.Sprintf("Gửi lệnh đến Gateway thất bại: %s", err.Error()))
		_ = s.timelineRepo.Save(ctx, logEvent)
		return err
	}

	wo.GatewayJobID = &jobID
	wo.Status = entity.WorkOrderStatusDispatched
	wo.AssignedStation = req.Station
	if req.Team != "" {
		wo.AssignedTeam = req.Team
	}
	if req.Operation != "" {
		wo.CurrentOperation = req.Operation
		wo.CurrentStep = req.Operation
	}
	wo.UpdatedAt = time.Now().UTC()
	if err := s.workRepo.Save(ctx, wo); err != nil {
		return err
	}

	// Add timeline log
	logEvent := entity.NewWorkOrderTimeline(wo.ID, "Dispatched", "SUCCESS", fmt.Sprintf("Đã gửi lệnh sản xuất đến Gateway trạm: %s. Gateway Job ID: %s", req.Station, jobID))
	_ = s.timelineRepo.Save(ctx, logEvent)

	// Broadcast Work Order update
	s.broadcastWorkOrderUpdate(ctx, wo)

	// Increment parent Production Order Running count
	order.QuantityRunning++
	if order.Status == entity.OrderStatusReleased || order.Status == entity.OrderStatusSentToGateway || order.Status == entity.OrderStatusAccepted {
		order.Status = entity.OrderStatusInProgress
	}
	_ = s.orderRepo.Save(ctx, order)
	s.broadcastOrderUpdate(ctx, order.ID)

	return nil
}

func (s *ProductionService) BulkDispatchWorkOrders(ctx context.Context, req dto.BulkDispatchWorkOrdersRequest) error {
	for _, idStr := range req.WorkOrderIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			continue
		}
		_ = s.DispatchWorkOrder(ctx, id, dto.DispatchWorkOrderRequest{
			Station:   req.Station,
			Team:      req.Team,
			Operation: req.Operation,
		})
	}
	return nil
}

func (s *ProductionService) CancelWorkOrder(ctx context.Context, id uuid.UUID) error {
	wo, err := s.workRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if err := wo.Cancel(); err != nil {
		return err
	}
	if err := s.workRepo.Save(ctx, wo); err != nil {
		return err
	}

	logEvent := entity.NewWorkOrderTimeline(wo.ID, "Cancelled", "SUCCESS", "Đơn làm việc đã bị hủy thủ công.")
	_ = s.timelineRepo.Save(ctx, logEvent)

	s.broadcastWorkOrderUpdate(ctx, wo)
	return nil
}

func (s *ProductionService) PauseWorkOrder(ctx context.Context, id uuid.UUID) error {
	wo, err := s.workRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	wo.Status = entity.WorkOrderStatusPaused
	wo.UpdatedAt = time.Now().UTC()
	if err := s.workRepo.Save(ctx, wo); err != nil {
		return err
	}

	logEvent := entity.NewWorkOrderTimeline(wo.ID, "Paused", "SUCCESS", "Tạm dừng thực thi.")
	_ = s.timelineRepo.Save(ctx, logEvent)

	s.broadcastWorkOrderUpdate(ctx, wo)
	return nil
}

func (s *ProductionService) ResumeWorkOrder(ctx context.Context, id uuid.UUID) error {
	wo, err := s.workRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	wo.Status = entity.WorkOrderStatusPrinting
	wo.UpdatedAt = time.Now().UTC()
	if err := s.workRepo.Save(ctx, wo); err != nil {
		return err
	}

	logEvent := entity.NewWorkOrderTimeline(wo.ID, "Resumed", "SUCCESS", "Tiếp tục thực thi.")
	_ = s.timelineRepo.Save(ctx, logEvent)

	s.broadcastWorkOrderUpdate(ctx, wo)
	return nil
}

// ─── Work Order SSE Subscription ─────────────────────────────────────────────

func (s *ProductionService) SubscribeWorkOrders(clientID string) <-chan *dto.WorkOrderDTO {
	ch := make(chan *dto.WorkOrderDTO, 100)
	s.mu.Lock()
	s.woSubscribers[clientID] = ch
	s.mu.Unlock()
	return ch
}

func (s *ProductionService) UnsubscribeWorkOrders(clientID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ch, ok := s.woSubscribers[clientID]; ok {
		close(ch)
		delete(s.woSubscribers, clientID)
	}
}

func (s *ProductionService) broadcastWorkOrderUpdate(ctx context.Context, wo *entity.WorkOrder) {
	dtoWo := mapWorkOrderToDTO(wo)
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, ch := range s.woSubscribers {
		select {
		case ch <- dtoWo:
		default:
			// full, skip
		}
	}
}
