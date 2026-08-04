package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/application"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/domain"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(_ *http.Request) bool { return true },
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type Client struct {
	TerminalID   string
	WorkCenterID string
	Conn         *websocket.Conn
	LastSeen     time.Time
	Send         chan []byte
	writeMu      sync.Mutex
}

type Hub struct {
	pool        *pgxpool.Pool
	authService *application.AuthService
	clients     map[string]*Client
	demoCode    string
	mu          sync.RWMutex
	drainMu     sync.Mutex
}

func NewHub(pool *pgxpool.Pool, authService *application.AuthService) *Hub {
	demoCode := os.Getenv("DEMO_KIOSK_TERMINAL_CODE")
	if demoCode == "" {
		demoCode = "KIOSK-DEMO-01"
	}
	h := &Hub{pool: pool, authService: authService, clients: make(map[string]*Client), demoCode: demoCode}
	go h.startHeartbeatChecker()
	return h
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	terminalRef := r.URL.Query().Get("terminal_id")
	if terminalRef == "" {
		http.Error(w, "missing terminal_id parameter", http.StatusBadRequest)
		return
	}

	var terminalID, workCenterID string
	if err := h.pool.QueryRow(r.Context(), `
		SELECT terminal_id::text, work_center_id::text
		FROM terminal
		WHERE terminal_id::text=$1 OR terminal_code=$1
	`, terminalRef).Scan(&terminalID, &workCenterID); err != nil {
		http.Error(w, "terminal not found", http.StatusNotFound)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] upgrade failed for terminal %s: %v", terminalRef, err)
		return
	}
	client := &Client{
		TerminalID:   terminalID,
		WorkCenterID: workCenterID,
		Conn:         conn,
		LastSeen:     time.Now().UTC(),
		Send:         make(chan []byte, 256),
	}
	go client.writePump()
	client.readPump(h)
}

func (h *Hub) registerClient(client *Client) {
	h.mu.Lock()
	if existing := h.clients[client.TerminalID]; existing != nil {
		_ = existing.Conn.Close()
	}
	h.clients[client.TerminalID] = client
	h.mu.Unlock()
}

func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	registered := h.clients[client.TerminalID] == client
	if registered {
		delete(h.clients, client.TerminalID)
	}
	h.mu.Unlock()
	if registered {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = h.pool.Exec(ctx, `UPDATE terminal SET status='OFFLINE', updated_at=NOW() WHERE terminal_id=$1`, client.TerminalID)
	}
}

func (c *Client) readPump(h *Hub) {
	authenticated := false
	defer func() {
		if authenticated {
			h.unregisterClient(c)
		}
		_ = c.Conn.Close()
	}()

	c.Conn.SetReadLimit(512 * 1024)
	_ = c.Conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			return
		}
		var frame domain.WSIncomingFrame
		if err := json.Unmarshal(message, &frame); err != nil {
			continue
		}

		if !authenticated && frame.Type != "auth" {
			_ = c.writeControl("auth_error", map[string]string{"code": "AUTH_REQUIRED"})
			return
		}
		switch frame.Type {
		case "auth":
			if authenticated {
				continue
			}
			claims, err := h.authService.ValidateOperatorToken(frame.Token)
			if err != nil {
				log.Printf("[WebSocket] token rejected for terminal %s: %v", c.TerminalID, err)
				_ = c.writeControl("auth_error", map[string]string{"code": "TOKEN_INVALID"})
				return
			}
			userID, _ := claims["sub"].(string)
			if !h.authService.HasActiveTerminalSession(context.Background(), c.TerminalID, userID) {
				_ = c.writeControl("auth_error", map[string]string{"code": "TERMINAL_SESSION_INACTIVE"})
				return
			}
			authenticated = true
			c.LastSeen = time.Now().UTC()
			_ = c.Conn.SetReadDeadline(time.Now().Add(120 * time.Second))
			h.registerClient(c)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_, _ = h.pool.Exec(ctx, `UPDATE terminal SET status='ONLINE', last_seen_at=NOW(), updated_at=NOW() WHERE terminal_id=$1`, c.TerminalID)
			cancel()
			c.sendFrame(domain.WSOutboundFrame{Type: "auth_ack", Timestamp: time.Now().UTC().Format(time.RFC3339Nano)})
			go h.drainOutboundQueue(c.TerminalID)

		case "event_ack":
			if frame.MessageID == "" {
				continue
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_, _ = h.pool.Exec(ctx, `
				UPDATE outbound_message_queue
				SET status='DELIVERED', delivered_at=COALESCE(delivered_at,NOW())
				WHERE message_id=$1 AND terminal_id=$2 AND status='PENDING'
			`, frame.MessageID, c.TerminalID)
			cancel()

		case "heartbeat":
			c.LastSeen = time.Now().UTC()
			_ = c.Conn.SetReadDeadline(time.Now().Add(120 * time.Second))
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_, _ = h.pool.Exec(ctx, `UPDATE terminal SET last_seen_at=NOW(), updated_at=NOW() WHERE terminal_id=$1`, c.TerminalID)
			cancel()
			c.sendFrame(domain.WSOutboundFrame{Type: "heartbeat_ack", Timestamp: time.Now().UTC().Format(time.RFC3339Nano)})
		}
	}
}

func (h *Hub) DisconnectTerminal(terminalID string) {
	h.mu.RLock()
	client := h.clients[terminalID]
	h.mu.RUnlock()
	if client != nil {
		_ = client.Conn.Close()
	}
}

func (c *Client) sendFrame(frame domain.WSOutboundFrame) {
	b, err := json.Marshal(frame)
	if err != nil {
		return
	}
	select {
	case c.Send <- b:
	default:
		_ = c.Conn.Close()
	}
}

func (c *Client) writeControl(frameType string, data interface{}) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.Conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return c.Conn.WriteJSON(domain.WSOutboundFrame{
		Type: frameType, Data: data, Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		_ = c.Conn.Close()
	}()
	for {
		select {
		case message := <-c.Send:
			c.writeMu.Lock()
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			err := c.Conn.WriteMessage(websocket.TextMessage, message)
			c.writeMu.Unlock()
			if err != nil {
				return
			}
		case <-ticker.C:
			c.writeMu.Lock()
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			err := c.Conn.WriteMessage(websocket.PingMessage, nil)
			c.writeMu.Unlock()
			if err != nil {
				return
			}
		}
	}
}

func (h *Hub) BroadcastToWorkCenters(ctx context.Context, workCenterIDs []string, eventID, eventType string, payload interface{}) error {
	seen := make(map[string]struct{}, len(workCenterIDs))
	for _, workCenterID := range workCenterIDs {
		if workCenterID == "" {
			continue
		}
		if _, ok := seen[workCenterID]; ok {
			continue
		}
		seen[workCenterID] = struct{}{}
		rows, err := h.pool.Query(ctx, `
			SELECT terminal_id::text FROM terminal
			WHERE work_center_id=$1 AND status <> 'DISABLED' AND terminal_code <> $2
		`, workCenterID, h.demoCode)
		if err != nil {
			return err
		}
		var terminalIDs []string
		for rows.Next() {
			var terminalID string
			if err := rows.Scan(&terminalID); err != nil {
				rows.Close()
				return err
			}
			terminalIDs = append(terminalIDs, terminalID)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		for _, terminalID := range terminalIDs {
			if err := h.enqueue(ctx, terminalID, eventID, eventType, payload); err != nil {
				return err
			}
		}
	}
	return nil
}

func (h *Hub) BroadcastToTerminalCode(ctx context.Context, terminalCode, eventID, eventType string, payload interface{}) error {
	var terminalID string
	if err := h.pool.QueryRow(ctx, `SELECT terminal_id::text FROM terminal WHERE terminal_code=$1 AND status <> 'DISABLED'`, terminalCode).Scan(&terminalID); err != nil {
		return err
	}
	return h.enqueue(ctx, terminalID, eventID, eventType, payload)
}

func (h *Hub) enqueue(ctx context.Context, terminalID, eventID, eventType string, payload interface{}) error {
	if eventID == "" {
		return fmt.Errorf("event_id is required")
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = h.pool.Exec(ctx, `
		INSERT INTO outbound_message_queue(message_id,terminal_id,event_id,payload,event_type,status,created_at)
		VALUES($1,$2,$3,$4,$5,'PENDING',NOW())
		ON CONFLICT(terminal_id,event_id) DO NOTHING
	`, uuid.NewString(), terminalID, eventID, payloadBytes, eventType)
	if err != nil {
		return err
	}
	h.mu.RLock()
	connected := h.clients[terminalID] != nil
	h.mu.RUnlock()
	if connected {
		go h.drainOutboundQueue(terminalID)
	}
	return nil
}

func (h *Hub) drainOutboundQueue(terminalID string) {
	h.drainMu.Lock()
	defer h.drainMu.Unlock()

	h.mu.RLock()
	client := h.clients[terminalID]
	h.mu.RUnlock()
	if client == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rows, err := h.pool.Query(ctx, `
		SELECT message_id::text,event_id,event_type,payload
		FROM outbound_message_queue
		WHERE terminal_id=$1 AND status='PENDING'
		ORDER BY created_at,message_id
	`, terminalID)
	if err != nil {
		log.Printf("[WebSocket] queue read failed for terminal %s: %v", terminalID, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var messageID, eventID, eventType string
		var payload json.RawMessage
		if err := rows.Scan(&messageID, &eventID, &eventType, &payload); err != nil {
			return
		}
		client.sendFrame(domain.WSOutboundFrame{
			Type: "event", EventType: eventType, EventID: eventID, MessageID: messageID,
			Data: payload, Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		})
	}
}

func (h *Hub) startHeartbeatChecker() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for now := range ticker.C {
		h.mu.RLock()
		var stale []*Client
		for _, client := range h.clients {
			if now.UTC().Sub(client.LastSeen) > 90*time.Second {
				stale = append(stale, client)
			}
		}
		h.mu.RUnlock()
		for _, client := range stale {
			log.Printf("[WebSocket] heartbeat timeout for terminal %s", client.TerminalID)
			_ = client.Conn.Close()
		}
	}
}
