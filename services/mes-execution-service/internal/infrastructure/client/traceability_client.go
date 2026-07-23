package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type TraceabilityClient struct {
	baseURL string
	client  *http.Client
	cb      interface {
		Execute(func() (interface{}, error)) (interface{}, error)
	}
}

func NewTraceabilityClient(baseURL string) *TraceabilityClient {
	if baseURL == "" {
		baseURL = "http://mes-traceability-service:3040/api/mes/traceability"
	}

	return &TraceabilityClient{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 5 * time.Second},
		cb: sharedkernel.NewCircuitBreaker(sharedkernel.CircuitBreakerConfig{
			Name:       "TraceabilityServiceClient",
			Dependency: "mes-traceability-service",
		}),
	}
}

type IssueLabelReq struct {
	ItemRevisionID     string  `json:"item_revision_id"`
	OperationCode      string  `json:"operation_code"`
	Quantity           float64 `json:"quantity"`
	UOMID              string  `json:"uom_id"`
	SiteID             string  `json:"site_id"`
	CreatedByOperation string  `json:"created_by_operation"`
}

type LabelInstanceResp struct {
	LabelID            string    `json:"label_id"`
	LabelCode          string    `json:"label_code"`
	ItemRevisionID     string    `json:"item_revision_id"`
	LotOrSerialNo      string    `json:"lot_or_serial_no"`
	Quantity           float64   `json:"quantity"`
	UOMID              string    `json:"uom_id"`
	Status             string    `json:"status"`
	CreatedByOperation string    `json:"created_by_operation"`
	SiteID             string    `json:"site_id"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type PieceInput struct {
	Quantity float64 `json:"quantity"`
	UOMID    string  `json:"uom_id"`
}

type SplitLabelReq struct {
	ParentLabelID        string       `json:"parent_label_id"`
	TargetItemRevisionID string       `json:"target_item_revision_id"`
	OperationCode        string       `json:"operation_code"`
	Pieces               []PieceInput `json:"pieces"`
	SiteID               string       `json:"site_id"`
	IdempotencyKey       string       `json:"idempotency_key"`
}

type SplitLabelResp struct {
	ParentLabel LabelInstanceResp   `json:"parent_label"`
	ChildLabels []LabelInstanceResp `json:"child_labels"`
}

type ConsumeLabelReq struct {
	LabelID       string  `json:"label_id"`
	TargetLabelID *string `json:"target_label_id,omitempty"`
	OperationCode string  `json:"operation_code"`
	WOID          *string `json:"wo_id,omitempty"`
	UserID        string  `json:"user_id"`
}

func (c *TraceabilityClient) IssueLabel(ctx context.Context, req IssueLabelReq, userID, roleCode string) (*LabelInstanceResp, error) {
	result, err := c.cb.Execute(func() (interface{}, error) {
		url := fmt.Sprintf("%s/labels/issue", c.baseURL)
		bodyBytes, _ := json.Marshal(req)

		httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
		if err != nil {
			return nil, err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("X-User-ID", userID)
		httpReq.Header.Set("X-Role-Code", roleCode)

		resp, err := c.client.Do(httpReq)
		if err != nil {
			return nil, sharedkernel.NewRetryableDependencyError("mes-traceability-service", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 500 {
			respBody, _ := io.ReadAll(resp.Body)
			return nil, sharedkernel.NewRetryableDependencyError("mes-traceability-service", fmt.Errorf("issue label failed (status %d): %s", resp.StatusCode, string(respBody)))
		}
		if resp.StatusCode >= 400 {
			respBody, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("traceability issue label error (status %d): %s", resp.StatusCode, string(respBody))
		}

		var lbl LabelInstanceResp
		if err := json.NewDecoder(resp.Body).Decode(&lbl); err != nil {
			return nil, err
		}
		return &lbl, nil
	})

	if err != nil {
		if sharedkernel.IsCircuitBreakerOpen(err) {
			return nil, sharedkernel.NewRetryableDependencyError("mes-traceability-service", err)
		}
		return nil, err
	}
	return result.(*LabelInstanceResp), nil
}

func (c *TraceabilityClient) SplitLabel(ctx context.Context, req SplitLabelReq, userID, roleCode string) (*SplitLabelResp, error) {
	result, err := c.cb.Execute(func() (interface{}, error) {
		url := fmt.Sprintf("%s/labels/split", c.baseURL)
		bodyBytes, _ := json.Marshal(req)

		httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
		if err != nil {
			return nil, err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("X-User-ID", userID)
		httpReq.Header.Set("X-Role-Code", roleCode)

		resp, err := c.client.Do(httpReq)
		if err != nil {
			return nil, sharedkernel.NewRetryableDependencyError("mes-traceability-service", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 500 {
			respBody, _ := io.ReadAll(resp.Body)
			return nil, sharedkernel.NewRetryableDependencyError("mes-traceability-service", fmt.Errorf("split label failed (status %d): %s", resp.StatusCode, string(respBody)))
		}
		if resp.StatusCode >= 400 {
			respBody, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("traceability split label error (status %d): %s", resp.StatusCode, string(respBody))
		}

		var res SplitLabelResp
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			return nil, err
		}
		return &res, nil
	})

	if err != nil {
		if sharedkernel.IsCircuitBreakerOpen(err) {
			return nil, sharedkernel.NewRetryableDependencyError("mes-traceability-service", err)
		}
		return nil, err
	}
	return result.(*SplitLabelResp), nil
}

func (c *TraceabilityClient) ConsumeLabel(ctx context.Context, req ConsumeLabelReq, userID, roleCode string) error {
	_, err := c.cb.Execute(func() (interface{}, error) {
		url := fmt.Sprintf("%s/labels/consume", c.baseURL)
		bodyBytes, _ := json.Marshal(req)

		httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
		if err != nil {
			return nil, err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("X-User-ID", userID)
		httpReq.Header.Set("X-Role-Code", roleCode)

		resp, err := c.client.Do(httpReq)
		if err != nil {
			return nil, sharedkernel.NewRetryableDependencyError("mes-traceability-service", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 500 {
			respBody, _ := io.ReadAll(resp.Body)
			return nil, sharedkernel.NewRetryableDependencyError("mes-traceability-service", fmt.Errorf("consume label failed (status %d): %s", resp.StatusCode, string(respBody)))
		}
		if resp.StatusCode >= 400 {
			respBody, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("traceability consume label error (status %d): %s", resp.StatusCode, string(respBody))
		}
		return nil, nil
	})
	if err != nil && sharedkernel.IsCircuitBreakerOpen(err) {
		return sharedkernel.NewRetryableDependencyError("mes-traceability-service", err)
	}
	return err
}
