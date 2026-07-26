package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/nd/mes-platform/modules/production/domain/entity"
)

type GatewayClient struct {
	url string
}

func NewGatewayClient(url string) *GatewayClient {
	return &GatewayClient{url: url}
}

type CreateGatewayOrderRequest struct {
	ProductionOrderID string `json:"production_order_id"`
	OrderNumber       string `json:"order_number"`
	OperationType     string `json:"operation_type"`
	Station           string `json:"station"`
	Priority          int    `json:"priority"`
	ProductID         string `json:"product_id"`
	LotNumber         string `json:"lot_number"`
	SerialNumber      string `json:"serial_number"`
	MfgDate           string `json:"mfg_date"`
	ExpDate           string `json:"exp_date"`
	Quantity          int    `json:"quantity"`
}

type CreateGatewayOrderResponse struct {
	GatewayOrderID string    `json:"gateway_order_id"`
	Accepted       bool      `json:"accepted"`
	Timestamp      time.Time `json:"timestamp"`
}

func (c *GatewayClient) SendProductionOrder(ctx context.Context, order *entity.ProductionOrder) (string, error) {
	mfg := time.Now()
	exp := mfg.AddDate(2, 0, 0)
	lot := fmt.Sprintf("LOT-%d-%02d-A", mfg.Year(), mfg.Month())
	serial := fmt.Sprintf("SN-%s", order.ID.String()[:8])

	opType := ""
	if order.OperationType != nil {
		opType = *order.OperationType
	}
	stationName := ""
	if order.Station != nil {
		stationName = *order.Station
	}

	reqPayload := CreateGatewayOrderRequest{
		ProductionOrderID: order.ID.String(),
		OrderNumber:       order.OrderNumber,
		OperationType:     opType,
		Station:           stationName,
		Priority:          order.Priority,
		ProductID:         order.Product,
		LotNumber:         lot,
		SerialNumber:      serial,
		MfgDate:           mfg.Format("2006-01-02"),
		ExpDate:           exp.Format("2006-01-02"),
		Quantity:          order.Quantity,
	}

	body, err := json.Marshal(reqPayload)
	if err != nil {
		return "", fmt.Errorf("gateway client: marshal request failed: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.url+"/gateway/production-orders", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("gateway client: create request failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("gateway client: HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusAccepted {
		var errResp map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		if msg, ok := errResp["error"]; ok {
			return "", fmt.Errorf("gateway client: gateway returned error %d: %s", resp.StatusCode, msg)
		}
		return "", fmt.Errorf("gateway client: gateway returned status %d", resp.StatusCode)
	}

	var respPayload CreateGatewayOrderResponse
	if err := json.NewDecoder(resp.Body).Decode(&respPayload); err != nil {
		return "", fmt.Errorf("gateway client: decode response failed: %w", err)
	}

	return respPayload.GatewayOrderID, nil
}

func (c *GatewayClient) SendWorkOrder(ctx context.Context, reqPayload any) (string, error) {
	body, err := json.Marshal(reqPayload)
	if err != nil {
		return "", fmt.Errorf("gateway client: marshal request failed: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.url+"/gateway/production-orders", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("gateway client: create request failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("gateway client: HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusAccepted {
		var errResp map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		if msg, ok := errResp["error"]; ok {
			return "", fmt.Errorf("gateway client: gateway returned error %d: %s", resp.StatusCode, msg)
		}
		return "", fmt.Errorf("gateway client: gateway returned status %d", resp.StatusCode)
	}

	var respPayload CreateGatewayOrderResponse
	if err := json.NewDecoder(resp.Body).Decode(&respPayload); err != nil {
		return "", fmt.Errorf("gateway client: decode response failed: %w", err)
	}

	return respPayload.GatewayOrderID, nil
}

func (c *GatewayClient) GetWorkOrderDetail(ctx context.Context, jobNo string) (map[string]interface{}, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.url+"/api/jobs/"+jobNo+"/detail", nil)
	if err != nil {
		return nil, fmt.Errorf("gateway client: create detail request failed: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gateway client: HTTP detail request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gateway client: gateway returned status %d", resp.StatusCode)
	}

	var detail map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&detail); err != nil {
		return nil, fmt.Errorf("gateway client: decode detail failed: %w", err)
	}

	return detail, nil
}
