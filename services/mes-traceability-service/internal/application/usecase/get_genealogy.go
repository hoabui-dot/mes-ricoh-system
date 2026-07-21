package usecase

import (
	"context"
	"fmt"
	"github.com/mom-platform/mes-traceability-service/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GetGenealogyUseCase struct {
	pool *pgxpool.Pool
}

func NewGetGenealogyUseCase(pool *pgxpool.Pool) *GetGenealogyUseCase {
	return &GetGenealogyUseCase{pool: pool}
}

type GenealogyGraphOutput struct {
	TargetLabel *domain.LabelInstance   `json:"target_label"`
	Events      []domain.GenealogyEvent `json:"events"`
	Related     []domain.LabelInstance  `json:"related_labels"`
}

func (uc *GetGenealogyUseCase) Execute(ctx context.Context, labelID uuid.UUID) (*GenealogyGraphOutput, error) {
	var target domain.LabelInstance
	err := uc.pool.QueryRow(ctx, `
		SELECT label_id, label_code, item_revision_id, lot_or_serial_no, parent_label_id, quantity, uom_id, status, created_by_operation, site_id, created_at, updated_at
		FROM label_instance WHERE label_id = $1
	`, labelID).Scan(
		&target.LabelID, &target.LabelCode, &target.ItemRevisionID, &target.LotOrSerialNo,
		&target.ParentLabelID, &target.Quantity, &target.UOMID, &target.Status, &target.CreatedByOperation, &target.SiteID, &target.CreatedAt, &target.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("label %s not found: %w", labelID, err)
	}

	rows, err := uc.pool.Query(ctx, `
		SELECT event_id, label_id, related_label_id, relationship_type, operation_code, wo_id, occurred_at
		FROM genealogy_event
		WHERE label_id = $1 OR related_label_id = $1
		ORDER BY occurred_at ASC
	`, labelID)
	if err != nil {
		return nil, fmt.Errorf("failed to query genealogy events: %w", err)
	}
	defer rows.Close()

	var events []domain.GenealogyEvent
	relatedMap := make(map[uuid.UUID]bool)

	for rows.Next() {
		var g domain.GenealogyEvent
		var relID sqlNullUUID
		var woID sqlNullUUID
		rows.Scan(&g.EventID, &g.LabelID, &relID, &g.RelationshipType, &g.OperationCode, &woID, &g.OccurredAt)

		if relID.Valid {
			g.RelatedLabelID = &relID.UUID
			if relID.UUID != labelID {
				relatedMap[relID.UUID] = true
			}
		}
		if woID.Valid {
			g.WOID = &woID.UUID
		}
		if g.LabelID != labelID {
			relatedMap[g.LabelID] = true
		}

		events = append(events, g)
	}

	var related []domain.LabelInstance
	for relID := range relatedMap {
		var r domain.LabelInstance
		err := uc.pool.QueryRow(ctx, `
			SELECT label_id, label_code, item_revision_id, lot_or_serial_no, parent_label_id, quantity, uom_id, status, created_by_operation, site_id, created_at, updated_at
			FROM label_instance WHERE label_id = $1
		`, relID).Scan(
			&r.LabelID, &r.LabelCode, &r.ItemRevisionID, &r.LotOrSerialNo, &r.ParentLabelID, &r.Quantity, &r.UOMID, &r.Status, &r.CreatedByOperation, &r.SiteID, &r.CreatedAt, &r.UpdatedAt,
		)
		if err == nil {
			related = append(related, r)
		}
	}

	return &GenealogyGraphOutput{
		TargetLabel: &target,
		Events:      events,
		Related:     related,
	}, nil
}
