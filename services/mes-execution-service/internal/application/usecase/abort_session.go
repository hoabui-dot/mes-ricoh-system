package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AbortSessionInput struct {
	SessionID      string `json:"session_id"`
	OperatorUserID string `json:"operator_user_id"`
}

func AbortSession(ctx context.Context, pool *pgxpool.Pool, input AbortSessionInput) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.OperatorUserID)

	now := time.Now().UTC()
	res, err := tx.Exec(ctx, `
		UPDATE execution_session
		SET status = 'ABORTED', ended_at = $1
		WHERE session_id = $2 AND status = 'IN_PROGRESS'
	`, now, input.SessionID)
	if err != nil {
		return fmt.Errorf("failed to abort session: %w", err)
	}

	if res.RowsAffected() == 0 {
		return fmt.Errorf("session %s not found or not IN_PROGRESS", input.SessionID)
	}

	return tx.Commit(ctx)
}
