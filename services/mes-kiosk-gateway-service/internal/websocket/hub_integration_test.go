//go:build integration

package websocket

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	gorillaws "github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/application"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/domain"
	"github.com/mom-platform/mes-kiosk-gateway-service/internal/testsupport"
)

func TestAuthenticatedReconnectDrainsFIFOAndAcknowledgesDelivery(t *testing.T) {
	pool := testsupport.IsolatedPool(t)
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	kid := "phase02-websocket"
	jwksServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"keys": []map[string]string{{
			"kid": kid, "kty": "RSA",
			"n": base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(privateKey.PublicKey.E)).Bytes()),
		}}})
	}))
	defer jwksServer.Close()
	authService := application.NewAuthService(pool, jwksServer.URL, "wonsealtech", "mes-client")
	hub := NewHub(pool, authService)
	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()

	eventIDs := []string{"phase02-fifo-01", "phase02-fifo-02", "phase02-fifo-03"}
	for _, eventID := range eventIDs {
		if err := hub.BroadcastToTerminalCode(context.Background(), "KIOSK-DEMO-01", eventID, "MES.Execution.OperationStarted.v1", map[string]string{"event_id": eventID}); err != nil {
			t.Fatal(err)
		}
		time.Sleep(time.Millisecond)
	}

	validToken := signedToken(t, privateKey, kid, jwksServer.URL+"/realms/wonsealtech", time.Now().Add(time.Minute))
	activateTerminalSession(t, pool, "operator-phase02")
	connection := dialTerminal(t, server.URL, validToken)
	defer connection.Close()
	if frame := readFrame(t, connection); frame.Type != "auth_ack" {
		t.Fatalf("expected explicit auth_ack, got %+v", frame)
	}
	for _, expectedEventID := range eventIDs {
		frame := readFrame(t, connection)
		if frame.Type != "event" || frame.EventID != expectedEventID || frame.MessageID == "" {
			t.Fatalf("FIFO delivery mismatch: expected %s, got %+v", expectedEventID, frame)
		}
		if err := connection.WriteJSON(domain.WSIncomingFrame{Type: "event_ack", MessageID: frame.MessageID}); err != nil {
			t.Fatal(err)
		}
	}

	deadline := time.Now().Add(3 * time.Second)
	for {
		var delivered int
		if err := pool.QueryRow(context.Background(), `SELECT COUNT(*)::int FROM outbound_message_queue WHERE event_id=ANY($1) AND status='DELIVERED'`, eventIDs).Scan(&delivered); err != nil {
			t.Fatal(err)
		}
		if delivered == len(eventIDs) {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("only %d/%d messages acknowledged", delivered, len(eventIDs))
		}
		time.Sleep(20 * time.Millisecond)
	}

	_ = connection.Close()
	reconnected := dialTerminal(t, server.URL, validToken)
	defer reconnected.Close()
	if frame := readFrame(t, reconnected); frame.Type != "auth_ack" {
		t.Fatalf("reconnect did not authenticate: %+v", frame)
	}
}

func TestProductionWorkCenterBroadcastExcludesDemoTerminal(t *testing.T) {
	pool := testsupport.IsolatedPool(t)
	hub := NewHub(pool, nil)
	eventID := "phase02-production-isolation"
	if err := hub.BroadcastToWorkCenters(context.Background(), []string{"40000000-0000-0000-0000-000000000004"}, eventID, "MES.Execution.OperationStarted.v1", map[string]string{"event_id": eventID}); err != nil {
		t.Fatal(err)
	}
	var demoCount, productionCount int
	if err := pool.QueryRow(context.Background(), `
		SELECT COUNT(*) FILTER (WHERE t.terminal_code='KIOSK-DEMO-01')::int,
		       COUNT(*) FILTER (WHERE t.terminal_code='KIOSK-MOLD-01')::int
		FROM outbound_message_queue q JOIN terminal t ON t.terminal_id=q.terminal_id
		WHERE q.event_id=$1
	`, eventID).Scan(&demoCount, &productionCount); err != nil {
		t.Fatal(err)
	}
	if demoCount != 0 || productionCount != 1 {
		t.Fatalf("production route isolation failed: demo=%d production=%d", demoCount, productionCount)
	}
}

func TestWebSocketRejectsInvalidAndExpiredTokens(t *testing.T) {
	pool := testsupport.IsolatedPool(t)
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	kid := "phase02-rejection"
	jwksServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"keys": []map[string]string{{
			"kid": kid, "kty": "RSA",
			"n": base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(privateKey.PublicKey.E)).Bytes()),
		}}})
	}))
	defer jwksServer.Close()
	hub := NewHub(pool, application.NewAuthService(pool, jwksServer.URL, "wonsealtech", "mes-client"))
	server := httptest.NewServer(http.HandlerFunc(hub.HandleWebSocket))
	defer server.Close()

	for name, token := range map[string]string{
		"invalid": "not-a-jwt",
		"expired": signedToken(t, privateKey, kid, jwksServer.URL+"/realms/wonsealtech", time.Now().Add(-time.Minute)),
	} {
		t.Run(name, func(t *testing.T) {
			connection := dialTerminal(t, server.URL, token)
			defer connection.Close()
			if frame := readFrame(t, connection); frame.Type != "auth_error" {
				t.Fatalf("expected auth_error, got %+v", frame)
			}
		})
	}
}

func signedToken(t *testing.T, key *rsa.PrivateKey, kid, issuer string, expiresAt time.Time) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": issuer, "sub": "operator-phase02", "azp": "mes-client", "exp": expiresAt.Unix(),
		"realm_access": map[string]interface{}{"roles": []interface{}{"OPERATOR"}},
	})
	token.Header["kid"] = kid
	value, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func activateTerminalSession(t *testing.T, pool *pgxpool.Pool, userID string) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), `
		UPDATE terminal_session SET status='CLOSED',logged_out_at=NOW()
		WHERE terminal_id=(SELECT terminal_id FROM terminal WHERE terminal_code='KIOSK-DEMO-01') AND status='ACTIVE'
	`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `
		INSERT INTO terminal_session(session_id,terminal_id,operator_user_id,status)
		SELECT gen_random_uuid(),terminal_id,$1,'ACTIVE' FROM terminal WHERE terminal_code='KIOSK-DEMO-01'
	`, userID); err != nil {
		t.Fatal(err)
	}
}

func dialTerminal(t *testing.T, serverURL, token string) *gorillaws.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(serverURL, "http") + "?terminal_id=KIOSK-DEMO-01"
	connection, _, err := gorillaws.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := connection.WriteJSON(domain.WSIncomingFrame{Type: "auth", Token: token}); err != nil {
		t.Fatal(err)
	}
	return connection
}

func readFrame(t *testing.T, connection *gorillaws.Conn) domain.WSOutboundFrame {
	t.Helper()
	_ = connection.SetReadDeadline(time.Now().Add(3 * time.Second))
	var frame domain.WSOutboundFrame
	if err := connection.ReadJSON(&frame); err != nil {
		t.Fatal(err)
	}
	return frame
}
