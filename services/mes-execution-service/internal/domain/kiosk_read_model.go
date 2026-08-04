package domain

import "time"

type KioskPagination struct {
	Page       int `json:"page"`
	PageSize   int `json:"page_size"`
	TotalItems int `json:"total_items"`
	TotalPages int `json:"total_pages"`
}

type KioskJobCounts struct {
	Total      int `json:"total"`
	Waiting    int `json:"waiting"`
	Ready      int `json:"ready"`
	InProgress int `json:"in_progress"`
	Completed  int `json:"completed"`
	Failed     int `json:"failed"`
	Blocked    int `json:"blocked"`
}

type KioskWorkOrderSummary struct {
	WOID                       string         `json:"wo_id"`
	WOCode                     string         `json:"wo_code"`
	ItemCode                   string         `json:"item_code"`
	ItemName                   string         `json:"item_name"`
	Quantity                   float64        `json:"quantity"`
	UOMID                      string         `json:"uom_id"`
	UOMCode                    string         `json:"uom_code,omitempty"`
	SelectedProductionLineID   string         `json:"selected_production_line_id,omitempty"`
	SelectedProductionLineCode string         `json:"selected_production_line_code,omitempty"`
	SelectedProductionLineName any            `json:"selected_production_line_name_i18n"`
	Status                     string         `json:"status"`
	DispatchMode               string         `json:"dispatch_mode"`
	JobCounts                  KioskJobCounts `json:"job_counts"`
	ProgressPercent            float64        `json:"progress_percent"`
	ManualProgressPercent      float64        `json:"manual_progress_percent"`
	UpdatedAt                  time.Time      `json:"updated_at"`
}

type KioskWorkOrderList struct {
	Data       []KioskWorkOrderSummary `json:"data"`
	Pagination KioskPagination         `json:"pagination"`
}

type KioskNamedResource struct {
	ID   string `json:"id,omitempty"`
	Code string `json:"code,omitempty"`
	Name any    `json:"name_i18n,omitempty"`
}

type KioskResourceContext struct {
	AllocationID     string             `json:"allocation_id,omitempty"`
	AllocationStatus string             `json:"allocation_status,omitempty"`
	ValidationStatus string             `json:"validation_status,omitempty"`
	WorkCenter       KioskNamedResource `json:"work_center"`
	Workstation      KioskNamedResource `json:"workstation"`
	AllocatedType    string             `json:"allocated_resource_type,omitempty"`
	Allocated        KioskNamedResource `json:"allocated_resource"`
	WarningCodes     any                `json:"warning_codes"`
}

type KioskSessionContext struct {
	SessionID      string     `json:"session_id"`
	OperatorUserID string     `json:"operator_user_id"`
	OperatorCode   string     `json:"operator_code,omitempty"`
	OperatorName   any        `json:"operator_name_i18n,omitempty"`
	TerminalRef    string     `json:"terminal_ref"`
	Status         string     `json:"status"`
	StartedAt      time.Time  `json:"started_at"`
	EndedAt        *time.Time `json:"ended_at,omitempty"`
}

type KioskFailureContext struct {
	HistoryID      string            `json:"history_id"`
	SessionID      string            `json:"session_id,omitempty"`
	ReasonCode     string            `json:"reason_code"`
	ReasonNameI18n map[string]string `json:"reason_name_i18n"`
	ReasonText     *string           `json:"reason_text,omitempty"`
	OperatorUserID string            `json:"operator_user_id"`
	TerminalRef    string            `json:"terminal_ref"`
	OccurredAt     time.Time         `json:"occurred_at"`
}

type KioskActionEligibility struct {
	CanStart    bool     `json:"can_start"`
	CanComplete bool     `json:"can_complete"`
	CanFail     bool     `json:"can_fail"`
	CanAbort    bool     `json:"can_abort"`
	CanRetry    bool     `json:"can_retry"`
	Blockers    []string `json:"blockers"`
}

type KioskFailureImpact struct {
	OperationState    string `json:"operation_state"`
	WorkOrderState    string `json:"work_order_state"`
	SuccessorsBlocked bool   `json:"successors_blocked"`
}

type KioskJobCard struct {
	WOOperationID              string                 `json:"wo_operation_id"`
	OperationID                string                 `json:"operation_id"`
	OperationCode              string                 `json:"operation_code"`
	OperationName              any                    `json:"operation_name_i18n"`
	SequenceNo                 int                    `json:"sequence_no"`
	PredecessorSequences       []int                  `json:"predecessor_sequences"`
	PredecessorStatus          string                 `json:"predecessor_status"`
	SelectedProductionLineID   string                 `json:"selected_production_line_id,omitempty"`
	SelectedProductionLineCode string                 `json:"selected_production_line_code,omitempty"`
	ExecutionTargetType        string                 `json:"execution_target_type"`
	Status                     string                 `json:"status"`
	DisplayState               string                 `json:"display_state"`
	Resource                   KioskResourceContext   `json:"resource"`
	ActiveSession              *KioskSessionContext   `json:"active_session,omitempty"`
	LastSession                *KioskSessionContext   `json:"last_session,omitempty"`
	RequestedQuantity          float64                `json:"requested_quantity"`
	ExpectedGoodQuantity       *float64               `json:"expected_good_quantity,omitempty"`
	QtyGood                    float64                `json:"qty_good"`
	QtyScrap                   float64                `json:"qty_scrap"`
	PlannedStartAt             *time.Time             `json:"planned_start_at,omitempty"`
	PlannedEndAt               *time.Time             `json:"planned_end_at,omitempty"`
	StartedAt                  *time.Time             `json:"started_at,omitempty"`
	FinishedAt                 *time.Time             `json:"finished_at,omitempty"`
	Failure                    *KioskFailureContext   `json:"failure,omitempty"`
	Behavior                   OperationBehaviorRule  `json:"behavior"`
	FailureImpact              KioskFailureImpact     `json:"failure_impact"`
	ActionEligibility          KioskActionEligibility `json:"action_eligibility"`
}

type KioskPrintOperation struct {
	WOOperationID       string     `json:"wo_operation_id"`
	OperationCode       string     `json:"operation_code"`
	OperationName       any        `json:"operation_name_i18n"`
	SequenceNo          int        `json:"sequence_no"`
	Status              string     `json:"status"`
	PrintStatus         string     `json:"print_status"`
	WorkstationID       string     `json:"workstation_id,omitempty"`
	PrintJobID          string     `json:"print_job_id,omitempty"`
	PrintJobCode        string     `json:"print_job_code,omitempty"`
	PrintJobStatus      string     `json:"print_job_status,omitempty"`
	SelectedPrinterCode string     `json:"selected_printer_code,omitempty"`
	LastErrorCode       string     `json:"last_error_code,omitempty"`
	LastErrorMessage    string     `json:"last_error_message,omitempty"`
	DispatchedAt        *time.Time `json:"dispatched_at,omitempty"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	ReadOnly            bool       `json:"read_only"`
}

type KioskWorkOrderDetail struct {
	WorkOrder       KioskWorkOrderSummary `json:"work_order"`
	JobCards        []KioskJobCard        `json:"job_cards"`
	PrintOperations []KioskPrintOperation `json:"print_operations"`
	ProjectionAt    time.Time             `json:"projection_at"`
}
