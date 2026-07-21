package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/mom-platform/mes-traceability-service/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/shared-kernel-go"
)

type SplitLabelUseCase struct {
	pool *pgxpool.Pool
}

func NewSplitLabelUseCase(pool *pgxpool.Pool) *SplitLabelUseCase {
	return &SplitLabelUseCase{pool: pool}
}

type SplitPieceInput struct {
	Quantity float64   `json:"quantity"`
	UOMID    uuid.UUID `json:"uom_id"`
}

type SplitLabelInput struct {
	ParentLabelID      uuid.UUID         `json:"parent_label_id"`
	TargetItemRevID    uuid.UUID         `json:"target_item_revision_id"`
	OperationCode      string            `json:"operation_code"`
	Pieces             []SplitPieceInput `json:"pieces"`
	WOID               *uuid.UUID        `json:"wo_id,omitempty"`
	SiteID             uuid.UUID         `json:"site_id"`
	IdempotencyKey     string            `json:"idempotency_key,omitempty"`
	UserID             string            `json:"user_id"`
}

type SplitLabelOutput struct {
	ParentLabel  *domain.LabelInstance  `json:"parent_label"`
	ChildLabels  []domain.LabelInstance `json:"child_labels"`
	GenealogyIDs []uuid.UUID            `json:"genealogy_event_ids"`
}

func (uc *SplitLabelUseCase) Execute(ctx context.Context, input SplitLabelInput) (*SplitLabelOutput, error) {
	tx, err := uc.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to start tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Check Idempotency Key
	if input.IdempotencyKey != "" {
		rows, err := tx.Query(ctx, `
			SELECT label_id, label_code, item_revision_id, lot_or_serial_no, parent_label_id, quantity, uom_id, status, created_by_operation, site_id, created_at, updated_at
			FROM label_instance WHERE idempotency_key = $1 OR idempotency_key LIKE $1 || '-%'
		`, input.IdempotencyKey)
		if err == nil {
			var children []domain.LabelInstance
			for rows.Next() {
				var c domain.LabelInstance
				var parentID sqlNullUUID
				rows.Scan(&c.LabelID, &c.LabelCode, &c.ItemRevisionID, &c.LotOrSerialNo, &parentID, &c.Quantity, &c.UOMID, &c.Status, &c.CreatedByOperation, &c.SiteID, &c.CreatedAt, &c.UpdatedAt)
				if parentID.Valid {
					c.ParentLabelID = &parentID.UUID
				}
				children = append(children, c)
			}
			rows.Close()
			if len(children) > 0 {
				// Fetch parent
				var parent domain.LabelInstance
				tx.QueryRow(ctx, `SELECT label_id, label_code, quantity, status FROM label_instance WHERE label_id = $1`, input.ParentLabelID).Scan(&parent.LabelID, &parent.LabelCode, &parent.Quantity, &parent.Status)
				return &SplitLabelOutput{ParentLabel: &parent, ChildLabels: children}, nil
			}
		}
	}

	// Fetch parent label
	var parent domain.LabelInstance
	err = tx.QueryRow(ctx, `
		SELECT label_id, label_code, item_revision_id, lot_or_serial_no, quantity, uom_id, status, created_by_operation, site_id
		FROM label_instance WHERE label_id = $1 FOR UPDATE
	`, input.ParentLabelID).Scan(
		&parent.LabelID, &parent.LabelCode, &parent.ItemRevisionID, &parent.LotOrSerialNo,
		&parent.Quantity, &parent.UOMID, &parent.Status, &parent.CreatedByOperation, &parent.SiteID,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("parent label %s not found", input.ParentLabelID)
		}
		return nil, fmt.Errorf("failed to query parent label: %w", err)
	}

	if parent.Status != domain.LabelActive {
		return nil, fmt.Errorf("parent label %s is not ACTIVE (status=%s)", parent.LabelID, parent.Status)
	}

	// Calculate total requested quantity
	var totalReqQty float64
	for _, p := range input.Pieces {
		totalReqQty += p.Quantity
	}

	if totalReqQty > parent.Quantity {
		return nil, fmt.Errorf("total split quantity (%.6f) exceeds parent quantity (%.6f)", totalReqQty, parent.Quantity)
	}

	// Create child labels & genealogy events
	var childLabels []domain.LabelInstance
	var eventIDs []uuid.UUID

	now := time.Now().UTC()

	for idx, piece := range input.Pieces {
		childID := uuid.New()
		childCode := fmt.Sprintf("%s-C%d", parent.LabelCode, idx+1)
		idempKey := ""
		if input.IdempotencyKey != "" {
			idempKey = fmt.Sprintf("%s-%d", input.IdempotencyKey, idx+1)
		}

		child := domain.LabelInstance{
			LabelID:            childID,
			LabelCode:          childCode,
			ItemRevisionID:     input.TargetItemRevID,
			LotOrSerialNo:      parent.LotOrSerialNo,
			ParentLabelID:      &parent.LabelID,
			Quantity:           piece.Quantity,
			UOMID:              piece.UOMID,
			Status:             domain.LabelActive,
			CreatedByOperation: input.OperationCode,
			SiteID:             input.SiteID,
			CreatedAt:          now,
			UpdatedAt:          now,
		}

		var idempVal *string
		if idempKey != "" {
			idempVal = &idempKey
		}

		insertChild := `
			INSERT INTO label_instance (label_id, label_code, item_revision_id, lot_or_serial_no, parent_label_id, quantity, uom_id, status, created_by_operation, site_id, idempotency_key, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		`
		_, err = tx.Exec(ctx, insertChild,
			child.LabelID, child.LabelCode, child.ItemRevisionID, child.LotOrSerialNo, child.ParentLabelID,
			child.Quantity, child.UOMID, child.Status, child.CreatedByOperation, child.SiteID, idempVal, child.CreatedAt, child.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to insert child label: %w", err)
		}

		// Insert genealogy_event (SPLIT_FROM)
		gEventID := uuid.New()
		insertGenealogy := `
			INSERT INTO genealogy_event (event_id, label_id, related_label_id, relationship_type, operation_code, wo_id, occurred_at)
			VALUES ($1, $2, $3, 'SPLIT_FROM', $4, $5, $6)
		`
		_, err = tx.Exec(ctx, insertGenealogy, gEventID, child.LabelID, parent.LabelID, input.OperationCode, input.WOID, now)
		if err != nil {
			return nil, fmt.Errorf("failed to insert genealogy_event: %w", err)
		}

		childLabels = append(childLabels, child)
		eventIDs = append(eventIDs, gEventID)
	}

	// Update parent quantity / status
	remainingQty := parent.Quantity - totalReqQty
	newStatus := parent.Status
	if remainingQty <= 0 {
		newStatus = domain.LabelConsumed
	}

	updateParent := `UPDATE label_instance SET quantity = $1, status = $2, updated_at = $3 WHERE label_id = $4`
	_, err = tx.Exec(ctx, updateParent, remainingQty, newStatus, now, parent.LabelID)
	if err != nil {
		return nil, fmt.Errorf("failed to update parent label: %w", err)
	}

	parent.Quantity = remainingQty
	parent.Status = newStatus

	// Publish Outbox Event MES.Traceability.QRSplitPerformed.v1
	env := sharedkernel.CreateEventEnvelope(
		"MES.Traceability.QRSplitPerformed.v1",
		"mes-traceability-service",
		"",
		map[string]interface{}{
			"parent_label_id": parent.LabelID.String(),
			"parent_code":     parent.LabelCode,
			"remaining_qty":   remainingQty,
			"child_count":     len(childLabels),
			"operation_code":  input.OperationCode,
			"site_id":         input.SiteID.String(),
		},
	)

	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Traceability.QRSplitPerformed.v1", env); err != nil {
		return nil, fmt.Errorf("failed to write outbox event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit tx: %w", err)
	}

	return &SplitLabelOutput{
		ParentLabel:  &parent,
		ChildLabels:  childLabels,
		GenealogyIDs: eventIDs,
	}, nil
}

type sqlNullUUID struct {
	UUID  uuid.UUID
	Valid bool
}

func (n *sqlNullUUID) Scan(value interface{}) error {
	if value == nil {
		n.UUID, n.Valid = uuid.Nil, false
		return nil
	}
	n.Valid = true
	switch v := value.(type) {
	case string:
		u, err := uuid.Parse(v)
		if err != nil {
			return err
		}
		n.UUID = u
	case [16]byte:
		n.UUID = v
	default:
		return fmt.Errorf("cannot scan %T into NullUUID", value)
	}
	return nil
}
