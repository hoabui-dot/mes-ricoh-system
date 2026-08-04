package client

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFailureReasonClientValidate(t *testing.T) {
	tests := []struct {
		name       string
		status     int
		body       string
		code       string
		wantErr    string
		wantReason string
	}{
		{
			name:       "released execution failure",
			status:     http.StatusOK,
			body:       `{"data":[{"code":"EXEC-EQUIPMENT","name":{"vi":"Loi thiet bi"},"reason_type":"ExecutionFailure","lifecycle_status":"Released","requires_comment":true}]}`,
			code:       "EXEC-EQUIPMENT",
			wantReason: "EXEC-EQUIPMENT",
		},
		{
			name:    "wrong reason type",
			status:  http.StatusOK,
			body:    `{"data":[{"code":"QC-FAIL","name":{"vi":"Loi QC"},"reason_type":"Quality","lifecycle_status":"Released"}]}`,
			code:    "QC-FAIL",
			wantErr: "FAILURE_REASON_NOT_APPROVED",
		},
		{
			name:    "dependency unavailable",
			status:  http.StatusServiceUnavailable,
			body:    `{}`,
			code:    "EXEC-EQUIPMENT",
			wantErr: "FAILURE_REASON_DEPENDENCY_5XX",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(test.status)
				_, _ = w.Write([]byte(test.body))
			}))
			defer server.Close()
			client := NewFailureReasonClient(server.URL)
			reason, err := client.Validate(context.Background(), test.code)
			if test.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), test.wantErr) {
					t.Fatalf("expected error containing %q, got %v", test.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("Validate returned error: %v", err)
			}
			if reason.Code != test.wantReason || !reason.RequiresComment {
				t.Fatalf("unexpected reason: %#v", reason)
			}
		})
	}
}

func TestFailureReasonClientRequiresCode(t *testing.T) {
	client := NewFailureReasonClient("http://unused")
	if _, err := client.Validate(context.Background(), " "); err == nil || !strings.Contains(err.Error(), "FAILURE_REASON_REQUIRED") {
		t.Fatalf("expected FAILURE_REASON_REQUIRED, got %v", err)
	}
}
