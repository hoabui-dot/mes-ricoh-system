//go:build integration

package http

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/infrastructure/client"
)

func configuredKioskOperatorToken(t *testing.T) string {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	kid := "phase06-http-integration"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"keys": []map[string]string{{
			"kid": kid, "kty": "RSA",
			"n": base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(privateKey.PublicKey.E)).Bytes()),
		}}})
	}))
	t.Cleanup(server.Close)
	issuer := server.URL + "/realms/wonsealtech"
	t.Setenv("KEYCLOAK_URL", server.URL)
	t.Setenv("KEYCLOAK_ISSUERS", issuer)
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": issuer, "sub": "operator-phase06-http", "azp": "mes-client",
		"exp":          time.Now().Add(time.Minute).Unix(),
		"realm_access": map[string]interface{}{"roles": []interface{}{"OPERATOR"}},
	})
	token.Header["kid"] = kid
	value, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func routerIntegrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()
	dsn := os.Getenv("MES_EXECUTION_TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5440/mes_mvp?sslmode=disable"
	}
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := admin.Ping(ctx); err != nil {
		t.Fatalf("integration database unavailable: %v", err)
	}
	schema := "phase01_http_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		t.Fatal(err)
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir("../../../migrations")
	if err != nil {
		t.Fatal(err)
	}
	var files []string
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".up.sql") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)
	for _, name := range files {
		content, err := os.ReadFile(filepath.Join("../../../migrations", name))
		if err != nil {
			t.Fatal(err)
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, string(content)); err != nil {
			_ = tx.Rollback(ctx)
			t.Fatalf("migration %s failed: %v", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+quotedSchema+" CASCADE")
		admin.Close()
	})
	return pool
}

func TestKioskReadHTTPAndMESConsoleCompatibility(t *testing.T) {
	pool := routerIntegrationPool(t)
	operatorToken := configuredKioskOperatorToken(t)
	ctx := context.Background()
	now := time.Now().UTC()
	userID, siteID, lineID, workCenterID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	insertWO := func(code, mode string) (string, string) {
		t.Helper()
		woID, operationID := uuid.NewString(), uuid.NewString()
		_, err := pool.Exec(ctx, `
			INSERT INTO wo_header
			 (wo_id,wo_code,production_version_id,item_revision_id,item_code,item_name,quantity,uom_id,
			  site_id,planned_start_at,planned_end_at,status,created_by,dispatch_mode,
			  selected_production_line_id,selected_production_line_code,line_selection_status)
			VALUES($1,$2,$3,$4,'ITEM-HTTP-P03','HTTP Phase 03',5,$5,$6,$7,$8,'Released',$9,$10,$11,'LINE-P03','READY')
		`, woID, code, uuid.NewString(), uuid.NewString(), uuid.NewString(), siteID,
			now.Add(-time.Hour), now.Add(time.Hour), userID, mode, lineID)
		if err != nil {
			t.Fatal(err)
		}
		_, err = pool.Exec(ctx, `
			INSERT INTO wo_operation
			 (wo_operation_id,wo_id,sequence_no,operation_id,routing_operation_id,operation_code,
			  operation_name,work_center_id,status,execution_target_type,production_line_id,production_line_code)
			VALUES($1,$2,10,$3,$4,'OP-HTTP-P03','{"vi":"HTTP P03","en":"HTTP P03"}',$5,'Ready','MANUAL',$6,'LINE-P03')
		`, operationID, woID, uuid.NewString(), uuid.NewString(), workCenterID, lineID)
		if err != nil {
			t.Fatal(err)
		}
		return woID, operationID
	}
	demoWO, _ := insertWO("WO-HTTP-PHASE03-DEMO", "DEMO_SHARED_KIOSK")
	productionWO, _ := insertWO("WO-HTTP-PHASE03-PROD", "WORK_CENTER")
	router := NewRouter(pool, nil, nil, nil)

	requestJSON := func(path string) (int, map[string]interface{}) {
		t.Helper()
		request := httptest.NewRequest(http.MethodGet, path, nil)
		if strings.Contains(path, "/kiosk/") {
			request.Header.Set("Authorization", "Bearer "+operatorToken)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		var body map[string]interface{}
		_ = json.Unmarshal(response.Body.Bytes(), &body)
		return response.Code, body
	}
	status, list := requestJSON("/api/mes/execution/kiosk/terminals/KIOSK-DEMO-01/work-orders?page=1&page_size=10")
	data, _ := list["data"].([]interface{})
	if status != http.StatusOK || len(data) != 1 || data[0].(map[string]interface{})["wo_id"] != demoWO {
		t.Fatalf("kiosk grouped list mismatch status=%d body=%v", status, list)
	}
	status, firstDetail := requestJSON("/api/mes/execution/kiosk/terminals/KIOSK-DEMO-01/work-orders/" + demoWO)
	if status != http.StatusOK || len(firstDetail["job_cards"].([]interface{})) != 1 {
		t.Fatalf("kiosk detail mismatch status=%d body=%v", status, firstDetail)
	}
	status, secondDetail := requestJSON("/api/mes/execution/kiosk/terminals/KIOSK-DEMO-01/work-orders/" + demoWO)
	delete(firstDetail, "projection_at")
	delete(secondDetail, "projection_at")
	firstJSON, _ := json.Marshal(firstDetail)
	secondJSON, _ := json.Marshal(secondDetail)
	if status != http.StatusOK || !bytes.Equal(firstJSON, secondJSON) {
		t.Fatalf("refresh projection changed without state mutation: first=%s second=%s", firstJSON, secondJSON)
	}
	if status, _ := requestJSON("/api/mes/execution/kiosk/terminals/KIOSK-DEMO-01/work-orders/" + productionWO); status != http.StatusNotFound {
		t.Fatalf("production WO kiosk scope returned %d", status)
	}
	if status, _ := requestJSON("/api/mes/execution/kiosk/terminals/KIOSK-CUT-01/work-orders"); status != http.StatusForbidden {
		t.Fatalf("production terminal demo scope returned %d", status)
	}

	status, consoleList := requestJSON("/api/mes/execution/work-orders?limit=10")
	consoleData, _ := consoleList["data"].([]interface{})
	if status != http.StatusOK || len(consoleData) != 2 {
		t.Fatalf("MES Console list compatibility failed status=%d body=%v", status, consoleList)
	}
	status, consoleDetail := requestJSON("/api/mes/execution/work-orders/" + productionWO)
	if status != http.StatusOK || consoleDetail["header"] == nil || consoleDetail["operations"] == nil {
		t.Fatalf("MES Console detail compatibility failed status=%d body=%v", status, consoleDetail)
	}
}

func TestFailAndRetryHTTPIntegration(t *testing.T) {
	pool := routerIntegrationPool(t)
	ctx := context.Background()
	userID, woID, operationID, sessionID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	siteID, lineID, workCenterID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	now := time.Now().UTC()
	_, err := pool.Exec(ctx, `
		INSERT INTO wo_header
		  (wo_id,wo_code,production_version_id,item_revision_id,item_code,item_name,quantity,
		   uom_id,site_id,planned_start_at,planned_end_at,status,created_by,
		   selected_production_line_id,line_selection_status)
		VALUES($1,'WO-PHASE01-HTTP',$2,$3,'ITEM-HTTP','HTTP Item',10,$4,$5,$6,$7,'InProgress',$8,$9,'SELECTED')
	`, woID, uuid.NewString(), uuid.NewString(), uuid.NewString(), siteID,
		now.Add(-time.Hour), now.Add(time.Hour), userID, lineID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO wo_operation
		  (wo_operation_id,wo_id,sequence_no,operation_id,operation_code,work_center_id,
		   status,execution_target_type,production_line_id)
		VALUES($1,$2,10,$3,'OP-HTTP',$4,'InProgress','KIOSK_DEMO',$5)
	`, operationID, woID, uuid.NewString(), workCenterID, lineID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO execution_session(session_id,wo_operation_id,terminal_ref,operator_user_id,status)
		VALUES($1,$2,'KIOSK-DEMO-01',$3,'IN_PROGRESS')
	`, sessionID, operationID, userID)
	if err != nil {
		t.Fatal(err)
	}
	reasonServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"code":"EXEC-EQUIPMENT","name":{"vi":"Loi thiet bi","en":"Equipment failure"},"reason_type":"ExecutionFailure","lifecycle_status":"Released","requires_comment":true}]}`))
	}))
	defer reasonServer.Close()
	router := NewRouter(pool, nil, nil, client.NewFailureReasonClient(reasonServer.URL))

	request := httptest.NewRequest(http.MethodPost, "/api/mes/execution/work-orders/"+woID+"/operations/"+operationID+"/fail", bytes.NewBufferString(`{"session_id":"`+sessionID+`","reason_code":"EXEC-EQUIPMENT","reason_text":"Machine stopped","terminal_ref":"KIOSK-DEMO-01"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-User-ID", userID)
	request.Header.Set("X-Role-Code", "OPERATOR")
	request.Header.Set("Idempotency-Key", "http-fail-1")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("fail returned %d: %s", response.Code, response.Body.String())
	}

	invalidReason := httptest.NewRequest(http.MethodPost, "/api/mes/execution/work-orders/"+woID+"/operations/"+operationID+"/fail", bytes.NewBufferString(`{"session_id":"`+sessionID+`","reason_code":"UNKNOWN"}`))
	invalidReason.Header.Set("X-User-ID", userID)
	invalidReason.Header.Set("Idempotency-Key", "http-fail-invalid")
	invalidResponse := httptest.NewRecorder()
	router.ServeHTTP(invalidResponse, invalidReason)
	if invalidResponse.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid reason returned %d: %s", invalidResponse.Code, invalidResponse.Body.String())
	}

	retry := httptest.NewRequest(http.MethodPost, "/api/mes/execution/work-orders/"+woID+"/operations/"+operationID+"/retry", bytes.NewBufferString(`{"terminal_ref":"KIOSK-DEMO-01"}`))
	retry.Header.Set("Content-Type", "application/json")
	retry.Header.Set("X-User-ID", userID)
	retry.Header.Set("X-Role-Code", "OPERATOR")
	retry.Header.Set("Idempotency-Key", "http-retry-1")
	retryResponse := httptest.NewRecorder()
	router.ServeHTTP(retryResponse, retry)
	if retryResponse.Code != http.StatusOK {
		t.Fatalf("retry returned %d: %s", retryResponse.Code, retryResponse.Body.String())
	}
	var woStatus, operationStatus, sessionStatus string
	if err := pool.QueryRow(ctx, `SELECT h.status::text,o.status,s.status FROM wo_header h JOIN wo_operation o ON o.wo_id=h.wo_id JOIN execution_session s ON s.wo_operation_id=o.wo_operation_id WHERE h.wo_id=$1`, woID).Scan(&woStatus, &operationStatus, &sessionStatus); err != nil {
		t.Fatal(err)
	}
	if woStatus != "InProgress" || operationStatus != "Ready" || sessionStatus != "FAILED" {
		t.Fatalf("unexpected final states: WO=%s operation=%s session=%s", woStatus, operationStatus, sessionStatus)
	}
}
