package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type WMSOutboundClient struct {
	baseURL string
	http    *http.Client
	cb      interface {
		Execute(func() (interface{}, error)) (interface{}, error)
	}
}

type MaterialRequestInput struct {
	ItemRevisionID string  `json:"item_revision_id"`
	ItemCode       string  `json:"item_code,omitempty"`
	ItemName       string  `json:"item_name,omitempty"`
	WorkOrderCode  string  `json:"work_order_code,omitempty"`
	WorkOrderName  string  `json:"work_order_name,omitempty"`
	WorkCenterRef  string  `json:"work_center_ref"`
	WorkCenterCode string  `json:"work_center_code,omitempty"`
	WorkCenterName string  `json:"work_center_name,omitempty"`
	UOMCode        string  `json:"uom_code,omitempty"`
	RequiredQty    float64 `json:"required_qty"`
	WOID           string  `json:"wo_id"`
}

type MaterialRequestOutput struct {
	RequestID        string                 `json:"request_id"`
	RequestCode      string                 `json:"request_code"`
	SourceSystem     string                 `json:"source_system,omitempty"`
	WorkOrderCode    string                 `json:"work_order_code,omitempty"`
	WorkOrderName    string                 `json:"work_order_name,omitempty"`
	WorkCenterCode   string                 `json:"work_center_code,omitempty"`
	ItemCode         string                 `json:"item_code,omitempty"`
	ItemName         string                 `json:"item_name,omitempty"`
	UOMCode          string                 `json:"uom_code,omitempty"`
	Status           string                 `json:"status"`
	StagingLocation  string                 `json:"staging_location_id"`
	RequestedQty     float64                `json:"requested_qty"`
	AlreadyStagedQty float64                `json:"already_staged_qty"`
	ShortfallQty     float64                `json:"shortfall_qty"`
	AvailableQty     float64                `json:"available_qty"`
	TransferredQty   float64                `json:"transferred_qty"`
	ErrorCode        string                 `json:"error_code,omitempty"`
	Details          map[string]interface{} `json:"details,omitempty"`
}

func NewWMSOutboundClient(baseURL string) *WMSOutboundClient {
	return &WMSOutboundClient{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 10 * time.Second},
		cb: sharedkernel.NewCircuitBreaker(sharedkernel.CircuitBreakerConfig{
			Name:       "WMSOutboundMaterialRequest",
			Dependency: "wms-outbound-service",
		}),
	}
}

func (c *WMSOutboundClient) RequestMaterial(ctx context.Context, input MaterialRequestInput, userID, traceID string) (*MaterialRequestOutput, error) {
	result, err := c.cb.Execute(func() (interface{}, error) {
		body, _ := json.Marshal(input)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/material-requests", bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		if userID != "" {
			req.Header.Set("X-User-ID", userID)
		}
		if traceID != "" {
			req.Header.Set("X-Trace-ID", traceID)
		}
		resp, err := c.http.Do(req)
		if err != nil {
			return nil, sharedkernel.NewRetryableDependencyError("wms-outbound-service", err)
		}
		defer resp.Body.Close()
		var out MaterialRequestOutput
		if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
			return nil, err
		}
		if resp.StatusCode == http.StatusConflict && out.Status == "Shortage" {
			return &out, nil
		}
		if resp.StatusCode >= http.StatusInternalServerError {
			return nil, sharedkernel.NewRetryableDependencyError("wms-outbound-service", fmt.Errorf("material request failed: %s", resp.Status))
		}
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("wms outbound request failed: %s", resp.Status)
		}
		return &out, nil
	})
	if err != nil {
		if sharedkernel.IsCircuitBreakerOpen(err) {
			return nil, sharedkernel.NewRetryableDependencyError("wms-outbound-service", err)
		}
		return nil, err
	}
	out, ok := result.(*MaterialRequestOutput)
	if !ok {
		return nil, fmt.Errorf("unexpected WMS outbound response")
	}
	return out, nil
}
