package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

var masterDataApprovalClient = &http.Client{Timeout: 5 * time.Second}

var masterDataApprovalBreaker = sharedkernel.NewCircuitBreaker(sharedkernel.CircuitBreakerConfig{
	Name:       "MasterDataApprovalGate",
	Dependency: "mes-master-data-service",
})

type ApproveWOInput struct {
	WOID                 string
	Action               string // "Approve" or "Reject"
	Comment              string
	UserID               string
	RoleCode             string
	TraceID              string
	MasterDataServiceURL string
}

func ApproveWorkOrder(ctx context.Context, pool *pgxpool.Pool, input ApproveWOInput) (map[string]interface{}, error) {
	if input.MasterDataServiceURL == "" {
		input.MasterDataServiceURL = "http://mes-master-data-service:3020"
	}

	var pvID, currentStatus string
	err := pool.QueryRow(ctx, `SELECT production_version_id, status FROM wo_header WHERE wo_id = $1`, input.WOID).Scan(&pvID, &currentStatus)
	if err != nil {
		return nil, fmt.Errorf("work order not found: %w", err)
	}

	if input.Action == "Reject" {
		tx, err := pool.Begin(ctx)
		if err != nil {
			return nil, err
		}
		defer tx.Rollback(ctx)

		_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.UserID)
		_, err = tx.Exec(ctx, `UPDATE wo_header SET status = 'Cancelled', updated_by = $1, updated_at = NOW() WHERE wo_id = $2`, input.UserID, input.WOID)
		if err != nil {
			return nil, err
		}

		comment := "Rejected"
		if input.Comment != "" {
			comment = input.Comment
		}
		_, _ = tx.Exec(ctx, `INSERT INTO wo_approval_log (wo_id, action, actor_user_id, actor_role_code, comment) VALUES ($1, 'Rejected', $2, $3, $4)`, input.WOID, input.UserID, input.RoleCode, comment)

		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return map[string]interface{}{"wo_id": input.WOID, "status": "Cancelled"}, nil
	}

	// 1. Circuit-breaker guarded freshness re-check call to mes-master-data-service
	_, err = masterDataApprovalBreaker.Execute(func() (interface{}, error) {
		reqURL := fmt.Sprintf("%s/api/mes/master-data/production-versions/%s", input.MasterDataServiceURL, pvID)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			return nil, err
		}
		if input.UserID != "" {
			req.Header.Set("X-User-ID", input.UserID)
		}
		if input.RoleCode != "" {
			req.Header.Set("X-Role-Code", input.RoleCode)
		}
		if input.TraceID != "" {
			req.Header.Set("X-Trace-ID", input.TraceID)
		}
		resp, err := masterDataApprovalClient.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			var pvRes struct {
				LifecycleStatus string `json:"lifecycle_status"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&pvRes); err == nil && pvRes.LifecycleStatus != "" {
				if pvRes.LifecycleStatus != "Released" {
					return nil, fmt.Errorf("production version %s is no longer Released (status: %s)", pvID, pvRes.LifecycleStatus)
				}
			}
		}
		if resp.StatusCode >= http.StatusInternalServerError {
			return nil, fmt.Errorf("master-data freshness check failed: %s", resp.Status)
		}
		return nil, nil
	})
	if err != nil {
		if sharedkernel.IsCircuitBreakerOpen(err) {
			return nil, sharedkernel.NewRetryableDependencyError("mes-master-data-service", fmt.Errorf("approval gate circuit breaker open: %w", err))
		}
		return nil, sharedkernel.NewRetryableDependencyError("mes-master-data-service", fmt.Errorf("approval gate unavailable: %w", err))
	}

	// 2. Permission check
	allowed := false
	roles := []string{"EXECUTIVE", "PLANT_MANAGER", "PROD_MANAGER"}
	for _, r := range roles {
		if r == input.RoleCode {
			allowed = true
			break
		}
	}
	if !allowed {
		return nil, errors.New("unauthorized role for Work Order approval")
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.UserID)

	var woCode, itemRevID, pStart, pEnd string
	var quantity float64
	err = tx.QueryRow(ctx, `
		UPDATE wo_header
		SET status = 'Released', approved_by = $1, approved_at = NOW(), updated_by = $1, updated_at = NOW()
		WHERE wo_id = $2 AND status IN ('Draft', 'PendingApproval')
		RETURNING wo_code, item_revision_id, quantity, planned_start_at::text, planned_end_at::text
	`, input.UserID, input.WOID).Scan(&woCode, &itemRevID, &quantity, &pStart, &pEnd)
	if err != nil {
		return nil, fmt.Errorf("work order is not in an approvable state: %w", err)
	}

	comment := "Approved"
	if input.Comment != "" {
		comment = input.Comment
	}
	_, _ = tx.Exec(ctx, `INSERT INTO wo_approval_log (wo_id, action, actor_user_id, actor_role_code, comment) VALUES ($1, 'Approved', $2, $3, $4)`, input.WOID, input.UserID, input.RoleCode, comment)

	reqRows, err := tx.Query(ctx, `SELECT component_item_revision_id, required_qty, uom_id FROM wo_material_requirement WHERE wo_id = $1`, input.WOID)
	type reqStruct struct {
		CompRevID string  `json:"component_item_revision_id"`
		Qty       float64 `json:"required_qty"`
		UOMID     string  `json:"uom_id"`
	}
	var reqs []reqStruct
	if err == nil {
		for reqRows.Next() {
			var r reqStruct
			_ = reqRows.Scan(&r.CompRevID, &r.Qty, &r.UOMID)
			reqs = append(reqs, r)
		}
		reqRows.Close()
	}

	payload := map[string]interface{}{
		"wo_id":                 input.WOID,
		"wo_code":               woCode,
		"item_revision_id":      itemRevID,
		"quantity":              quantity,
		"planned_start_at":      pStart,
		"planned_end_at":        pEnd,
		"material_requirements": reqs,
	}
	envelope := sharedkernel.CreateEventEnvelope("MES.Execution.WOApproved.v1", "mes-execution-service", input.TraceID, payload)
	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.WOApproved.v1", envelope); err != nil {
		return nil, fmt.Errorf("failed to write WOApproved event to outbox: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"wo_id":           input.WOID,
		"wo_code":         woCode,
		"status":          "Released",
		"approved_by":     input.UserID,
		"event_published": true,
		"event_type":      "MES.Execution.WOApproved.v1",
	}, nil
}
