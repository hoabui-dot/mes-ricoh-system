package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/application"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/domain"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow shopfloor tablets & localhost
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type Client struct {
	TerminalID   string
	WorkCenterID string
	Conn         *websocket.Conn
	Authenticated bool
	LastSeen     time.Time
	Send         chan []byte
}

type Hub struct {
	pool        *pgxpool.Pool
	authService *application.AuthService
	clients     map[string]*Client // terminal_id -> Client
	mu          sync.RWMutex
}

func NewHub(pool *pgxpool.Pool, authService *application.AuthService) *Hub {
	h := &Hub{
		pool:        pool,
		authService: authService,
		clients:     make(map[string]*Client),
	}
	go h.startHeartbeatChecker()
	return h
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	terminalID := r.URL.Query().Get("terminal_id")
	if terminalID == "" {
		http.Error(w, "missing terminal_id parameter", http.StatusBadRequest)
		return
	}

	// Fetch terminal details by terminal_id OR terminal_code
	var realTerminalID, wcID string
	err := h.pool.QueryRow(r.Context(), `SELECT terminal_id, work_center_id FROM terminal WHERE terminal_id::text = $1 OR terminal_code = $1`, terminalID).Scan(&realTerminalID, &wcID)
	if err != nil {
		http.Error(w, "terminal not found", http.StatusNotFound)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade failed for terminal %s: %v", terminalID, err)
		return
	}

	client := &Client{
		TerminalID:   realTerminalID,
		WorkCenterID: wcID,
		Conn:         conn,
		LastSeen:     time.Now().UTC(),
		Send:         make(chan []byte, 256),
	}

	h.registerClient(client)

	go client.writePump()
	client.readPump(h)
}

func (h *Hub) registerClient(client *Client) {
	h.mu.Lock()
	if existing, ok := h.clients[client.TerminalID]; ok {
		existing.Conn.Close()
	}
	h.clients[client.TerminalID] = client
	h.mu.Unlock()
}

func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	if c, ok := h.clients[client.TerminalID]; ok && c == client {
		delete(h.clients, client.TerminalID)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = h.pool.Exec(ctx, `UPDATE terminal SET status = 'OFFLINE', updated_at = NOW() WHERE terminal_id = $1`, client.TerminalID)
	}
	h.mu.Unlock()
}

func (c *Client) readPump(h *Hub) {
	defer func() {
		h.unregisterClient(c)
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(512 * 1024)
	_ = c.Conn.SetReadDeadline(time.Now().Add(120 * time.Second))

	// Auth timeout check
	authTimer := time.NewTimer(10 * time.Second)
	go func() {
		<-authTimer.C
		if !c.Authenticated {
			log.Printf("[WebSocket] Auth timeout for terminal %s, closing connection", c.TerminalID)
			c.Conn.Close()
		}
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var frame domain.WSIncomingFrame
		if err := json.Unmarshal(message, &frame); err != nil {
			continue
		}

		c.LastSeen = time.Now().UTC()
		_ = c.Conn.SetReadDeadline(time.Now().Add(120 * time.Second))

		switch frame.Type {
		case "auth":
			authTimer.Stop()
			if frame.Token == "" {
				log.Printf("[WebSocket] Empty token from terminal %s", c.TerminalID)
				return
			}
			_, err := h.authService.ValidateToken(frame.Token)
			if err != nil {
				log.Printf("[WebSocket] Token validation failed for terminal %s: %v", c.TerminalID, err)
				return
			}
			c.Authenticated = true
			log.Printf("[WebSocket] Terminal %s authenticated successfully", c.TerminalID)

			// Mark terminal ONLINE
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_, _ = h.pool.Exec(ctx, `UPDATE terminal SET status = 'ONLINE', last_seen_at = NOW(), updated_at = NOW() WHERE terminal_id = $1`, c.TerminalID)
			cancel()

			// Drain offline queued messages
			go h.drainOutboundQueue(c.TerminalID)

		case "heartbeat":
			if c.Authenticated {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				_, _ = h.pool.Exec(ctx, `UPDATE terminal SET last_seen_at = NOW(), updated_at = NOW() WHERE terminal_id = $1`, c.TerminalID)
				cancel()

				ackFrame := domain.WSOutboundFrame{
					Type:      "heartbeat_ack",
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				}
				b, _ := json.Marshal(ackFrame)
				c.Send <- b
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)
			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) drainOutboundQueue(terminalID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rows, err := h.pool.Query(ctx, `
		SELECT message_id, event_type, payload
		FROM outbound_message_queue
		WHERE terminal_id = $1 AND status = 'PENDING'
		ORDER BY created_at ASC
	`, terminalID)
	if err != nil {
		return
	}
	defer rows.Close()

	type item struct {
		msgID, eventType string
		payload          json.RawMessage
	}
	var items []item
	for rows.Next() {
		var it item
		_ = rows.Scan(&it.msgID, &it.eventType, &it.payload)
		items = append(items, it)
	}

	h.mu.RLock()
	client, isConnected := h.clients[terminalID]
	h.mu.RUnlock()

	if !isConnected || !client.Authenticated {
		return
	}

	for _, it := range items {
		outFrame := domain.WSOutboundFrame{
			Type:      "queued_event",
			EventType: it.eventType,
			Data:      it.payload,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		}
		b, _ := json.Marshal(outFrame)
		client.Send <- b

		_, _ = h.pool.Exec(ctx, `
			UPDATE outbound_message_queue
			SET status = 'DELIVERED', delivered_at = NOW()
			WHERE message_id = $1
		`, it.msgID)
	}
}

func (h *Hub) BroadcastToWorkCenter(ctx context.Context, workCenterID, eventType string, payload interface{}) error {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	// Find all terminals for this work center
	rows, err := h.pool.Query(ctx, `SELECT terminal_id, status FROM terminal WHERE work_center_id = $1`, workCenterID)
	if err != nil {
		return err
	}
	defer rows.Close()

	type tInfo struct {
		id, status string
	}
	var terminals []tInfo
	for rows.Next() {
		var t tInfo
		_ = rows.Scan(&t.id, &t.status)
		terminals = append(terminals, t)
	}

	outFrame := domain.WSOutboundFrame{
		Type:      "event",
		EventType: eventType,
		Data:      payload,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	outBytes, _ := json.Marshal(outFrame)

	for _, term := range terminals {
		h.mu.RLock()
		client, connected := h.clients[term.id]
		h.mu.RUnlock()

		if connected && client.Authenticated {
			client.Send <- outBytes
		} else {
			// Queue message in outbound_message_queue for offline terminal
			msgID := uuid.New().String()
			_, _ = h.pool.Exec(ctx, `
				INSERT INTO outbound_message_queue (message_id, terminal_id, payload, event_type, status, created_at)
				VALUES ($1, $2, $3, $4, 'PENDING', NOW())
			`, msgID, term.id, payloadBytes, eventType)
		}
	}

	return nil
}

func (h *Hub) startHeartbeatChecker() {
	ticker := time.NewTicker(15 * time.Second)
	for range ticker.C {
		now := time.Now().UTC()
		h.mu.Lock()
		for id, client := range h.clients {
			if now.Sub(client.LastSeen) > 90*time.Second {
				log.Printf("[WebSocket] Terminal %s heartbeat timed out (>90s), marking OFFLINE", id)
				client.Conn.Close()
				delete(h.clients, id)

				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				_, _ = h.pool.Exec(ctx, `UPDATE terminal SET status = 'OFFLINE', updated_at = NOW() WHERE terminal_id = $1`, id)
				cancel()
			}
		}
		h.mu.Unlock()
	}
}
