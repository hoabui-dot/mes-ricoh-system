package usecase

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/mom-platform/mes-traceability-service/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ResolvePolicyUseCase struct {
	pool *pgxpool.Pool
}

func NewResolvePolicyUseCase(pool *pgxpool.Pool) *ResolvePolicyUseCase {
	return &ResolvePolicyUseCase{pool: pool}
}

type ResolvePolicyInput struct {
	ItemRevisionID uuid.UUID `json:"item_revision_id"`
	OperationCode  string    `json:"operation_code"`
}

type ResolvePolicyOutput struct {
	Policy *domain.TraceabilityPolicy `json:"policy"`
	Rule   *domain.NumberingRule      `json:"numbering_rule,omitempty"`
	Split  *domain.QRSplitRule        `json:"qr_split_rule,omitempty"`
}

func (uc *ResolvePolicyUseCase) Execute(ctx context.Context, input ResolvePolicyInput) (*ResolvePolicyOutput, error) {
	query := `
		SELECT policy_id, item_revision_id, operation_code, tracking_type,
		       numbering_rule_id, qr_split_rule_id, label_template_id, site_id, created_at, updated_at
		FROM md_traceability_policy
		WHERE item_revision_id = $1 AND operation_code = $2
	`

	var p domain.TraceabilityPolicy
	var numRuleID, splitRuleID, tplID sql.NullString

	err := uc.pool.QueryRow(ctx, query, input.ItemRevisionID, input.OperationCode).Scan(
		&p.PolicyID, &p.ItemRevisionID, &p.OperationCode, &p.TrackingType,
		&numRuleID, &splitRuleID, &tplID, &p.SiteID, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("no traceability policy found for item_revision_id=%s, op=%s", input.ItemRevisionID, input.OperationCode)
		}
		return nil, fmt.Errorf("failed to query policy: %w", err)
	}

	if numRuleID.Valid {
		id, _ := uuid.Parse(numRuleID.String)
		p.NumberingRuleID = &id
	}
	if splitRuleID.Valid {
		id, _ := uuid.Parse(splitRuleID.String)
		p.QRSplitRuleID = &id
	}
	if tplID.Valid {
		id, _ := uuid.Parse(tplID.String)
		p.LabelTemplateID = &id
	}

	out := &ResolvePolicyOutput{Policy: &p}

	if p.NumberingRuleID != nil {
		var nr domain.NumberingRule
		nrErr := uc.pool.QueryRow(ctx, `
			SELECT rule_id, rule_code, prefix, date_format, sequence_length, reset_frequency, site_id, created_at, updated_at
			FROM md_numbering_rule WHERE rule_id = $1
		`, *p.NumberingRuleID).Scan(
			&nr.RuleID, &nr.RuleCode, &nr.Prefix, &nr.DateFormat, &nr.SequenceLength, &nr.ResetFrequency, &nr.SiteID, &nr.CreatedAt, &nr.UpdatedAt,
		)
		if nrErr == nil {
			out.Rule = &nr
		}
	}

	if p.QRSplitRuleID != nil {
		var sr domain.QRSplitRule
		srErr := uc.pool.QueryRow(ctx, `
			SELECT split_rule_id, rule_code, split_algorithm, default_yield_ratio::text, target_uom_id, site_id, created_at, updated_at
			FROM md_qr_split_rule WHERE split_rule_id = $1
		`, *p.QRSplitRuleID).Scan(
			&sr.SplitRuleID, &sr.RuleCode, &sr.SplitAlgorithm, &sr.DefaultYieldRatio, &sr.TargetUOMID, &sr.SiteID, &sr.CreatedAt, &sr.UpdatedAt,
		)
		if srErr == nil {
			out.Split = &sr
		}
	}

	return out, nil
}
