package usecase

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/domain"
)

func ComputeAndCheck(ctx context.Context, pool *pgxpool.Pool, woID string) (domain.ComputeResult, error) {
	var quantity float64
	var plannedStartAt time.Time
	err := pool.QueryRow(ctx, `SELECT quantity, planned_start_at FROM wo_header WHERE wo_id = $1`, woID).Scan(&quantity, &plannedStartAt)
	if err != nil {
		return domain.ComputeResult{}, fmt.Errorf("work order not found: %w", err)
	}

	rows, err := pool.Query(ctx, `
		SELECT sequence_no, operation_code, work_center_id, standard_setup_time_min, standard_cycle_time_sec, standard_efficiency_factor
		FROM wo_operation WHERE wo_id = $1 ORDER BY sequence_no
	`, woID)
	if err != nil {
		return domain.ComputeResult{}, err
	}
	defer rows.Close()

	type opInfo struct {
		seq   int
		code  string
		wcID  string
		setup float64
		cycle float64
		eff   float64
	}
	var ops []opInfo
	for rows.Next() {
		var o opInfo
		var setup, cycle, eff *float64
		_ = rows.Scan(&o.seq, &o.code, &o.wcID, &setup, &cycle, &eff)
		o.setup = 15.0
		if setup != nil {
			o.setup = *setup
		}
		o.cycle = 45.0
		if cycle != nil {
			o.cycle = *cycle
		}
		o.eff = 1.0
		if eff != nil && *eff > 0 {
			o.eff = *eff
		}
		ops = append(ops, o)
	}
	rows.Close()

	currentTime := plannedStartAt
	plannedStartStr := plannedStartAt.UTC().Format(time.RFC3339)
	computedOps := make([]domain.ComputedOpResult, 0, len(ops))
	capacityWarnings := []string{}

	for _, o := range ops {
		runTimeMinutes := (o.cycle / 60.0) * (quantity / o.eff)
		durationMinutes := int(math.Ceil(o.setup + runTimeMinutes))

		opStart := currentTime.UTC().Format(time.RFC3339)
		currentTime = currentTime.Add(time.Duration(durationMinutes) * time.Minute)
		opEnd := currentTime.UTC().Format(time.RFC3339)

		var calID string
		_ = pool.QueryRow(ctx, `
			SELECT master_id FROM rm_resource_calendar
			WHERE work_center_id = $1 AND available_from <= $2 AND available_to >= $3
		`, o.wcID, opStart, opEnd).Scan(&calID)
		if calID == "" {
			capacityWarnings = append(capacityWarnings, fmt.Sprintf("Operation %s (Seq %d): Work Center calendar has no pre-scheduled availability window for %s to %s", o.code, o.seq, opStart, opEnd))
		}

		computedOps = append(computedOps, domain.ComputedOpResult{
			SequenceNo:      o.seq,
			OperationCode:   o.code,
			WorkCenterID:    o.wcID,
			DurationMinutes: durationMinutes,
			PlannedStartAt:  opStart,
			PlannedEndAt:    opEnd,
		})
	}

	totalDurationMinutes := int(math.Ceil(currentTime.Sub(plannedStartAt).Minutes()))

	return domain.ComputeResult{
		WOID:                 woID,
		TotalDurationMinutes: totalDurationMinutes,
		PlannedStartAt:       plannedStartStr,
		PlannedEndAt:         currentTime.UTC().Format(time.RFC3339),
		Operations:           computedOps,
		CapacityWarnings:     capacityWarnings,
	}, nil
}
