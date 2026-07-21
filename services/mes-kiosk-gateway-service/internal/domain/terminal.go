package domain

import (
	"encoding/json"
	"time"
)

type TerminalStatus string

const (
	TerminalStatusOnline   TerminalStatus = "ONLINE"
	TerminalStatusOffline  TerminalStatus = "OFFLINE"
	TerminalStatusDisabled TerminalStatus = "DISABLED"
)

type Terminal struct {
	TerminalID   string         `json:"terminal_id"`
	TerminalCode string         `json:"terminal_code"`
	SiteID       string         `json:"site_id"`
	WorkCenterID string         `json:"work_center_id"`
	Status       TerminalStatus `json:"status"`
	LastSeenAt   *time.Time     `json:"last_seen_at,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

type TerminalSession struct {
	SessionID      string    `json:"session_id"`
	TerminalID     string    `json:"terminal_id"`
	OperatorUserID string    `json:"operator_user_id"`
	LoggedInAt     time.Time `json:"logged_in_at"`
	LoggedOutAt    *time.Time`json:"logged_out_at,omitempty"`
	Status         string    `json:"status"` // ACTIVE, CLOSED
}

type OutboundMessage struct {
	MessageID   string          `json:"message_id"`
	TerminalID  string          `json:"terminal_id"`
	Payload     json.RawMessage `json:"payload"`
	EventType   string          `json:"event_type"`
	Status      string          `json:"status"` // PENDING, DELIVERED, EXPIRED
	CreatedAt   time.Time       `json:"created_at"`
	DeliveredAt *time.Time      `json:"delivered_at,omitempty"`
}

type LoginInput struct {
	EmployeeID string `json:"employee_id"`
	PIN        string `json:"pin"`
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
	UserID       string `json:"user_id,omitempty"`
	Username     string `json:"username,omitempty"`
}

type WSIncomingFrame struct {
	Type  string `json:"type"`            // auth, heartbeat
	Token string `json:"token,omitempty"` // used in auth frame
}

type WSOutboundFrame struct {
	Type      string      `json:"type"`       // wo_assigned, operation_state_changed, terminal_disabled, heartbeat_ack
	EventType string      `json:"event_type"` // event name if applicable
	Data      interface{} `json:"data"`
	Timestamp string      `json:"timestamp"`
}
