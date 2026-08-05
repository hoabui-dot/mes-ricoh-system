package events

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

var executionEventTypes = []string{
	"MES.Execution.WOCreated.v1",
	"MES.Execution.WOApproved.v1",
	"MES.Execution.WorkOrderReleased.v1",
	"MES.Execution.MaterialRequirementPublished.v1",
	"MES.Execution.OperationStarted.v1",
	"MES.Execution.OperationFinished.v1",
	"MES.Execution.OperationFailed.v1",
	"MES.Execution.OperationAborted.v1",
	"MES.Execution.OperationRetryRequested.v1",
	"MES.Execution.WOStatusChanged.v1",
	"MES.Execution.MaterialConsumed.v1",
	"MES.Execution.MaterialStagingRequested.v1",
	"MES.Execution.WOCompleted.v1",
}

const eventSchemaJSON = `{
  "type": "object",
  "additionalProperties": true,
  "properties": {
    "event_id": { "type": "string" },
    "event_type": { "type": "string" },
    "occurred_at": { "type": "string" },
    "source_service": { "type": "string" },
    "trace_id": { "type": "string" },
    "payload": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "wo_id": { "type": "string" },
        "wo_code": { "type": "string" },
        "operation_id": { "type": "string" },
        "operation_code": { "type": "string" },
        "site_id": { "type": "string" },
        "item_revision_id": { "type": "string" },
        "work_center_id": { "type": "string" },
        "quantity": { "type": ["number", "string"] }
      },
      "required": ["wo_id", "wo_code"]
    }
  },
  "required": ["event_id", "event_type", "occurred_at", "source_service", "trace_id", "payload"]
}`

func RegisterEventSchemas(schemaRegistryURL string) error {
	baseURL := strings.TrimRight(schemaRegistryURL, "/")
	var registrationErrors []error
	for _, eventType := range executionEventTypes {
		subject := fmt.Sprintf("%s-value", eventType)
		reqBody, _ := json.Marshal(map[string]string{
			"schemaType": "JSON",
			"schema":     eventSchemaJSON,
		})
		resp, err := http.Post(fmt.Sprintf("%s/subjects/%s/versions", baseURL, subject), "application/vnd.schemaregistry.v1+json", bytes.NewBuffer(reqBody))
		if err != nil {
			registrationErrors = append(registrationErrors, fmt.Errorf("%s: %w", subject, err))
			continue
		}
		resp.Body.Close()
		if resp.StatusCode >= 400 {
			registrationErrors = append(registrationErrors, fmt.Errorf("schema registry returned status %d for %s", resp.StatusCode, subject))
		}
	}
	return errors.Join(registrationErrors...)
}
