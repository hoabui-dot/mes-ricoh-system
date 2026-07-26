package entity

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/shared/domain"
)

type DispatchPlanStatus string

const (
	DispatchPlanStatusPending    DispatchPlanStatus = "pending"
	DispatchPlanStatusGenerating DispatchPlanStatus = "generating"
	DispatchPlanStatusCompleted  DispatchPlanStatus = "completed"
	DispatchPlanStatusFailed     DispatchPlanStatus = "failed"
)

type DispatchPlan struct {
	domain.BaseEntity
	ProductionOrderID uuid.UUID
	Quantity          int
	Station           string
	ExecutionTeam     string
	DispatchStrategy  string
	BatchSize         int
	Status            DispatchPlanStatus
	GeneratedCount    int
}

func NewDispatchPlan(productionOrderID uuid.UUID, quantity int, station, executionTeam string, strategy string, batchSize int) (*DispatchPlan, error) {
	if productionOrderID == uuid.Nil {
		return nil, errors.New("production order ID is required")
	}
	if quantity <= 0 {
		return nil, errors.New("quantity must be greater than 0")
	}
	if strings.TrimSpace(station) == "" {
		return nil, errors.New("station is required")
	}
	if strings.TrimSpace(executionTeam) == "" {
		return nil, errors.New("execution team is required")
	}
	if strategy == "" {
		strategy = "Serial"
	}
	if batchSize <= 0 {
		batchSize = 1
	}

	dp := &DispatchPlan{
		ProductionOrderID: productionOrderID,
		Quantity:          quantity,
		Station:           strings.TrimSpace(station),
		ExecutionTeam:     strings.TrimSpace(executionTeam),
		DispatchStrategy:  strategy,
		BatchSize:         batchSize,
		Status:            DispatchPlanStatusPending,
		GeneratedCount:    0,
	}
	dp.BaseEntity = domain.BaseEntity{
		ID:        uuid.New(),
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	return dp, nil
}
