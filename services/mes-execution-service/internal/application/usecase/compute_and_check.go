package usecase

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/domain"
)

func ComputeAndCheck(ctx context.Context, pool *pgxpool.Pool, woID string) (domain.ComputeResult, error) {
	var quantity float64
	var plannedStartAt time.Time
	var shiftID string
	err := pool.QueryRow(ctx, `SELECT quantity, planned_start_at, shift_id FROM wo_header WHERE wo_id = $1`, woID).Scan(&quantity, &plannedStartAt, &shiftID)
	if err != nil {
		return domain.ComputeResult{}, fmt.Errorf("work order not found: %w", err)
	}

	rows, err := pool.Query(ctx, `
		SELECT sequence_no, operation_id, operation_code, work_center_id, standard_setup_time_min, standard_cycle_time_sec, standard_efficiency_factor, base_quantity, standard_yield, queue_time_min, move_time_min, requires_output_label, units_per_label, label_count, print_copies, print_status
		FROM wo_operation WHERE wo_id = $1 ORDER BY sequence_no
	`, woID)
	if err != nil {
		return domain.ComputeResult{}, err
	}
	defer rows.Close()

	type opInfo struct {
		seq                     int
		operationID             string
		code                    string
		wcID                    string
		setup                   float64
		cycle                   float64
		eff                     float64
		base                    float64
		yield                   float64
		queue                   float64
		move                    float64
		requiresOutputLabel     bool
		unitsPerLabel           *float64
		labelCount, printCopies int
		printStatus             string
	}
	var ops []opInfo
	for rows.Next() {
		var o opInfo
		var setup, cycle, eff, base, yield, queue, move *float64
		if err := rows.Scan(&o.seq, &o.operationID, &o.code, &o.wcID, &setup, &cycle, &eff, &base, &yield, &queue, &move, &o.requiresOutputLabel, &o.unitsPerLabel, &o.labelCount, &o.printCopies, &o.printStatus); err != nil {
			return domain.ComputeResult{}, fmt.Errorf("SQL_SCAN_FAILED: wo_operation planning snapshot: %w", err)
		}
		if setup == nil || cycle == nil || eff == nil || base == nil || yield == nil {
			return domain.ComputeResult{}, fmt.Errorf("WO_PLANNING_SNAPSHOT_INCOMPLETE: operation %s is missing setup, cycle, efficiency, base quantity, or yield", o.code)
		}
		o.setup, o.cycle, o.eff, o.base, o.yield = *setup, *cycle, *eff, *base, *yield
		if queue != nil {
			o.queue = *queue
		}
		if move != nil {
			o.move = *move
		}
		if o.setup < 0 || o.cycle <= 0 || o.eff <= 0 || o.base <= 0 || o.yield <= 0 || o.yield > 1 {
			return domain.ComputeResult{}, fmt.Errorf("WO_PLANNING_SNAPSHOT_INVALID: operation %s contains invalid planning values", o.code)
		}
		ops = append(ops, o)
	}
	if err := rows.Err(); err != nil {
		return domain.ComputeResult{}, fmt.Errorf("SQL_SCAN_FAILED: wo_operation rows: %w", err)
	}
	rows.Close()
	if len(ops) == 0 {
		return domain.ComputeResult{}, fmt.Errorf("WO_ROUTING_SNAPSHOT_MISSING: work order has no executable operations")
	}

	currentTime := plannedStartAt
	plannedStartStr := plannedStartAt.UTC().Format(time.RFC3339)
	computedOps := make([]domain.ComputedOpResult, 0, len(ops))
	capacityWarnings := []string{}
	laborWarnings := []string{}
	laborShortages := []domain.LaborShortage{}
	laborAssignments := []domain.LaborAssignment{}
	var woStatus string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM wo_header WHERE wo_id = $1`, woID).Scan(&woStatus); err != nil {
		return domain.ComputeResult{}, fmt.Errorf("WO_HEADER_QUERY_FAILED: %w", err)
	}
	if woStatus != "Approved" && woStatus != "Released" && woStatus != "InProgress" && woStatus != "Completed" {
		if _, err := pool.Exec(ctx, `DELETE FROM wo_operation_labor_assignment WHERE wo_id = $1`, woID); err != nil {
			return domain.ComputeResult{}, fmt.Errorf("WO_LABOR_ASSIGNMENT_RESET_FAILED: %w", err)
		}
	}

	for _, o := range ops {
		runTimeMinutes := (o.cycle / 60.0) * ((quantity / o.base) / o.yield / o.eff)
		durationMinutes := int(math.Ceil(o.setup + runTimeMinutes + o.queue + o.move))

		opStart := currentTime.UTC().Format(time.RFC3339)
		currentTime = currentTime.Add(time.Duration(durationMinutes) * time.Minute)
		opEnd := currentTime.UTC().Format(time.RFC3339)

		var calID string
		calendarErr := pool.QueryRow(ctx, `
			SELECT master_id FROM rm_resource_calendar
			WHERE work_center_id = $1 AND available_from <= $2 AND available_to >= $3
		`, o.wcID, opStart, opEnd).Scan(&calID)
		if calendarErr != nil && calendarErr != pgx.ErrNoRows {
			return domain.ComputeResult{}, fmt.Errorf("WO_CALENDAR_QUERY_FAILED: operation %s: %w", o.code, calendarErr)
		}
		if calID == "" {
			capacityWarnings = append(capacityWarnings, fmt.Sprintf("Operation %s (Seq %d): Work Center calendar has no pre-scheduled availability window for %s to %s", o.code, o.seq, opStart, opEnd))
		}

		computedOps = append(computedOps, domain.ComputedOpResult{
			SequenceNo:             o.seq,
			OperationCode:          o.code,
			WorkCenterID:           o.wcID,
			DurationMinutes:        durationMinutes,
			PlannedStartAt:         opStart,
			PlannedEndAt:           opEnd,
			SetupTimeMinutes:       o.setup,
			CycleTimeSeconds:       o.cycle,
			BaseQuantity:           o.base,
			WorkOrderQuantity:      quantity,
			StandardYield:          o.yield,
			EfficiencyFactor:       o.eff,
			QueueTimeMinutes:       o.queue,
			MoveTimeMinutes:        o.move,
			CalculatedRunMinutes:   runTimeMinutes,
			CalculatedTotalMinutes: o.setup + runTimeMinutes + o.queue + o.move,
			OperationCycleCount:    quantity / o.base,
			ExpectedGoodQuantity:   quantity * o.yield,
			RequiresOutputLabel:    o.requiresOutputLabel,
			UnitsPerLabel:          o.unitsPerLabel,
			LabelCount:             o.labelCount,
			PrintCopies:            o.printCopies,
			PrintStatus:            o.printStatus,
		})

		reqRows, reqErr := pool.Query(ctx, `SELECT r.skill_id, s.code, r.minimum_level, r.required_persons, r.mandatory_flag
			FROM rm_operation_skill_requirement r JOIN rm_skill s ON s.master_id = r.skill_id WHERE r.operation_id = $1`, o.operationID)
		if reqErr != nil {
			return domain.ComputeResult{}, fmt.Errorf("WO_WORKER_READINESS_QUERY_FAILED: operation %s: %w", o.code, reqErr)
		}
		for reqRows.Next() {
			var skillID, skillCode, minLevel string
			var required int
			var mandatory bool
			if err := reqRows.Scan(&skillID, &skillCode, &minLevel, &required, &mandatory); err != nil {
				return domain.ComputeResult{}, fmt.Errorf("SQL_SCAN_FAILED: operation skill requirement: %w", err)
			}
			candidateRows, candidateErr := pool.Query(ctx, `SELECT e.master_id, e.code, e.name, es.level
				FROM rm_employee e JOIN rm_employee_skill es ON es.employee_id = e.master_id
				JOIN rm_employee_shift_schedule sh ON sh.employee_id = e.master_id
				WHERE es.skill_id = $1 AND e.employee_status = 'Active'
				  AND e.lifecycle_status = 'Released' AND e.default_work_center_id = $3
				  AND sh.work_center_id = $3 AND sh.shift_id = $4
				  AND sh.schedule_date = $2 AND sh.schedule_status = 'Scheduled'
				  AND COALESCE(NULLIF(regexp_replace(es.level, '[^0-9]', '', 'g'), '')::int, 0)
				      >= COALESCE(NULLIF(regexp_replace($5, '[^0-9]', '', 'g'), '')::int, 1)
				ORDER BY COALESCE(NULLIF(regexp_replace(es.level, '[^0-9]', '', 'g'), '')::int, 0) DESC, e.code ASC LIMIT $6`, skillID, plannedStartAt.UTC().Format("2006-01-02"), o.wcID, shiftID, minLevel, required)
			if candidateErr != nil {
				return domain.ComputeResult{}, fmt.Errorf("WO_WORKER_READINESS_QUERY_FAILED: operation %s skill %s: %w", o.code, skillCode, candidateErr)
			}
			count := 0
			for candidateRows.Next() {
				var employeeID, employeeCode, matchedLevel string
				var employeeName any
				if err := candidateRows.Scan(&employeeID, &employeeCode, &employeeName, &matchedLevel); err != nil {
					return domain.ComputeResult{}, fmt.Errorf("SQL_SCAN_FAILED: employee skill readiness: %w", err)
				}
				count++
				if _, err := pool.Exec(ctx, `INSERT INTO wo_operation_labor_assignment (wo_id, wo_operation_id, employee_id, skill_id, minimum_level, matched_level, mandatory_flag) SELECT $1, wo_operation_id, $2, $3, $4, $5, $6 FROM wo_operation WHERE wo_id = $1 AND sequence_no = $7 ON CONFLICT DO NOTHING`, woID, employeeID, skillID, minLevel, matchedLevel, mandatory, o.seq); err != nil {
					return domain.ComputeResult{}, fmt.Errorf("WO_LABOR_ASSIGNMENT_WRITE_FAILED: operation %s: %w", o.code, err)
				}
				laborAssignments = append(laborAssignments, domain.LaborAssignment{OperationCode: o.code, EmployeeCode: employeeCode, EmployeeName: employeeName, SkillCode: skillCode, MatchedLevel: matchedLevel, Status: "Proposed"})
			}
			if err := candidateRows.Err(); err != nil {
				return domain.ComputeResult{}, fmt.Errorf("WO_WORKER_READINESS_QUERY_FAILED: operation %s skill %s rows: %w", o.code, skillCode, err)
			}
			candidateRows.Close()
			if count < required {
				shortage := domain.LaborShortage{OperationCode: o.code, SkillCode: skillCode, RequiredPersons: required, EligiblePersons: count, Mandatory: mandatory}
				if mandatory {
					laborShortages = append(laborShortages, shortage)
				} else {
					laborWarnings = append(laborWarnings, fmt.Sprintf("Operation %s: optional skill %s short by %d", o.code, skillCode, required-count))
				}
			}
		}
		if err := reqRows.Err(); err != nil {
			return domain.ComputeResult{}, fmt.Errorf("WO_WORKER_READINESS_QUERY_FAILED: operation %s requirements: %w", o.code, err)
		}
		reqRows.Close()
	}

	totalDurationMinutes := int(math.Ceil(currentTime.Sub(plannedStartAt).Minutes()))

	return domain.ComputeResult{
		WOID:                 woID,
		TotalDurationMinutes: totalDurationMinutes,
		PlannedStartAt:       plannedStartStr,
		PlannedEndAt:         currentTime.UTC().Format(time.RFC3339),
		Operations:           computedOps,
		CapacityWarnings:     capacityWarnings,
		LaborWarnings:        laborWarnings,
		LaborShortages:       laborShortages,
		LaborAssignments:     laborAssignments,
	}, nil
}
