package client

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	sharedkernel "github.com/mom-platform/shared-kernel-go"
)

type FailureReason struct {
	Code            string            `json:"code"`
	Name            map[string]string `json:"name"`
	ReasonType      string            `json:"reason_type"`
	LifecycleStatus string            `json:"lifecycle_status"`
	RequiresComment bool              `json:"requires_comment"`
}

type FailureReasonClient struct {
	baseURL string
	http    *http.Client
	cb      interface {
		Execute(func() (interface{}, error)) (interface{}, error)
	}
}

func NewFailureReasonClient(baseURL string) *FailureReasonClient {
	return &FailureReasonClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: 5 * time.Second},
		cb: sharedkernel.NewCircuitBreaker(sharedkernel.CircuitBreakerConfig{
			Name:       "MESFailureReasonCatalog",
			Dependency: "mes-master-data-service",
		}),
	}
}

func (c *FailureReasonClient) Validate(ctx context.Context, code string) (*FailureReason, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, fmt.Errorf("FAILURE_REASON_REQUIRED")
	}

	result, err := c.cb.Execute(func() (interface{}, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/mes/master-data/reason-codes?limit=500", nil)
		if err != nil {
			return nil, err
		}
		resp, err := c.http.Do(req)
		if err != nil {
			return nil, sharedkernel.NewRetryableDependencyError("mes-master-data-service", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode >= http.StatusInternalServerError {
			return nil, sharedkernel.NewRetryableDependencyError("mes-master-data-service", fmt.Errorf("FAILURE_REASON_DEPENDENCY_5XX: %s", resp.Status))
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("FAILURE_REASON_CATALOG_REJECTED: %s", resp.Status)
		}
		var payload struct {
			Data []FailureReason `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			return nil, fmt.Errorf("FAILURE_REASON_CATALOG_INVALID_RESPONSE: %w", err)
		}
		for _, reason := range payload.Data {
			if strings.EqualFold(reason.Code, code) && reason.LifecycleStatus == "Released" && reason.ReasonType == "ExecutionFailure" {
				return &reason, nil
			}
		}
		return nil, fmt.Errorf("FAILURE_REASON_NOT_APPROVED")
	})
	if err != nil {
		return nil, err
	}
	reason, ok := result.(*FailureReason)
	if !ok {
		return nil, fmt.Errorf("FAILURE_REASON_CATALOG_INVALID_RESPONSE")
	}
	return reason, nil
}
