package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/shared-kernel-go"
)

type ConsumeLabelUseCase struct {
	pool *pgxpool.Pool
}

func NewConsumeLabelUseCase(pool *pgxpool.Pool) *ConsumeLabelUseCase {
	return &ConsumeLabelUseCase{pool: pool}
}

type ConsumeLabelInput struct {
	LabelID        uuid.UUID  `json:"label_id"`
	TargetLabelID  *uuid.UUID `json:"target_label_id,omitempty"`
	OperationCode  string     `json:"operation_code"`
	WOID           *uuid.UUID `json:"wo_id,omitempty"`
	UserID         string     `json:"user_id"`
}

func (uc *ConsumeLabelUseCase) Execute(ctx context.Context, input ConsumeLabelInput) error {
	tx, err := uc.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to start tx: %w", err)
	}
	defer tx.Rollback(ctx)

	now := time.Now().UTC()

	// Update label status to CONSUMED
	updateLabel := `UPDATE label_instance SET status = 'CONSUMED', updated_at = $1 WHERE label_id = $2 AND status = 'ACTIVE'`
	res, err := tx.Exec(ctx, updateLabel, now, input.LabelID)
	if err != nil {
		return fmt.Errorf("failed to update label status: %w", err)
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("label %s not found or already consumed/scrapped", input.LabelID)
	}

	// Insert genealogy event CONSUMED_INTO
	gEventID := uuid.New()
	insertGenealogy := `
		INSERT INTO genealogy_event (event_id, label_id, related_label_id, relationship_type, operation_code, wo_id, occurred_at)
		VALUES ($1, $2, $3, 'CONSUMED_INTO', $4, $5, $6)
	`
	_, err = tx.Exec(ctx, insertGenealogy, gEventID, input.LabelID, input.TargetLabelID, input.OperationCode, input.WOID, now)
	if err != nil {
		return fmt.Errorf("failed to insert genealogy_event: %w", err)
	}

	// Publish Outbox Event MES.Traceability.GenealogyRecorded.v1
	env := sharedkernel.CreateEventEnvelope(
		"MES.Traceability.GenealogyRecorded.v1",
		"mes-traceability-service",
		"",
		map[string]interface{}{
			"event_id":          gEventID.String(),
			"label_id":          input.LabelID.String(),
			"related_label_id":  input.TargetLabelID,
			"relationship_type": "CONSUMED_INTO",
			"operation_code":    input.OperationCode,
			"wo_id":             input.WOID,
		},
	)

	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Traceability.GenealogyRecorded.v1", env); err != nil {
		return fmt.Errorf("failed to write outbox event: %w", err)
	}

	return tx.Commit(ctx)
}
