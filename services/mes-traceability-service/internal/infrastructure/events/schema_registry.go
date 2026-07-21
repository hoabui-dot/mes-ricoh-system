package events

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

type SchemaRegistryClient struct {
	baseURL string
	client  *http.Client
}

func NewSchemaRegistryClient(url string) *SchemaRegistryClient {
	return &SchemaRegistryClient{
		baseURL: url,
		client:  &http.Client{Timeout: 5 * time.Second},
	}
}

func (s *SchemaRegistryClient) RegisterTraceabilitySchemas() error {
	schemas := map[string]string{
		"MES.Traceability.LabelIssued.v1": `{
			"type": "record",
			"name": "LabelIssued",
			"namespace": "com.wonsealtech.mes.traceability",
			"fields": [
				{"name": "eventId", "type": "string"},
				{"name": "eventType", "type": "string"},
				{"name": "aggregateId", "type": "string"},
				{"name": "timestamp", "type": "string"},
				{"name": "producer", "type": "string"},
				{"name": "payload", "type": {
					"type": "record",
					"name": "LabelIssuedPayload",
					"fields": [
						{"name": "label_id", "type": "string"},
						{"name": "label_code", "type": "string"},
						{"name": "item_revision_id", "type": "string"},
						{"name": "lot_or_serial_no", "type": "string"},
						{"name": "quantity", "type": "double"},
						{"name": "uom_id", "type": "string"},
						{"name": "created_by_operation", "type": "string"},
						{"name": "site_id", "type": "string"}
					]
				}}
			]
		}`,
		"MES.Traceability.QRSplitPerformed.v1": `{
			"type": "record",
			"name": "QRSplitPerformed",
			"namespace": "com.wonsealtech.mes.traceability",
			"fields": [
				{"name": "eventId", "type": "string"},
				{"name": "eventType", "type": "string"},
				{"name": "aggregateId", "type": "string"},
				{"name": "timestamp", "type": "string"},
				{"name": "producer", "type": "string"},
				{"name": "payload", "type": {
					"type": "record",
					"name": "QRSplitPerformedPayload",
					"fields": [
						{"name": "parent_label_id", "type": "string"},
						{"name": "parent_code", "type": "string"},
						{"name": "remaining_qty", "type": "double"},
						{"name": "child_count", "type": "int"},
						{"name": "operation_code", "type": "string"},
						{"name": "site_id", "type": "string"}
					]
				}}
			]
		}`,
		"MES.Traceability.GenealogyRecorded.v1": `{
			"type": "record",
			"name": "GenealogyRecorded",
			"namespace": "com.wonsealtech.mes.traceability",
			"fields": [
				{"name": "eventId", "type": "string"},
				{"name": "eventType", "type": "string"},
				{"name": "aggregateId", "type": "string"},
				{"name": "timestamp", "type": "string"},
				{"name": "producer", "type": "string"},
				{"name": "payload", "type": {
					"type": "record",
					"name": "GenealogyRecordedPayload",
					"fields": [
						{"name": "event_id", "type": "string"},
						{"name": "label_id", "type": "string"},
						{"name": "related_label_id", "type": ["null", "string"], "default": null},
						{"name": "relationship_type", "type": "string"},
						{"name": "operation_code", "type": "string"},
						{"name": "wo_id", "type": ["null", "string"], "default": null}
					]
				}}
			]
		}`,
	}

	for subject, schemaStr := range schemas {
		url := fmt.Sprintf("%s/subjects/%s-value/versions", s.baseURL, subject)
		reqBody, _ := json.Marshal(map[string]string{"schema": schemaStr})

		resp, err := s.client.Post(url, "application/vnd.schemaregistry.v1+json", bytes.NewBuffer(reqBody))
		if err != nil {
			log.Printf("[SchemaRegistry] Warning: failed to register schema for %s: %v", subject, err)
			continue
		}
		resp.Body.Close()
		log.Printf("[SchemaRegistry] Successfully registered schema for subject: %s", subject)
	}

	return nil
}
