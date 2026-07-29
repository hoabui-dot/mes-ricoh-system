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

type ResourcePlanningClient struct {
	baseURL string
	http    *http.Client
	cb      interface {
		Execute(func() (interface{}, error)) (interface{}, error)
	}
}

func NewResourcePlanningClient(baseURL string) *ResourcePlanningClient {
	return &ResourcePlanningClient{baseURL: baseURL, http: &http.Client{Timeout: 7 * time.Second}, cb: sharedkernel.NewCircuitBreaker(sharedkernel.CircuitBreakerConfig{Name: "MESResourcePlanning", Dependency: "mes-master-data-service"})}
}

func (c *ResourcePlanningClient) Readiness(ctx context.Context, body map[string]interface{}, headers map[string]string) (map[string]interface{}, error) {
	result, err := c.cb.Execute(func() (interface{}, error) {
		encoded, _ := json.Marshal(body)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/mes/master-data/resource-planning/readiness", bytes.NewReader(encoded))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		for k, v := range headers {
			if v != "" {
				req.Header.Set(k, v)
			}
		}
		resp, err := c.http.Do(req)
		if err != nil {
			return nil, sharedkernel.NewRetryableDependencyError("mes-master-data-service", err)
		}
		defer resp.Body.Close()
		var payload map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			return nil, fmt.Errorf("RESOURCE_PLANNING_INVALID_RESPONSE: %w", err)
		}
		if resp.StatusCode >= 500 {
			message := "readiness failed"
			if value, ok := payload["error"].(string); ok && value != "" {
				message = value
			} else if value, ok := payload["message"].(string); ok && value != "" {
				message = value
			}
			return nil, sharedkernel.NewRetryableDependencyError("mes-master-data-service", fmt.Errorf("READINESS_DEPENDENCY_5XX: %s: %s", resp.Status, message))
		}
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("readiness rejected: %s", resp.Status)
		}
		return payload, nil
	})
	if err != nil {
		return nil, err
	}
	payload, ok := result.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid readiness response")
	}
	return payload, nil
}
