package realtime

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return r.Header.Get("Origin") == "" || strings.HasPrefix(r.Header.Get("Origin"), "http://") || strings.HasPrefix(r.Header.Get("Origin"), "https://")
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type Hub struct {
	keycloakUserInfoURL string
	client              *http.Client
	mu                  sync.RWMutex
	clients             map[*client]struct{}
}

type client struct {
	conn *websocket.Conn
	send chan []byte
}

func NewHub(keycloakUserInfoURL string) *Hub {
	return &Hub{
		keycloakUserInfoURL: strings.TrimRight(keycloakUserInfoURL, "/"),
		client:              &http.Client{Timeout: 5 * time.Second},
		clients:             make(map[*client]struct{}),
	}
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &client{conn: conn, send: make(chan []byte, 128)}
	defer conn.Close()

	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	var auth struct {
		Type  string `json:"type"`
		Token string `json:"token"`
	}
	if err := conn.ReadJSON(&auth); err != nil || auth.Type != "auth" || !h.validateToken(r.Context(), auth.Token) {
		_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "authentication required"), time.Now().Add(time.Second))
		return
	}
	_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.clients, c)
		h.mu.Unlock()
	}()

	go h.writePump(c)
	for {
		var frame struct {
			Type string `json:"type"`
		}
		if err := conn.ReadJSON(&frame); err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		if frame.Type == "heartbeat" {
			select {
			case c.send <- []byte(`{"type":"heartbeat_ack"}`):
			default:
			}
		}
	}
}

func (h *Hub) Broadcast(event []byte) {
	var envelope map[string]any
	if err := json.Unmarshal(event, &envelope); err != nil {
		return
	}
	envelope["message_type"] = "wms.material_request.updated"
	message, err := json.Marshal(envelope)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.send <- message:
		default:
			log.Printf("[Realtime] dropping WMS event for slow client")
		}
	}
}

func (h *Hub) writePump(c *client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case message := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) validateToken(ctx context.Context, token string) bool {
	if token == "" || h.keycloakUserInfoURL == "" {
		return false
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.keycloakUserInfoURL, nil)
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := h.client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}
