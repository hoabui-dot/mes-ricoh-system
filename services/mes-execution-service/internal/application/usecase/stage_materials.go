package usecase

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/infrastructure/client"
)

type StageMaterialsInput struct {
	WOID    string
	UserID  string
	TraceID string
}

type StageRequirementResult struct {
	RequirementID string                        `json:"requirement_id"`
	Status        string                        `json:"status"`
	Response      *client.MaterialRequestOutput `json:"response,omitempty"`
	Error         string                        `json:"error,omitempty"`
}

func StageMaterialsForWorkOrder(ctx context.Context, pool *pgxpool.Pool, wms *client.WMSOutboundClient, input StageMaterialsInput) ([]StageRequirementResult, error) {
	if wms == nil {
		return nil, fmt.Errorf("WMS_OUTBOUND_SERVICE_URL is not configured")
	}
	rows, err := pool.Query(ctx, `
		SELECT r.requirement_id, r.component_item_revision_id, r.required_qty::float8, o.work_center_id
		FROM wo_material_requirement r
		LEFT JOIN wo_operation o_issue ON o_issue.operation_id = r.issue_operation_id AND o_issue.wo_id = r.wo_id
		LEFT JOIN LATERAL (
			SELECT work_center_id
			FROM wo_operation
			WHERE wo_id = r.wo_id
			ORDER BY sequence_no
			LIMIT 1
		) o_first ON true
		CROSS JOIN LATERAL (
			SELECT COALESCE(o_issue.work_center_id, o_first.work_center_id) AS work_center_id
		) o
		WHERE r.wo_id = $1
		  AND r.phantom_flag = false
		  AND o.work_center_id IS NOT NULL
		ORDER BY r.requirement_id
	`, input.WOID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]StageRequirementResult, 0)
	for rows.Next() {
		var reqID, itemRevID, workCenterID string
		var qty float64
		if err := rows.Scan(&reqID, &itemRevID, &qty, &workCenterID); err != nil {
			return nil, err
		}
		result := StageRequirementResult{RequirementID: reqID}
		out, err := wms.RequestMaterial(ctx, client.MaterialRequestInput{
			ItemRevisionID: itemRevID,
			WorkCenterRef:  workCenterID,
			RequiredQty:    qty,
			WOID:           input.WOID,
		}, input.UserID, input.TraceID)
		if err != nil {
			result.Status = "NotChecked"
			result.Error = err.Error()
			results = append(results, result)
			continue
		}
		status := "Staged"
		if out.Status == "Shortage" {
			status = "Shortage"
		}
		detail, _ := json.Marshal(out)
		if _, err := pool.Exec(ctx, `
			UPDATE wo_material_requirement
			SET stock_check_status = $1,
			    stock_check_detail = $2::jsonb
			WHERE requirement_id = $3
		`, status, string(detail), reqID); err != nil {
			return nil, err
		}
		result.Status = status
		result.Response = out
		results = append(results, result)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}
