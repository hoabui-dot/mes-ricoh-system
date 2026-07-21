package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/mom-platform/mes-traceability-service/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/shared-kernel-go"
)

type IssueLabelUseCase struct {
	pool *pgxpool.Pool
}

func NewIssueLabelUseCase(pool *pgxpool.Pool) *IssueLabelUseCase {
	return &IssueLabelUseCase{pool: pool}
}

type IssueLabelInput struct {
	ItemRevisionID     uuid.UUID `json:"item_revision_id"`
	OperationCode      string    `json:"operation_code"`
	Quantity           float64   `json:"quantity"`
	UOMID              uuid.UUID `json:"uom_id"`
	SiteID             uuid.UUID `json:"site_id"`
	LotOrSerialNo      string    `json:"lot_or_serial_no,omitempty"`
	CreatedByOperation string    `json:"created_by_operation"`
	UserID             string    `json:"user_id"`
}

func (uc *IssueLabelUseCase) Execute(ctx context.Context, input IssueLabelInput) (*domain.LabelInstance, error) {
	tx, err := uc.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to start tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Fetch numbering rule from policy
	var ruleID uuid.UUID
	var prefix, dateFormat, resetFreq string
	var seqLen int

	policyQuery := `
		SELECT r.rule_id, r.prefix, r.date_format, r.sequence_length, r.reset_frequency
		FROM md_traceability_policy p
		JOIN md_numbering_rule r ON p.numbering_rule_id = r.rule_id
		WHERE p.item_revision_id = $1 AND p.operation_code = $2
	`
	err = tx.QueryRow(ctx, policyQuery, input.ItemRevisionID, input.OperationCode).Scan(
		&ruleID, &prefix, &dateFormat, &seqLen, &resetFreq,
	)
	if err != nil {
		// Fallback to default prefix if no rule assigned
		prefix = "LBL"
		dateFormat = "YYYYMMDD"
		seqLen = 5
	}

	// Generate sequence key based on date format
	today := time.Now().UTC()
	var datePart string
	switch dateFormat {
	case "YYYYMMDD":
		datePart = today.Format("20060102")
	case "YYMMDD":
		datePart = today.Format("060102")
	default:
		datePart = today.Format("20060102")
	}

	seqKey := datePart

	// Atomic sequence increment using FOR UPDATE
	var currVal int
	upsertSeq := `
		INSERT INTO md_numbering_sequence (rule_id, sequence_key, current_value, updated_at)
		VALUES ($1, $2, 1, now())
		ON CONFLICT (rule_id, sequence_key)
		DO UPDATE SET current_value = md_numbering_sequence.current_value + 1, updated_at = now()
		RETURNING current_value
	`
	if ruleID != uuid.Nil {
		err = tx.QueryRow(ctx, upsertSeq, ruleID, seqKey).Scan(&currVal)
		if err != nil {
			return nil, fmt.Errorf("failed to increment atomic sequence: %w", err)
		}
	} else {
		currVal = int(time.Now().UnixNano() % 100000)
	}

	labelCode := fmt.Sprintf("%s-%s-%0*d", prefix, datePart, seqLen, currVal)
	if input.LotOrSerialNo == "" {
		input.LotOrSerialNo = fmt.Sprintf("LOT-%s", datePart)
	}

	lbl := domain.LabelInstance{
		LabelID:            uuid.New(),
		LabelCode:          labelCode,
		ItemRevisionID:     input.ItemRevisionID,
		LotOrSerialNo:      input.LotOrSerialNo,
		Quantity:           input.Quantity,
		UOMID:              input.UOMID,
		Status:             domain.LabelActive,
		CreatedByOperation: input.CreatedByOperation,
		SiteID:             input.SiteID,
		CreatedAt:          time.Now().UTC(),
		UpdatedAt:          time.Now().UTC(),
	}

	insertLabel := `
		INSERT INTO label_instance (label_id, label_code, item_revision_id, lot_or_serial_no, quantity, uom_id, status, created_by_operation, site_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	_, err = tx.Exec(ctx, insertLabel,
		lbl.LabelID, lbl.LabelCode, lbl.ItemRevisionID, lbl.LotOrSerialNo,
		lbl.Quantity, lbl.UOMID, lbl.Status, lbl.CreatedByOperation, lbl.SiteID, lbl.CreatedAt, lbl.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert label_instance: %w", err)
	}

	// Publish outbox event
	env := sharedkernel.CreateEventEnvelope(
		"MES.Traceability.LabelIssued.v1",
		"mes-traceability-service",
		"",
		map[string]interface{}{
			"label_id":             lbl.LabelID.String(),
			"label_code":           lbl.LabelCode,
			"item_revision_id":     lbl.ItemRevisionID.String(),
			"lot_or_serial_no":      lbl.LotOrSerialNo,
			"quantity":             lbl.Quantity,
			"uom_id":               lbl.UOMID.String(),
			"created_by_operation": lbl.CreatedByOperation,
			"site_id":              lbl.SiteID.String(),
		},
	)

	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Traceability.LabelIssued.v1", env); err != nil {
		return nil, fmt.Errorf("failed to write outbox event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit tx: %w", err)
	}

	return &lbl, nil
}
