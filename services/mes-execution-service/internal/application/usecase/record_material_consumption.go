package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/domain"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type RecordConsumptionInput struct {
	WOID                string  `json:"wo_id"`
	WOOperationID       string  `json:"wo_operation_id"`
	ComponentRevisionID string  `json:"component_revision_id"`
	QtyConsumed         float64 `json:"qty_consumed"`
	UOM                 string  `json:"uom"`
	Source              string  `json:"source"` // BACKFLUSH, MANUAL_SCAN
	LabelID             *string `json:"label_id,omitempty"`
	OperatorUserID      string  `json:"operator_user_id"`
}

func RecordMaterialConsumption(ctx context.Context, pool *pgxpool.Pool, input RecordConsumptionInput) (*domain.MaterialConsumption, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.OperatorUserID)

	consumptionID := uuid.New().String()
	now := time.Now().UTC()
	var workCenterID string
	_ = tx.QueryRow(ctx, `SELECT work_center_id FROM wo_operation WHERE wo_operation_id = $1 AND wo_id = $2`, input.WOOperationID, input.WOID).Scan(&workCenterID)

	_, err = tx.Exec(ctx, `
		INSERT INTO material_consumption (consumption_id, wo_id, wo_operation_id, component_revision_id, qty_consumed, uom, source, label_id, consumed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, consumptionID, input.WOID, input.WOOperationID, input.ComponentRevisionID, input.QtyConsumed, input.UOM, input.Source, input.LabelID, now)
	if err != nil {
		return nil, fmt.Errorf("failed to insert material_consumption: %w", err)
	}

	env := sharedkernel.CreateEventEnvelope(
		"MES.Execution.MaterialConsumed.v1",
		"mes-execution-service",
		"",
		map[string]interface{}{
			"consumption_id":        consumptionID,
			"wo_id":                 input.WOID,
			"wo_operation_id":       input.WOOperationID,
			"work_center_id":        workCenterID,
			"component_revision_id": input.ComponentRevisionID,
			"qty_consumed":          input.QtyConsumed,
			"uom":                   input.UOM,
			"source":                input.Source,
			"label_id":              input.LabelID,
			"consumed_at":           now.Format(time.RFC3339Nano),
		},
	)
	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.MaterialConsumed.v1", env); err != nil {
		return nil, fmt.Errorf("failed to write outbox event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &domain.MaterialConsumption{
		ConsumptionID:       consumptionID,
		WOID:                input.WOID,
		WOOperationID:       input.WOOperationID,
		ComponentRevisionID: input.ComponentRevisionID,
		QtyConsumed:         input.QtyConsumed,
		UOM:                 input.UOM,
		Source:              input.Source,
		LabelID:             input.LabelID,
		ConsumedAt:          now,
	}, nil
}
