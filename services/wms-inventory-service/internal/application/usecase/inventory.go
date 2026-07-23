package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInsufficientStagingStock = errors.New("INSUFFICIENT_STAGING_STOCK")

type ReceiptInput struct {
	LotCode        string  `json:"lot_code"`
	ItemRevisionID string  `json:"item_revision_id"`
	LocationID     string  `json:"location_id"`
	Qty            float64 `json:"qty"`
	UOMCode        string  `json:"uom_code"`
	ExpiryDate     *string `json:"expiry_date,omitempty"`
	CreatedBy      string  `json:"created_by,omitempty"`
}

type TransferLine struct {
	LotID        string  `json:"lot_id"`
	FromLocation string  `json:"from_location_id"`
	ToLocation   string  `json:"to_location_id"`
	Qty          float64 `json:"qty"`
	ExpiryDate   *string `json:"expiry_date,omitempty"`
}

type TransferInput struct {
	ItemRevisionID string  `json:"item_revision_id"`
	FromPurpose    string  `json:"from_purpose,omitempty"`
	ToLocationID   string  `json:"to_location_id"`
	Qty            float64 `json:"qty"`
	WOID           string  `json:"wo_id"`
	WorkCenterRef  string  `json:"work_center_ref"`
	CreatedBy      string  `json:"created_by,omitempty"`
}

type TransferOutput struct {
	TransferredQty float64        `json:"transferred_qty"`
	Lines          []TransferLine `json:"lines"`
}

type BalanceRow struct {
	LotID      string  `json:"lot_id"`
	LotCode    string  `json:"lot_code"`
	LocationID string  `json:"location_id"`
	OnHandQty  float64 `json:"on_hand_qty"`
	ExpiryDate *string `json:"expiry_date,omitempty"`
	Status     string  `json:"status"`
}

type MovementRow struct {
	MovementID     string  `json:"movement_id"`
	MovementType   string  `json:"movement_type"`
	LotID          string  `json:"lot_id"`
	LotCode        string  `json:"lot_code"`
	ItemRevisionID string  `json:"item_revision_id"`
	FromLocationID *string `json:"from_location_id,omitempty"`
	ToLocationID   *string `json:"to_location_id,omitempty"`
	Qty            float64 `json:"qty"`
	WOID           *string `json:"wo_id,omitempty"`
	WorkCenterRef  *string `json:"work_center_ref,omitempty"`
	OccurredAt     string  `json:"occurred_at"`
}

func CreateReceipt(ctx context.Context, pool *pgxpool.Pool, input ReceiptInput) (string, error) {
	if input.Qty <= 0 || input.LotCode == "" || input.ItemRevisionID == "" || input.LocationID == "" || input.UOMCode == "" {
		return "", fmt.Errorf("lot_code, item_revision_id, location_id, qty, and uom_code are required")
	}
	var purpose string
	if err := pool.QueryRow(ctx, `SELECT location_purpose FROM rm_storage_location WHERE location_id = $1`, input.LocationID).Scan(&purpose); err != nil {
		return "", fmt.Errorf("LOCATION_NOT_FOUND_IN_INVENTORY_READ_MODEL: %w", err)
	}
	if purpose != "Storage" {
		return "", fmt.Errorf("RECEIPT_LOCATION_MUST_BE_STORAGE")
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var expiry any
	if input.ExpiryDate != nil && *input.ExpiryDate != "" {
		parsed, err := time.Parse("2006-01-02", *input.ExpiryDate)
		if err != nil {
			return "", fmt.Errorf("invalid expiry_date: %w", err)
		}
		expiry = parsed
	}

	lotID := uuid.New().String()
	if _, err := tx.Exec(ctx, `
		INSERT INTO inv_lot (lot_id, lot_code, item_revision_id, received_at, expiry_date, original_qty, uom_code)
		VALUES ($1, $2, $3, NOW(), $4, $5, $6)
	`, lotID, input.LotCode, input.ItemRevisionID, expiry, input.Qty, input.UOMCode); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO inv_stock_movement (movement_type, lot_id, to_location_id, qty, created_by)
		VALUES ('RECEIPT', $1, $2, $3, NULLIF($4, '')::uuid)
	`, lotID, input.LocationID, input.Qty, input.CreatedBy); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO inv_balance (lot_id, location_id, on_hand_qty)
		VALUES ($1, $2, $3)
		ON CONFLICT (lot_id, location_id) DO UPDATE
		SET on_hand_qty = inv_balance.on_hand_qty + EXCLUDED.on_hand_qty,
		    row_version = inv_balance.row_version + 1,
		    updated_at = NOW()
	`, lotID, input.LocationID, input.Qty); err != nil {
		return "", err
	}
	return lotID, tx.Commit(ctx)
}

func TransferToStaging(ctx context.Context, pool *pgxpool.Pool, input TransferInput) (*TransferOutput, error) {
	if input.Qty <= 0 || input.ItemRevisionID == "" || input.ToLocationID == "" || input.WOID == "" || input.WorkCenterRef == "" {
		return nil, fmt.Errorf("item_revision_id, to_location_id, qty, wo_id, and work_center_ref are required")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT b.lot_id, b.location_id, b.on_hand_qty::float8, l.expiry_date::text
		FROM inv_balance b
		JOIN inv_lot l ON l.lot_id = b.lot_id
		JOIN rm_storage_location loc ON loc.location_id = b.location_id
		WHERE l.item_revision_id = $1
		  AND l.status = 'Active'
		  AND b.on_hand_qty > 0
		  AND loc.location_purpose = 'Storage'
		  AND (l.expiry_date IS NULL OR l.expiry_date > CURRENT_DATE)
		ORDER BY l.expiry_date ASC NULLS LAST, l.received_at ASC
		FOR UPDATE OF b
	`, input.ItemRevisionID)
	if err != nil {
		return nil, err
	}
	type sourceBalance struct {
		lotID        string
		fromLocation string
		available    float64
		expiry       *string
	}
	sources := make([]sourceBalance, 0)
	for rows.Next() {
		var source sourceBalance
		if err := rows.Scan(&source.lotID, &source.fromLocation, &source.available, &source.expiry); err != nil {
			rows.Close()
			return nil, err
		}
		sources = append(sources, source)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	remaining := input.Qty
	out := &TransferOutput{Lines: make([]TransferLine, 0)}
	for _, source := range sources {
		if remaining <= 0 {
			break
		}
		moveQty := source.available
		if moveQty > remaining {
			moveQty = remaining
		}
		if err := moveLot(ctx, tx, source.lotID, source.fromLocation, input.ToLocationID, moveQty, input.WOID, input.WorkCenterRef, input.CreatedBy); err != nil {
			return nil, err
		}
		out.TransferredQty += moveQty
		out.Lines = append(out.Lines, TransferLine{LotID: source.lotID, FromLocation: source.fromLocation, ToLocation: input.ToLocationID, Qty: moveQty, ExpiryDate: source.expiry})
		remaining -= moveQty
	}
	if remaining > 0.000001 {
		return nil, fmt.Errorf("INSUFFICIENT_STOCK_FOR_TRANSFER")
	}
	return out, tx.Commit(ctx)
}

func ConsumeFromStaging(ctx context.Context, pool *pgxpool.Pool, itemRevisionID, stagingLocationID, woID, workCenterRef string, qty float64) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT b.lot_id, b.on_hand_qty::float8
		FROM inv_balance b
		JOIN inv_lot l ON l.lot_id = b.lot_id
		WHERE b.location_id = $1
		  AND l.item_revision_id = $2
		  AND l.status = 'Active'
		  AND b.on_hand_qty > 0
		  AND (l.expiry_date IS NULL OR l.expiry_date > CURRENT_DATE)
		ORDER BY l.expiry_date ASC NULLS LAST, l.received_at ASC
		FOR UPDATE OF b
	`, stagingLocationID, itemRevisionID)
	if err != nil {
		return err
	}
	type stagingBalance struct {
		lotID     string
		available float64
	}
	staged := make([]stagingBalance, 0)
	for rows.Next() {
		var row stagingBalance
		if err := rows.Scan(&row.lotID, &row.available); err != nil {
			rows.Close()
			return err
		}
		staged = append(staged, row)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	remaining := qty
	consumed := 0.0
	for _, row := range staged {
		if remaining <= 0 {
			break
		}
		moveQty := row.available
		if moveQty > remaining {
			moveQty = remaining
		}
		if _, err := tx.Exec(ctx, `UPDATE inv_balance SET on_hand_qty = on_hand_qty - $1, row_version = row_version + 1, updated_at = NOW() WHERE lot_id = $2 AND location_id = $3`, moveQty, row.lotID, stagingLocationID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO inv_stock_movement (movement_type, lot_id, from_location_id, qty, wo_id, work_center_ref)
			VALUES ('CONSUMPTION', $1, $2, $3, NULLIF($4, '')::uuid, NULLIF($5, '')::uuid)
		`, row.lotID, stagingLocationID, moveQty, woID, workCenterRef); err != nil {
			return err
		}
		consumed += moveQty
		remaining -= moveQty
	}
	if remaining > 0.000001 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO inv_discrepancy_log
			  (discrepancy_type, item_revision_id, location_id, requested_qty, consumed_qty, shortage_qty, wo_id, work_center_ref, detail)
			VALUES ('STAGING_OVER_CONSUMPTION', $1, $2, $3, $4, $5, NULLIF($6, '')::uuid, NULLIF($7, '')::uuid,
			        jsonb_build_object('reason', 'MaterialConsumed exceeded active staging on-hand'))
		`, itemRevisionID, stagingLocationID, qty, consumed, remaining, woID, workCenterRef); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	return tx.Commit(ctx)
}

func ListBalances(ctx context.Context, pool *pgxpool.Pool, itemRevisionID, locationID string) ([]BalanceRow, error) {
	rows, err := pool.Query(ctx, `
		SELECT l.lot_id, l.lot_code, b.location_id, b.on_hand_qty::float8, l.expiry_date::text, l.status
		FROM inv_balance b
		JOIN inv_lot l ON l.lot_id = b.lot_id
		WHERE (NULLIF($1, '')::uuid IS NULL OR l.item_revision_id = NULLIF($1, '')::uuid)
		  AND (NULLIF($2, '')::uuid IS NULL OR b.location_id = NULLIF($2, '')::uuid)
		ORDER BY l.expiry_date ASC NULLS LAST, l.lot_code
	`, itemRevisionID, locationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]BalanceRow, 0)
	for rows.Next() {
		var row BalanceRow
		if err := rows.Scan(&row.LotID, &row.LotCode, &row.LocationID, &row.OnHandQty, &row.ExpiryDate, &row.Status); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func ListMovements(ctx context.Context, pool *pgxpool.Pool, locationID, lotID string, limit int) ([]MovementRow, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := pool.Query(ctx, `
		SELECT m.movement_id::text,
		       m.movement_type,
		       m.lot_id::text,
		       l.lot_code,
		       l.item_revision_id::text,
		       m.from_location_id::text,
		       m.to_location_id::text,
		       m.qty::float8,
		       m.wo_id::text,
		       m.work_center_ref::text,
		       m.occurred_at::text
		FROM inv_stock_movement m
		JOIN inv_lot l ON l.lot_id = m.lot_id
		WHERE (NULLIF($1, '')::uuid IS NULL OR m.from_location_id = NULLIF($1, '')::uuid OR m.to_location_id = NULLIF($1, '')::uuid)
		  AND (NULLIF($2, '')::uuid IS NULL OR m.lot_id = NULLIF($2, '')::uuid)
		ORDER BY m.occurred_at DESC, m.movement_id DESC
		LIMIT $3
	`, locationID, lotID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]MovementRow, 0)
	for rows.Next() {
		var row MovementRow
		if err := rows.Scan(
			&row.MovementID,
			&row.MovementType,
			&row.LotID,
			&row.LotCode,
			&row.ItemRevisionID,
			&row.FromLocationID,
			&row.ToLocationID,
			&row.Qty,
			&row.WOID,
			&row.WorkCenterRef,
			&row.OccurredAt,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func moveLot(ctx context.Context, tx pgx.Tx, lotID, fromLocation, toLocation string, qty float64, woID, workCenterRef, createdBy string) error {
	if _, err := tx.Exec(ctx, `UPDATE inv_balance SET on_hand_qty = on_hand_qty - $1, row_version = row_version + 1, updated_at = NOW() WHERE lot_id = $2 AND location_id = $3`, qty, lotID, fromLocation); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO inv_balance (lot_id, location_id, on_hand_qty)
		VALUES ($1, $2, $3)
		ON CONFLICT (lot_id, location_id) DO UPDATE
		SET on_hand_qty = inv_balance.on_hand_qty + EXCLUDED.on_hand_qty,
		    row_version = inv_balance.row_version + 1,
		    updated_at = NOW()
	`, lotID, toLocation, qty); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO inv_stock_movement (movement_type, lot_id, from_location_id, to_location_id, qty, wo_id, work_center_ref, created_by)
		VALUES ('TRANSFER_TO_STAGING', $1, $2, $3, $4, NULLIF($5, '')::uuid, NULLIF($6, '')::uuid, NULLIF($7, '')::uuid)
	`, lotID, fromLocation, toLocation, qty, woID, workCenterRef, createdBy)
	return err
}
