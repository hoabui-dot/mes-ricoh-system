package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/domain"
	"github.com/mom-platform/mes-execution-service/internal/infrastructure/client"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type ConfirmOperationInput struct {
	WOID                string              `json:"wo_id"`
	WOOperationID       string              `json:"wo_operation_id"`
	SessionID           string              `json:"session_id"`
	QtyGood             float64             `json:"qty_good"`
	QtyScrap            float64             `json:"qty_scrap"`
	ReasonCode          *string             `json:"reason_code,omitempty"`
	ScannedLabelID      *string             `json:"scanned_label_id,omitempty"`
	ScannedMaterialCode *string             `json:"scanned_material_code,omitempty"`
	Pieces              []client.PieceInput `json:"pieces,omitempty"`
	OperatorUserID      string              `json:"operator_user_id"`
	RoleCode            string              `json:"role_code"`
	IdempotencyAttempt  string              `json:"idempotency_attempt,omitempty"`
}

func ConfirmOperation(
	ctx context.Context,
	pool *pgxpool.Pool,
	traceabilityClient *client.TraceabilityClient,
	input ConfirmOperationInput,
) (*domain.OperationConfirmation, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, input.OperatorUserID)

	// 1. Fetch WOOperation and WOHeader details
	var opID, opCode, opStatus, siteID, itemRevID, uomID, workCenterID string
	err = tx.QueryRow(ctx, `
		SELECT o.operation_id, o.operation_code, o.status, h.site_id, h.item_revision_id, h.uom_id, o.work_center_id
		FROM wo_operation o
		JOIN wo_header h ON o.wo_id = h.wo_id
		WHERE o.wo_operation_id = $1 AND o.wo_id = $2
	`, input.WOOperationID, input.WOID).Scan(&opID, &opCode, &opStatus, &siteID, &itemRevID, &uomID, &workCenterID)
	if err != nil {
		return nil, fmt.Errorf("operation %s not found for WO %s: %w", input.WOOperationID, input.WOID, err)
	}

	if opStatus != "InProgress" && opStatus != "Pending" {
		return nil, fmt.Errorf("operation %s is in status %s, cannot confirm", input.WOOperationID, opStatus)
	}

	// 2. Fetch data-driven OperationBehaviorRule
	rule, exists := domain.OperationBehaviorMap[opCode]
	if !exists {
		rule = domain.OperationBehaviorRule{
			OperationCode:    opCode,
			OperationType:    "Production",
			ConfirmationMode: "StartFinish",
		}
	}

	// Validate OP-QC fail reason code
	if opCode == "OP-QC" && input.QtyScrap > 0 {
		if input.ReasonCode == nil || *input.ReasonCode == "" {
			return nil, fmt.Errorf("reason_code is required for OP-QC failed inspection")
		}
		// Validate reason_code against rm_reason_code if present
	}

	// Validate material scan requirement
	if rule.RequiresMaterialScan {
		if (input.ScannedLabelID == nil || *input.ScannedLabelID == "") && (input.ScannedMaterialCode == nil || *input.ScannedMaterialCode == "") {
			return nil, fmt.Errorf("operation %s requires material scan (label_id or material_code)", opCode)
		}
	}

	idempotencyKey := fmt.Sprintf("%s-%s", input.WOOperationID, input.IdempotencyAttempt)

	var inputLabelID *string
	if input.ScannedLabelID != nil && *input.ScannedLabelID != "" {
		if _, err := uuid.Parse(*input.ScannedLabelID); err == nil {
			inputLabelID = input.ScannedLabelID
		}
	}
	var outputLabelID *string

	// 3. Traceability Service Integration (Synchronous Calls via Circuit Breaker)
	if traceabilityClient != nil {
		switch opCode {
		case "OP-MIX":
			if rule.RequiresOutputLabel && input.QtyGood > 0 {
				issueReq := client.IssueLabelReq{
					ItemRevisionID:     itemRevID,
					OperationCode:      opCode,
					Quantity:           input.QtyGood,
					UOMID:              uomID,
					SiteID:             siteID,
					CreatedByOperation: opCode,
				}
				lblResp, err := traceabilityClient.IssueLabel(ctx, issueReq, input.OperatorUserID, input.RoleCode)
				if err != nil {
					return nil, fmt.Errorf("failed to issue mother label at OP-MIX: %w", err)
				}
				outputLabelID = &lblResp.LabelID
			}

		case "OP-CUT":
			if input.ScannedLabelID != nil && *input.ScannedLabelID != "" {
				pieces := input.Pieces
				if len(pieces) == 0 {
					pieces = []client.PieceInput{
						{Quantity: input.QtyGood, UOMID: uomID},
					}
				}
				splitReq := client.SplitLabelReq{
					ParentLabelID:        *input.ScannedLabelID,
					TargetItemRevisionID: itemRevID,
					OperationCode:        opCode,
					Pieces:               pieces,
					SiteID:               siteID,
					IdempotencyKey:       idempotencyKey,
				}
				splitResp, err := traceabilityClient.SplitLabel(ctx, splitReq, input.OperatorUserID, input.RoleCode)
				if err != nil {
					return nil, fmt.Errorf("failed to split label at OP-CUT: %w", err)
				}
				if len(splitResp.ChildLabels) > 0 {
					outputLabelID = &splitResp.ChildLabels[0].LabelID
				}
			}

		case "OP-MOLD":
			if input.ScannedLabelID != nil && *input.ScannedLabelID != "" {
				woRef := input.WOID
				consumeReq := client.ConsumeLabelReq{
					LabelID:       *input.ScannedLabelID,
					OperationCode: opCode,
					WOID:          &woRef,
					UserID:        input.OperatorUserID,
				}
				if err := traceabilityClient.ConsumeLabel(ctx, consumeReq, input.OperatorUserID, input.RoleCode); err != nil {
					return nil, fmt.Errorf("failed to consume label at OP-MOLD: %w", err)
				}
			}
			if rule.RequiresOutputLabel && input.QtyGood > 0 {
				issueReq := client.IssueLabelReq{
					ItemRevisionID:     itemRevID,
					OperationCode:      opCode,
					Quantity:           input.QtyGood,
					UOMID:              uomID,
					SiteID:             siteID,
					CreatedByOperation: opCode,
				}
				lblResp, err := traceabilityClient.IssueLabel(ctx, issueReq, input.OperatorUserID, input.RoleCode)
				if err != nil {
					return nil, fmt.Errorf("failed to issue output label at OP-MOLD: %w", err)
				}
				outputLabelID = &lblResp.LabelID
			}

		case "OP-QC":
			if input.QtyGood > 0 && input.QtyScrap == 0 {
				issueReq := client.IssueLabelReq{
					ItemRevisionID:     itemRevID,
					OperationCode:      opCode,
					Quantity:           input.QtyGood,
					UOMID:              uomID,
					SiteID:             siteID,
					CreatedByOperation: opCode,
				}
				lblResp, err := traceabilityClient.IssueLabel(ctx, issueReq, input.OperatorUserID, input.RoleCode)
				if err != nil {
					return nil, fmt.Errorf("failed to issue PASS label at OP-QC: %w", err)
				}
				outputLabelID = &lblResp.LabelID
			}
		}
	}

	// 4. Backflush & Manual Material Consumption
	// Fetch material requirements for this operation
	rows, err := tx.Query(ctx, `
		SELECT requirement_id, component_item_revision_id, required_qty, uom_id, backflush_flag, phantom_flag
		FROM wo_material_requirement
		WHERE wo_id = $1 AND (issue_operation_id IS NULL OR issue_operation_id = (
			SELECT operation_id FROM wo_operation WHERE wo_operation_id = $2
		))
	`, input.WOID, input.WOOperationID)
	if err == nil {
		type matReq struct {
			reqID, compRevID, uomID string
			reqQty                  float64
			backflush, phantom      bool
		}
		var reqs []matReq
		for rows.Next() {
			var r matReq
			rows.Scan(&r.reqID, &r.compRevID, &r.reqQty, &r.uomID, &r.backflush, &r.phantom)
			reqs = append(reqs, r)
		}
		rows.Close()

		now := time.Now().UTC()
		for _, req := range reqs {
			if req.backflush && !req.phantom {
				consumedQty := input.QtyGood * (req.reqQty / 100.0) // ratio
				if consumedQty <= 0 {
					consumedQty = req.reqQty
				}
				cID := uuid.New().String()
				tx.Exec(ctx, `
					INSERT INTO material_consumption (consumption_id, wo_id, wo_operation_id, component_revision_id, qty_consumed, uom, source, label_id, consumed_at)
					VALUES ($1, $2, $3, $4, $5, $6, 'BACKFLUSH', $7, $8)
				`, cID, input.WOID, input.WOOperationID, req.compRevID, consumedQty, req.uomID, inputLabelID, now)
				env := sharedkernel.CreateEventEnvelope("MES.Execution.MaterialConsumed.v1", "mes-execution-service", "", map[string]interface{}{
					"consumption_id": cID, "wo_id": input.WOID, "wo_operation_id": input.WOOperationID, "work_center_id": workCenterID,
					"component_revision_id": req.compRevID, "qty_consumed": consumedQty, "uom": req.uomID, "source": "BACKFLUSH",
					"label_id": inputLabelID, "consumed_at": now.Format(time.RFC3339Nano),
				})
				_ = sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.MaterialConsumed.v1", env)
			} else if !req.backflush {
				// Enforce manual scan record
				cID := uuid.New().String()
				tx.Exec(ctx, `
					INSERT INTO material_consumption (consumption_id, wo_id, wo_operation_id, component_revision_id, qty_consumed, uom, source, label_id, consumed_at)
					VALUES ($1, $2, $3, $4, $5, $6, 'MANUAL_SCAN', $7, $8)
				`, cID, input.WOID, input.WOOperationID, req.compRevID, req.reqQty, req.uomID, inputLabelID, now)
				env := sharedkernel.CreateEventEnvelope("MES.Execution.MaterialConsumed.v1", "mes-execution-service", "", map[string]interface{}{
					"consumption_id": cID, "wo_id": input.WOID, "wo_operation_id": input.WOOperationID, "work_center_id": workCenterID,
					"component_revision_id": req.compRevID, "qty_consumed": req.reqQty, "uom": req.uomID, "source": "MANUAL_SCAN",
					"label_id": inputLabelID, "consumed_at": now.Format(time.RFC3339Nano),
				})
				_ = sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.MaterialConsumed.v1", env)
			}
		}
	}

	// 5. Insert Operation Confirmation
	confirmationID := uuid.New().String()
	now := time.Now().UTC()
	_, err = tx.Exec(ctx, `
		INSERT INTO operation_confirmation (confirmation_id, wo_operation_id, session_id, qty_good, qty_scrap, reason_code, input_label_id, output_label_id, confirmed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, confirmationID, input.WOOperationID, input.SessionID, input.QtyGood, input.QtyScrap, input.ReasonCode, inputLabelID, outputLabelID, now)
	if err != nil {
		return nil, fmt.Errorf("failed to insert operation_confirmation: %w", err)
	}

	// Update session status to COMPLETED
	tx.Exec(ctx, `UPDATE execution_session SET status = 'COMPLETED', ended_at = $1 WHERE session_id = $2`, now, input.SessionID)

	// Update wo_operation status to Finished
	_, err = tx.Exec(ctx, `UPDATE wo_operation SET status = 'Finished', row_version = row_version + 1 WHERE wo_operation_id = $1`, input.WOOperationID)
	if err != nil {
		return nil, fmt.Errorf("failed to update operation status to Finished: %w", err)
	}

	// 6. Outbox Event MES.Execution.OperationFinished.v1
	env := sharedkernel.CreateEventEnvelope(
		"MES.Execution.OperationFinished.v1",
		"mes-execution-service",
		"",
		map[string]interface{}{
			"confirmation_id":  confirmationID,
			"wo_id":            input.WOID,
			"wo_operation_id":  input.WOOperationID,
			"operation_id":     opID,
			"operation_code":   opCode,
			"site_id":          siteID,
			"item_revision_id": itemRevID,
			"work_center_id":   workCenterID,
			"session_id":       input.SessionID,
			"qty_good":         input.QtyGood,
			"qty_scrap":        input.QtyScrap,
			"reason_code":      input.ReasonCode,
			"output_label_id":  outputLabelID,
			"confirmed_at":     now.Format(time.RFC3339Nano),
		},
	)
	if err := sharedkernel.WriteToOutbox(ctx, tx, "MES.Execution.OperationFinished.v1", env); err != nil {
		return nil, fmt.Errorf("failed to write outbox event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	// 7. Auto-check Work Order completion
	_, _ = CheckAndCompleteWorkOrder(ctx, pool, input.WOID, input.OperatorUserID)

	return &domain.OperationConfirmation{
		ConfirmationID: confirmationID,
		WOOperationID:  input.WOOperationID,
		SessionID:      input.SessionID,
		QtyGood:        input.QtyGood,
		QtyScrap:       input.QtyScrap,
		ReasonCode:     input.ReasonCode,
		InputLabelID:   inputLabelID,
		OutputLabelID:  outputLabelID,
		ConfirmedAt:    now,
	}, nil
}
