package dto

import (
	"time"

	"github.com/google/uuid"
)

// ─── Propose Assignment ───────────────────────────────────────────────────────

type ProposeAssignmentRequest struct {
	WorkOrderID string `json:"work_order_id" binding:"required,uuid"`
	OperationID string `json:"operation_id" binding:"required,uuid"`
	// Optional: if empty, system auto-proposes using scoring engine.
	// If provided, uses manual worker selection (treated as manager override).
	WorkerIDs []string `json:"worker_ids"`
	Notes     string   `json:"notes" binding:"max=1000"`
}

// ─── Review Endpoints ─────────────────────────────────────────────────────────

type ApproveAssignmentRequest struct {
	ReviewerID string `json:"reviewer_id" binding:"required,uuid"`
}

type RejectAssignmentRequest struct {
	ReviewerID string `json:"reviewer_id" binding:"required,uuid"`
	Reason     string `json:"reason" binding:"required,min=5,max=500"`
}

type OverrideAssignmentRequest struct {
	ReviewerID string   `json:"reviewer_id" binding:"required,uuid"`
	WorkerIDs  []string `json:"worker_ids" binding:"required,min=1"`
	Notes      string   `json:"notes" binding:"max=1000"`
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

type AssignedWorkerDTO struct {
	ID           uuid.UUID `json:"id"`
	WorkerID     uuid.UUID `json:"worker_id"`
	WorkerName   string    `json:"worker_name"`
	SkillMatched []string  `json:"skill_matched"`
	Score        float64   `json:"score"`
}

type AssignmentDTO struct {
	ID          uuid.UUID          `json:"id"`
	WorkOrderID uuid.UUID          `json:"work_order_id"`
	OperationID uuid.UUID          `json:"operation_id"`
	Revision    int                `json:"revision"`
	Status      string             `json:"status"`
	ProposedBy  string             `json:"proposed_by"`
	ReviewedBy  *uuid.UUID         `json:"reviewed_by,omitempty"`
	Score       float64            `json:"score"`
	Notes       string             `json:"notes,omitempty"`
	Workers     []AssignedWorkerDTO `json:"workers"`
	CreatedAt   time.Time          `json:"created_at"`
	UpdatedAt   time.Time          `json:"updated_at"`
}

type AssignmentHistoryDTO struct {
	WorkOrderID uuid.UUID       `json:"work_order_id"`
	OperationID uuid.UUID       `json:"operation_id"`
	Revisions   []AssignmentDTO `json:"revisions"`
}
