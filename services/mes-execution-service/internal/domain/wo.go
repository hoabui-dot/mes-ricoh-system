package domain

import "time"

type WorkOrder struct {
  WOID                 string     `json:"wo_id"`
  WOCode               string     `json:"wo_code"`
  ProductionVersionID  string     `json:"production_version_id"`
  ItemRevisionID       string     `json:"item_revision_id"`
  ItemCode             string     `json:"item_code"`
  ItemName             string     `json:"item_name"`
  Quantity             float64    `json:"quantity"`
  UOMID                string     `json:"uom_id"`
  SiteID               string     `json:"site_id"`
  ShiftID              *string    `json:"shift_id,omitempty"`
  PlannedStartAt       time.Time  `json:"planned_start_at"`
  PlannedEndAt         time.Time  `json:"planned_end_at"`
  Status               string     `json:"status"`
  CreatedBy            string     `json:"created_by"`
  CreatedAt            time.Time  `json:"created_at"`
  UpdatedBy            *string    `json:"updated_by,omitempty"`
  UpdatedAt            time.Time  `json:"updated_at"`
  ApprovedBy           *string    `json:"approved_by,omitempty"`
  ApprovedAt           *time.Time `json:"approved_at,omitempty"`
  RowVersion           int        `json:"row_version"`
}

type WOOperation struct {
  WOOperationId            string     `json:"wo_operation_id"`
  WOID                     string     `json:"wo_id"`
  SequenceNo               int        `json:"sequence_no"`
  OperationID              string     `json:"operation_id"`
  OperationCode            string     `json:"operation_code"`
  WorkCenterID             string     `json:"work_center_id"`
  EquipmentID              *string    `json:"equipment_id,omitempty"`
  PredecessorSeq           *string    `json:"predecessor_seq,omitempty"`
  StandardSetupTimeMin    *float64   `json:"standard_setup_time_min,omitempty"`
  StandardCycleTimeSec    *float64   `json:"standard_cycle_time_sec,omitempty"`
  StandardEfficiencyFactor *float64   `json:"standard_efficiency_factor,omitempty"`
  PlannedStartAt           *time.Time `json:"planned_start_at,omitempty"`
  PlannedEndAt             *time.Time `json:"planned_end_at,omitempty"`
  Status                   string     `json:"status"`
  RowVersion               int        `json:"row_version"`
}

type WOMaterialRequirement struct {
  RequirementID           string  `json:"requirement_id"`
  WOID                    string  `json:"wo_id"`
  ComponentItemRevisionID string  `json:"component_item_revision_id"`
  ComponentItemCode       string  `json:"component_item_code"`
  RequiredQty             float64 `json:"required_qty"`
  UOMID                   string  `json:"uom_id"`
  IssueOperationID        *string `json:"issue_operation_id,omitempty"`
  BackflushFlag           bool    `json:"backflush_flag"`
  PhantomFlag             bool    `json:"phantom_flag"`
  StockCheckStatus        string  `json:"stock_check_status"`
}

type WOApprovalLog struct {
  LogID         string    `json:"log_id"`
  WOID          string    `json:"wo_id"`
  Action        string    `json:"action"`
  ActorUserID   string    `json:"actor_user_id"`
  ActorRoleCode *string   `json:"actor_role_code,omitempty"`
  Comment       *string   `json:"comment,omitempty"`
  OccurredAt    time.Time `json:"occurred_at"`
}

type DemandIntent struct {
  ItemRevisionID       string    `json:"item_revision_id"`
  Quantity             float64   `json:"quantity"`
  SiteID               string    `json:"site_id"`
  TargetCompletionDate time.Time `json:"target_completion_date"`
}

type ReadinessResult struct {
  ItemRevisionID       string   `json:"item_revision_id"`
  SiteID               string   `json:"site_id"`
  Ready                bool     `json:"ready"`
  MissingPrerequisites []string `json:"missing_prerequisites"`
  ProductionVersionID  string   `json:"production_version_id,omitempty"`
  MBOMHeaderID         string   `json:"mbom_header_id,omitempty"`
  RoutingHeaderID      string   `json:"routing_header_id,omitempty"`
}

type ComputeResult struct {
  WOID                 string             `json:"wo_id"`
  TotalDurationMinutes int                `json:"total_duration_minutes"`
  PlannedStartAt       string             `json:"planned_start_at"`
  PlannedEndAt         string             `json:"planned_end_at"`
  Operations           []ComputedOpResult `json:"operations"`
  CapacityWarnings     []string           `json:"capacity_warnings"`
}

type ComputedOpResult struct {
	SequenceNo      int    `json:"sequence_no"`
	OperationCode   string `json:"operation_code"`
	WorkCenterID    string `json:"work_center_id"`
	DurationMinutes int    `json:"duration_minutes"`
	PlannedStartAt  string `json:"planned_start_at"`
	PlannedEndAt    string `json:"planned_end_at"`
}

type ExecutionSession struct {
	SessionID      string     `json:"session_id"`
	WOOperationID  string     `json:"wo_operation_id"`
	TerminalRef    string     `json:"terminal_ref"`
	OperatorUserID string     `json:"operator_user_id"`
	StartedAt      time.Time  `json:"started_at"`
	EndedAt        *time.Time `json:"ended_at,omitempty"`
	Status         string     `json:"status"` // IN_PROGRESS, COMPLETED, ABORTED
}

type OperationConfirmation struct {
	ConfirmationID string    `json:"confirmation_id"`
	WOOperationID  string    `json:"wo_operation_id"`
	SessionID      string    `json:"session_id"`
	QtyGood        float64   `json:"qty_good"`
	QtyScrap       float64   `json:"qty_scrap"`
	ReasonCode     *string   `json:"reason_code,omitempty"`
	InputLabelID   *string   `json:"input_label_id,omitempty"`
	OutputLabelID  *string   `json:"output_label_id,omitempty"`
	ConfirmedAt    time.Time `json:"confirmed_at"`
}

type MaterialConsumption struct {
	ConsumptionID       string    `json:"consumption_id"`
	WOID                string    `json:"wo_id"`
	WOOperationID       string    `json:"wo_operation_id"`
	ComponentRevisionID string    `json:"component_revision_id"`
	QtyConsumed         float64   `json:"qty_consumed"`
	UOM                 string    `json:"uom"`
	Source              string    `json:"source"` // BACKFLUSH, MANUAL_SCAN
	LabelID             *string   `json:"label_id,omitempty"`
	ConsumedAt          time.Time `json:"consumed_at"`
}

type OperationBehaviorRule struct {
	OperationCode        string `json:"operation_code"`
	OperationType        string `json:"operation_type"`        // Production, Inspection
	ConfirmationMode     string `json:"confirmation_mode"`     // StartFinish, QuantityOnly
	RequiresMaterialScan bool   `json:"requires_material_scan"`
	RequiresOutputLabel  bool   `json:"requires_output_label"`
	SpecialRule          string `json:"special_rule"`
}

var OperationBehaviorMap = map[string]OperationBehaviorRule{
	"OP-MIX":  {OperationCode: "OP-MIX", OperationType: "Production", ConfirmationMode: "StartFinish", RequiresMaterialScan: true, RequiresOutputLabel: true, SpecialRule: "Issue mother label batch"},
	"OP-PREP": {OperationCode: "OP-PREP", OperationType: "Production", ConfirmationMode: "QuantityOnly", RequiresMaterialScan: true, RequiresOutputLabel: false, SpecialRule: "Count-based, no label"},
	"OP-CUT":  {OperationCode: "OP-CUT", OperationType: "Production", ConfirmationMode: "StartFinish", RequiresMaterialScan: true, RequiresOutputLabel: true, SpecialRule: "Calls mes-traceability-service POST /labels/split"},
	"OP-MOLD": {OperationCode: "OP-MOLD", OperationType: "Production", ConfirmationMode: "StartFinish", RequiresMaterialScan: true, RequiresOutputLabel: true, SpecialRule: "Calls mes-traceability-service POST /labels/consume then POST /labels/issue"},
	"OP-TRIM": {OperationCode: "OP-TRIM", OperationType: "Production", ConfirmationMode: "QuantityOnly", RequiresMaterialScan: false, RequiresOutputLabel: false, SpecialRule: "Records scrap quantity/rate"},
	"OP-QC":   {OperationCode: "OP-QC", OperationType: "Inspection", ConfirmationMode: "StartFinish", RequiresMaterialScan: false, RequiresOutputLabel: true, SpecialRule: "PASS label only, FAIL requires reason_code"},
}

