package domain

import (
	"time"

	"github.com/google/uuid"
)

type TrackingType string

const (
	TrackingMotherChildQR TrackingType = "MOTHER_CHILD_QR"
	TrackingLot           TrackingType = "LOT"
	TrackingSerial        TrackingType = "SERIAL"
)

type LabelStatus string

const (
	LabelActive   LabelStatus = "ACTIVE"
	LabelConsumed LabelStatus = "CONSUMED"
	LabelScrapped LabelStatus = "SCRAPPED"
)

type RelationshipType string

const (
	RelSplitFrom    RelationshipType = "SPLIT_FROM"
	RelConsumedInto RelationshipType = "CONSUMED_INTO"
	RelMergedInto   RelationshipType = "MERGED_INTO"
)

type SplitAlgorithm string

const (
	SplitAreaBased  SplitAlgorithm = "AREA_BASED"
	SplitMassBased  SplitAlgorithm = "MASS_BASED"
	SplitFixedCount SplitAlgorithm = "FIXED_COUNT"
)

type TraceabilityPolicy struct {
	PolicyID        uuid.UUID    `json:"policy_id"`
	ItemRevisionID  uuid.UUID    `json:"item_revision_id"`
	OperationCode   string       `json:"operation_code"`
	TrackingType    TrackingType `json:"tracking_type"`
	NumberingRuleID *uuid.UUID   `json:"numbering_rule_id,omitempty"`
	QRSplitRuleID   *uuid.UUID   `json:"qr_split_rule_id,omitempty"`
	LabelTemplateID *uuid.UUID   `json:"label_template_id,omitempty"`
	SiteID          uuid.UUID    `json:"site_id"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
}

type NumberingRule struct {
	RuleID          uuid.UUID `json:"rule_id"`
	RuleCode        string    `json:"rule_code"`
	Prefix          string    `json:"prefix"`
	DateFormat      string    `json:"date_format"`
	SequenceLength  int       `json:"sequence_length"`
	ResetFrequency  string    `json:"reset_frequency"`
	SiteID          uuid.UUID `json:"site_id"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type QRSplitRule struct {
	SplitRuleID       uuid.UUID      `json:"split_rule_id"`
	RuleCode          string         `json:"rule_code"`
	SplitAlgorithm    SplitAlgorithm `json:"split_algorithm"`
	DefaultYieldRatio float64        `json:"default_yield_ratio"`
	TargetUOMID       uuid.UUID      `json:"target_uom_id"`
	SiteID            uuid.UUID      `json:"site_id"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
}

type LabelInstance struct {
	LabelID            uuid.UUID   `json:"label_id"`
	LabelCode          string      `json:"label_code"`
	ItemRevisionID     uuid.UUID   `json:"item_revision_id"`
	LotOrSerialNo      string      `json:"lot_or_serial_no"`
	ParentLabelID      *uuid.UUID  `json:"parent_label_id,omitempty"`
	Quantity           float64     `json:"quantity"`
	UOMID              uuid.UUID   `json:"uom_id"`
	Status             LabelStatus `json:"status"`
	CreatedByOperation string      `json:"created_by_operation"`
	SiteID             uuid.UUID   `json:"site_id"`
	IdempotencyKey     *string     `json:"idempotency_key,omitempty"`
	CreatedAt          time.Time   `json:"created_at"`
	UpdatedAt          time.Time   `json:"updated_at"`
}

type GenealogyEvent struct {
	EventID          uuid.UUID        `json:"event_id"`
	LabelID          uuid.UUID        `json:"label_id"`
	RelatedLabelID   *uuid.UUID       `json:"related_label_id,omitempty"`
	RelationshipType RelationshipType `json:"relationship_type"`
	OperationCode    string           `json:"operation_code"`
	WOID             *uuid.UUID       `json:"wo_id,omitempty"`
	OccurredAt       time.Time        `json:"occurred_at"`
}
