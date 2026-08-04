package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

func CheckAndCompleteWorkOrder(ctx context.Context, pool *pgxpool.Pool, woID, userID string) (bool, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, userID)

	// Check if all operations are Finished
	var unfinishedCount int
	err = tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM wo_operation WHERE wo_id = $1 AND status != 'Finished'
	`, woID).Scan(&unfinishedCount)
	if err != nil {
		return false, fmt.Errorf("failed to query wo_operation status: %w", err)
	}

	if unfinishedCount > 0 {
		return false, nil // Still pending operations
	}

	// Check if any open IN_PROGRESS sessions exist for this WO
	var openSessionCount int
	err = tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM execution_session s
		JOIN wo_operation op ON s.wo_operation_id = op.wo_operation_id
		WHERE op.wo_id = $1 AND s.status = 'IN_PROGRESS'
	`, woID).Scan(&openSessionCount)
	if err != nil {
		return false, fmt.Errorf("failed to query open sessions: %w", err)
	}

	if openSessionCount > 0 {
		return false, nil
	}
	var woCode, dispatchMode, siteID, productionLineID string
	var workCenterIDs []string
	if err := tx.QueryRow(ctx, `
		SELECT h.wo_code,h.dispatch_mode,h.site_id::text,COALESCE(h.selected_production_line_id::text,''),
		       COALESCE(array_agg(DISTINCT o.work_center_id::text),ARRAY[]::text[])
		FROM wo_header h JOIN wo_operation o ON o.wo_id=h.wo_id
		WHERE h.wo_id=$1 GROUP BY h.wo_id
	`, woID).Scan(&woCode, &dispatchMode, &siteID, &productionLineID, &workCenterIDs); err != nil {
		return false, err
	}

	// Update WO status to Completed
	now := time.Now().UTC()
	tag, err := tx.Exec(ctx, `
		UPDATE wo_header
		SET status = 'Completed', updated_by = $1, updated_at = $2, row_version = row_version + 1
		WHERE wo_id = $3 AND status = 'InProgress'
	`, userID, now, woID)
	if err != nil {
		return false, fmt.Errorf("failed to update wo_header status to Completed: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return false, nil
	}

	// Publish Outbox Event MES.Execution.WOCompleted.v1
	env := sharedkernel.CreateEventEnvelope(
		"MES.Execution.WOCompleted.v1",
		"mes-execution-service",
		"",
		map[string]interface{}{
			"wo_id":                       woID,
			"wo_code":                     woCode,
			"dispatch_mode":               dispatchMode,
			"site_id":                     siteID,
			"selected_production_line_id": productionLineID,
			"work_center_ids":             workCenterIDs,
			"completed_at":                now.Format(time.RFC3339Nano),
			"completed_by":                userID,
		},
	)
	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.WOCompleted.v1", env); err != nil {
		return false, fmt.Errorf("failed to write outbox event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return false, err
	}

	return true, nil
}
