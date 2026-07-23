package usecase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type RequestInput struct {
	ItemRevisionID string  `json:"item_revision_id"`
	WorkCenterRef  string  `json:"work_center_ref"`
	RequiredQty    float64 `json:"required_qty"`
	WOID           string  `json:"wo_id"`
	CreatedBy      string  `json:"created_by,omitempty"`
	TraceID        string  `json:"trace_id,omitempty"`
}

type RequestOutput struct {
	RequestID        string         `json:"request_id"`
	Status           string         `json:"status"`
	StagingLocation  string         `json:"staging_location_id"`
	RequestedQty     float64        `json:"requested_qty"`
	AlreadyStagedQty float64        `json:"already_staged_qty"`
	ShortfallQty     float64        `json:"shortfall_qty"`
	AvailableQty     float64        `json:"available_qty"`
	TransferredQty   float64        `json:"transferred_qty"`
	ErrorCode        string         `json:"error_code,omitempty"`
	Details          map[string]any `json:"details,omitempty"`
}

type BalanceRow struct {
	LotID      string  `json:"lot_id"`
	LocationID string  `json:"location_id"`
	OnHandQty  float64 `json:"on_hand_qty"`
	ExpiryDate *string `json:"expiry_date,omitempty"`
	Status     string  `json:"status"`
}

type Service struct {
	Pool         *pgxpool.Pool
	InventoryURL string
	HTTPClient   *http.Client
	Breaker      interface {
		Execute(func() (interface{}, error)) (interface{}, error)
	}
}

var defaultInventoryBreaker = sharedkernel.NewCircuitBreaker(sharedkernel.CircuitBreakerConfig{
	Name:       "WMSOutboundInventoryClient",
	Dependency: "wms-inventory-service",
})

func (s Service) RequestMaterialForWorkCenter(ctx context.Context, input RequestInput) (*RequestOutput, error) {
	if input.ItemRevisionID == "" || input.WorkCenterRef == "" || input.WOID == "" || input.RequiredQty <= 0 {
		return nil, fmt.Errorf("item_revision_id, work_center_ref, wo_id, and required_qty are required")
	}
	lockTx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer lockTx.Rollback(ctx)
	idempotencyKey := fmt.Sprintf("%s:%s:%s:%.6f", input.WOID, input.WorkCenterRef, input.ItemRevisionID, input.RequiredQty)
	if _, err := lockTx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, idempotencyKey); err != nil {
		return nil, err
	}
	if existing, err := s.findExistingRequest(ctx, input); err == nil && existing != nil {
		return existing, nil
	}

	var stagingLocationID string
	err = s.Pool.QueryRow(ctx, `
		SELECT location_id
		FROM rm_storage_location
		WHERE location_purpose = 'WorkCenterStaging'
		  AND staging_for_work_center_ref = $1
		  AND status = 'Active'
	`, input.WorkCenterRef).Scan(&stagingLocationID)
	if err != nil {
		return nil, typedError("NO_STAGING_LOCATION_CONFIGURED", map[string]any{"work_center_ref": input.WorkCenterRef})
	}

	balances, err := s.fetchBalances(ctx, input.ItemRevisionID)
	if err != nil {
		return nil, err
	}
	locationPurpose, err := s.locationPurposeMap(ctx)
	if err != nil {
		return nil, err
	}

	alreadyStaged := 0.0
	availableWarehouse := 0.0
	for _, balance := range balances {
		if balance.Status != "Active" || balance.OnHandQty <= 0 || isExpired(balance.ExpiryDate) {
			continue
		}
		if balance.LocationID == stagingLocationID {
			alreadyStaged += balance.OnHandQty
			continue
		}
		if locationPurpose[balance.LocationID] == "Storage" {
			availableWarehouse += balance.OnHandQty
		}
	}
	shortfall := max(0, input.RequiredQty-alreadyStaged)
	requestID := uuid.New().String()

	if shortfall == 0 {
		out := &RequestOutput{RequestID: requestID, Status: "Staged", StagingLocation: stagingLocationID, RequestedQty: input.RequiredQty, AlreadyStagedQty: alreadyStaged, ShortfallQty: 0, AvailableQty: availableWarehouse, TransferredQty: 0}
		return out, s.persistAndPublish(ctx, input, out, "WMS.Outbound.MaterialStaged.v1")
	}
	if availableWarehouse+0.000001 < shortfall {
		out := &RequestOutput{
			RequestID: requestID, Status: "Shortage", StagingLocation: stagingLocationID, RequestedQty: input.RequiredQty,
			AlreadyStagedQty: alreadyStaged, ShortfallQty: shortfall, AvailableQty: availableWarehouse, TransferredQty: 0,
			ErrorCode: "INSUFFICIENT_STOCK",
			Details:   map[string]any{"requested_qty": input.RequiredQty, "already_staged_qty": alreadyStaged, "shortfall_qty": shortfall, "available_qty": availableWarehouse},
		}
		return out, s.persistAndPublish(ctx, input, out, "WMS.Outbound.MaterialShortageDeclared.v1")
	}

	transferred, err := s.transferShortfall(ctx, input, stagingLocationID, shortfall)
	if err != nil {
		return nil, err
	}
	out := &RequestOutput{RequestID: requestID, Status: "Staged", StagingLocation: stagingLocationID, RequestedQty: input.RequiredQty, AlreadyStagedQty: alreadyStaged, ShortfallQty: shortfall, AvailableQty: availableWarehouse, TransferredQty: transferred}
	return out, s.persistAndPublish(ctx, input, out, "WMS.Outbound.MaterialStaged.v1")
}

func (s Service) findExistingRequest(ctx context.Context, input RequestInput) (*RequestOutput, error) {
	var out RequestOutput
	var rawDetail []byte
	err := s.Pool.QueryRow(ctx, `
		SELECT request_id::text, status, COALESCE((SELECT location_id::text FROM rm_storage_location WHERE staging_for_work_center_ref = material_request.work_center_ref AND location_purpose = 'WorkCenterStaging' LIMIT 1), '') AS staging_location_id,
		       required_qty::float8, already_staged_qty::float8, shortfall_qty::float8, available_qty::float8, transferred_qty::float8, detail
		FROM material_request
		WHERE wo_id = $1
		  AND work_center_ref = $2
		  AND item_revision_id = $3
		  AND required_qty = $4
		ORDER BY created_at DESC
		LIMIT 1
	`, input.WOID, input.WorkCenterRef, input.ItemRevisionID, input.RequiredQty).Scan(
		&out.RequestID,
		&out.Status,
		&out.StagingLocation,
		&out.RequestedQty,
		&out.AlreadyStagedQty,
		&out.ShortfallQty,
		&out.AvailableQty,
		&out.TransferredQty,
		&rawDetail,
	)
	if err != nil {
		return nil, err
	}
	if len(rawDetail) > 0 {
		_ = json.Unmarshal(rawDetail, &out.Details)
	}
	if out.Details == nil {
		out.Details = map[string]any{}
	}
	if out.Status == "Shortage" {
		out.ErrorCode = "INSUFFICIENT_STOCK"
	}
	return &out, nil
}

func (s Service) fetchBalances(ctx context.Context, itemRevisionID string) ([]BalanceRow, error) {
	result, err := s.breaker().Execute(func() (interface{}, error) {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/wms/inventory/balances?item_revision_id=%s", s.InventoryURL, itemRevisionID), nil)
		resp, err := s.client().Do(req)
		if err != nil {
			return nil, sharedkernel.NewRetryableDependencyError("wms-inventory-service", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode >= http.StatusInternalServerError {
			return nil, sharedkernel.NewRetryableDependencyError("wms-inventory-service", fmt.Errorf("inventory balance query failed: %s", resp.Status))
		}
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("inventory balance query failed: %s", resp.Status)
		}
		var rows []BalanceRow
		if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
			return nil, err
		}
		return rows, nil
	})
	if err != nil {
		if sharedkernel.IsCircuitBreakerOpen(err) {
			return nil, sharedkernel.NewRetryableDependencyError("wms-inventory-service", err)
		}
		return nil, err
	}
	rows, ok := result.([]BalanceRow)
	if !ok {
		return nil, fmt.Errorf("unexpected inventory balance response")
	}
	return rows, nil
}

func (s Service) transferShortfall(ctx context.Context, input RequestInput, stagingLocationID string, shortfall float64) (float64, error) {
	result, err := s.breaker().Execute(func() (interface{}, error) {
		body, _ := json.Marshal(map[string]any{
			"item_revision_id": input.ItemRevisionID,
			"to_location_id":   stagingLocationID,
			"qty":              shortfall,
			"wo_id":            input.WOID,
			"work_center_ref":  input.WorkCenterRef,
			"created_by":       input.CreatedBy,
		})
		req, _ := http.NewRequestWithContext(ctx, http.MethodPost, s.InventoryURL+"/api/wms/inventory/movements/transfer-to-staging", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := s.client().Do(req)
		if err != nil {
			return nil, sharedkernel.NewRetryableDependencyError("wms-inventory-service", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode >= http.StatusInternalServerError {
			return nil, sharedkernel.NewRetryableDependencyError("wms-inventory-service", fmt.Errorf("inventory transfer failed: %s", resp.Status))
		}
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("inventory transfer failed: %s", resp.Status)
		}
		var out struct {
			TransferredQty float64 `json:"transferred_qty"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
			return nil, err
		}
		return out.TransferredQty, nil
	})
	if err != nil {
		if sharedkernel.IsCircuitBreakerOpen(err) {
			return 0, sharedkernel.NewRetryableDependencyError("wms-inventory-service", err)
		}
		return 0, err
	}
	transferred, ok := result.(float64)
	if !ok {
		return 0, fmt.Errorf("unexpected inventory transfer response")
	}
	return transferred, nil
}

func (s Service) locationPurposeMap(ctx context.Context) (map[string]string, error) {
	rows, err := s.Pool.Query(ctx, `SELECT location_id, location_purpose FROM rm_storage_location WHERE status = 'Active'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, purpose string
		if err := rows.Scan(&id, &purpose); err != nil {
			return nil, err
		}
		out[id] = purpose
	}
	return out, rows.Err()
}

func (s Service) persistAndPublish(ctx context.Context, input RequestInput, out *RequestOutput, eventType string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	detail, _ := json.Marshal(out.Details)
	if string(detail) == "null" {
		detail = []byte(`{}`)
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO material_request (request_id, wo_id, work_center_ref, item_revision_id, required_qty, already_staged_qty, shortfall_qty, available_qty, transferred_qty, status, detail)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
	`, out.RequestID, input.WOID, input.WorkCenterRef, input.ItemRevisionID, input.RequiredQty, out.AlreadyStagedQty, out.ShortfallQty, out.AvailableQty, out.TransferredQty, out.Status, string(detail))
	if err != nil {
		return err
	}
	payload := map[string]any{
		"request_id": out.RequestID, "wo_id": input.WOID, "work_center_ref": input.WorkCenterRef, "item_revision_id": input.ItemRevisionID,
		"requested_qty": input.RequiredQty, "already_staged_qty": out.AlreadyStagedQty, "shortfall_qty": out.ShortfallQty,
		"available_qty": out.AvailableQty, "transferred_qty": out.TransferredQty, "status": out.Status, "details": out.Details,
	}
	env := sharedkernel.CreateEventEnvelope(eventType, "wms-outbound-service", input.TraceID, payload)
	if err := sharedkernel.WriteToOutbox(ctx, tx, eventType, env); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s Service) client() *http.Client {
	if s.HTTPClient != nil {
		return s.HTTPClient
	}
	return &http.Client{Timeout: 10 * time.Second}
}

func (s Service) breaker() interface {
	Execute(func() (interface{}, error)) (interface{}, error)
} {
	if s.Breaker != nil {
		return s.Breaker
	}
	return defaultInventoryBreaker
}

func isExpired(expiry *string) bool {
	if expiry == nil || *expiry == "" {
		return false
	}
	d, err := time.Parse("2006-01-02", *expiry)
	if err != nil {
		return false
	}
	today, _ := time.Parse("2006-01-02", time.Now().UTC().Format("2006-01-02"))
	return !d.After(today)
}

func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func typedError(code string, details map[string]any) error {
	return fmt.Errorf("%s: %v", code, details)
}
