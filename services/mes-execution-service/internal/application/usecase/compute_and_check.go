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
		SELECT sequence_no, operation_id, operation_code, work_center_id, standard_setup_time_min, standard_cycle_time_sec, standard_efficiency_factor
		FROM wo_operation WHERE wo_id = $1 ORDER BY sequence_no
	`, woID)
	if err != nil {
		return domain.ComputeResult{}, err
	}
	defer rows.Close()

	type opInfo struct {
		seq         int
		operationID string
		code        string
		wcID        string
		setup       float64
		cycle       float64
		eff         float64
	}
	var ops []opInfo
	for rows.Next() {
		var o opInfo
		var setup, cycle, eff *float64
		_ = rows.Scan(&o.seq, &o.operationID, &o.code, &o.wcID, &setup, &cycle, &eff)
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
	laborWarnings := []string{}
	laborShortages := []domain.LaborShortage{}
	laborAssignments := []domain.LaborAssignment{}
	var woStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM wo_header WHERE wo_id = $1`, woID).Scan(&woStatus)
	if woStatus != "Approved" && woStatus != "Released" && woStatus != "InProgress" && woStatus != "Completed" {
		_, _ = pool.Exec(ctx, `DELETE FROM wo_operation_labor_assignment WHERE wo_id = $1`, woID)
	}

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

		reqRows, reqErr := pool.Query(ctx, `SELECT r.skill_id, s.code, r.minimum_level, r.required_persons, r.mandatory_flag
			FROM rm_operation_skill_requirement r JOIN rm_skill s ON s.master_id = r.skill_id WHERE r.operation_id = $1`, o.operationID)
		if reqErr != nil {
			laborWarnings = append(laborWarnings, fmt.Sprintf("Operation %s: labor read model unavailable", o.code))
			continue
		}
		for reqRows.Next() {
			var skillID, skillCode, minLevel string
			var required int
			var mandatory bool
			if reqRows.Scan(&skillID, &skillCode, &minLevel, &required, &mandatory) != nil {
				continue
			}
			candidateRows, candidateErr := pool.Query(ctx, `SELECT e.master_id, e.code, e.name, es.level
				FROM rm_employee e JOIN rm_employee_skill es ON es.employee_id = e.master_id
				JOIN rm_employee_shift_schedule sh ON sh.employee_id = e.master_id
				WHERE es.skill_id = $1 AND e.employee_status = 'Active' AND sh.schedule_date = $2 AND sh.schedule_status = 'Scheduled'
				ORDER BY (e.default_work_center_id = $3) DESC, es.level ASC, e.code ASC LIMIT $4`, skillID, plannedStartAt.UTC().Format("2006-01-02"), o.wcID, required)
			if candidateErr != nil {
				laborWarnings = append(laborWarnings, fmt.Sprintf("Operation %s: skill %s matching unavailable", o.code, skillCode))
				continue
			}
			count := 0
			for candidateRows.Next() {
				var employeeID, employeeCode, matchedLevel string
				var employeeName any
				if candidateRows.Scan(&employeeID, &employeeCode, &employeeName, &matchedLevel) != nil {
					continue
				}
				count++
				_, _ = pool.Exec(ctx, `INSERT INTO wo_operation_labor_assignment (wo_id, wo_operation_id, employee_id, skill_id, minimum_level, matched_level, mandatory_flag) SELECT $1, wo_operation_id, $2, $3, $4, $5, $6 FROM wo_operation WHERE wo_id = $1 AND sequence_no = $7 ON CONFLICT DO NOTHING`, woID, employeeID, skillID, minLevel, matchedLevel, mandatory, o.seq)
				laborAssignments = append(laborAssignments, domain.LaborAssignment{OperationCode: o.code, EmployeeCode: employeeCode, EmployeeName: employeeName, SkillCode: skillCode, MatchedLevel: matchedLevel, Status: "Proposed"})
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
