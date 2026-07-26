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

type stageDemand struct {
	requirementIDs []string
	itemRevisionID string
	itemCode       string
	itemName       string
	workOrderCode  string
	workOrderName  string
	workCenterID   string
	workCenterCode string
	workCenterName string
	quantity       float64
}

type stageRequirement struct {
	requirementID  string
	itemRevisionID string
	itemCode       string
	itemName       string
	workOrderCode  string
	workOrderName  string
	workCenterID   string
	workCenterCode string
	workCenterName string
	quantity       float64
}

func aggregateStageDemands(rows []stageRequirement) (map[string]*stageDemand, []string) {
	demands := make(map[string]*stageDemand)
	demandOrder := make([]string, 0)
	for _, row := range rows {
		key := row.itemRevisionID + ":" + row.workCenterID
		demand, ok := demands[key]
		if !ok {
			demand = &stageDemand{itemRevisionID: row.itemRevisionID, itemCode: row.itemCode, itemName: row.itemName, workOrderCode: row.workOrderCode, workOrderName: row.workOrderName, workCenterID: row.workCenterID, workCenterCode: row.workCenterCode, workCenterName: row.workCenterName}
			demands[key] = demand
			demandOrder = append(demandOrder, key)
		}
		demand.requirementIDs = append(demand.requirementIDs, row.requirementID)
		demand.quantity += row.quantity
	}
	return demands, demandOrder
}

func StageMaterialsForWorkOrder(ctx context.Context, pool *pgxpool.Pool, wms *client.WMSOutboundClient, input StageMaterialsInput) ([]StageRequirementResult, error) {
	if wms == nil {
		return nil, fmt.Errorf("WMS_OUTBOUND_SERVICE_URL is not configured")
	}
	commandTx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer commandTx.Rollback(ctx)
	if _, err := commandTx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "mes-stage-materials:"+input.WOID); err != nil {
		return nil, err
	}

	var status string
	if err := commandTx.QueryRow(ctx, `SELECT status FROM wo_header WHERE wo_id = $1`, input.WOID).Scan(&status); err != nil {
		return nil, fmt.Errorf("WMS_INVALID_WORK_ORDER_STATE: work order not found")
	}
	if status != "Released" && status != "InProgress" {
		return nil, fmt.Errorf("WMS_INVALID_WORK_ORDER_STATE: work order status %s cannot be staged", status)
	}
	rows, err := commandTx.Query(ctx, `
		SELECT r.requirement_id, r.component_item_revision_id, r.component_item_code, COALESCE(ir.name->>'vi', ''), h.wo_code, h.item_name, r.required_qty::float8, o.work_center_id, COALESCE(wc.code, ''), COALESCE(wc.name->>'vi', '')
		FROM wo_material_requirement r
		JOIN wo_header h ON h.wo_id = r.wo_id
		LEFT JOIN wo_operation o_issue ON o_issue.operation_id = r.issue_operation_id AND o_issue.wo_id = r.wo_id
		LEFT JOIN rm_work_center wc ON wc.master_id = o_issue.work_center_id
		LEFT JOIN rm_item_revision ir ON ir.master_id = r.component_item_revision_id
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
		  AND r.stock_check_status <> 'Staged'
		  AND r.required_qty > 0
		  AND o.work_center_id IS NOT NULL
		ORDER BY r.requirement_id
	`, input.WOID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requirements := make([]stageRequirement, 0)
	for rows.Next() {
		var reqID, itemRevID, itemCode, itemName, workOrderCode, workOrderName, workCenterID, workCenterCode, workCenterName string
		var qty float64
		if err := rows.Scan(&reqID, &itemRevID, &itemCode, &itemName, &workOrderCode, &workOrderName, &qty, &workCenterID, &workCenterCode, &workCenterName); err != nil {
			return nil, err
		}
		requirements = append(requirements, stageRequirement{requirementID: reqID, itemRevisionID: itemRevID, itemCode: itemCode, itemName: itemName, workOrderCode: workOrderCode, workOrderName: workOrderName, workCenterID: workCenterID, workCenterCode: workCenterCode, workCenterName: workCenterName, quantity: qty})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	demands, demandOrder := aggregateStageDemands(requirements)

	results := make([]StageRequirementResult, 0)
	for _, key := range demandOrder {
		demand := demands[key]
		out, err := wms.RequestMaterial(ctx, client.MaterialRequestInput{
			ItemRevisionID: demand.itemRevisionID,
			ItemCode:       demand.itemCode,
			ItemName:       demand.itemName,
			WorkOrderCode:  demand.workOrderCode,
			WorkOrderName:  demand.workOrderName,
			WorkCenterRef:  demand.workCenterID,
			WorkCenterCode: demand.workCenterCode,
			WorkCenterName: demand.workCenterName,
			RequiredQty:    demand.quantity,
			WOID:           input.WOID,
		}, input.UserID, input.TraceID)
		if err != nil {
			for _, reqID := range demand.requirementIDs {
				results = append(results, StageRequirementResult{RequirementID: reqID, Status: "NotChecked", Error: err.Error()})
			}
			continue
		}
		status := "Staged"
		if out.Status == "Shortage" {
			status = "Shortage"
		}
		detail, _ := json.Marshal(out)
		if _, err := commandTx.Exec(ctx, `
			UPDATE wo_material_requirement
			SET stock_check_status = $1,
			    stock_check_detail = $2::jsonb
			WHERE requirement_id = ANY($3::uuid[])
		`, status, string(detail), demand.requirementIDs); err != nil {
			return nil, err
		}
		for _, reqID := range demand.requirementIDs {
			results = append(results, StageRequirementResult{RequirementID: reqID, Status: status, Response: out})
		}
	}
	if err := commandTx.Commit(ctx); err != nil {
		return nil, err
	}
	return results, nil
}
