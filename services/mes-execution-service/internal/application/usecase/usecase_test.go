package usecase_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/mom-platform/mes-execution-service/internal/application/usecase"
	"github.com/mom-platform/mes-execution-service/internal/domain"
)

func TestDetermineDemand(t *testing.T) {
	intent := domain.DemandIntent{
		ItemRevisionID:       "00000000-0000-0000-0000-000000000001",
		Quantity:             500,
		SiteID:               "00000000-0000-0000-0000-000000000002",
		TargetCompletionDate: time.Now(),
	}

	res, err := usecase.DetermineDemand(intent)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if res.Quantity != 500 {
		t.Fatalf("expected quantity 500, got %f", res.Quantity)
	}

	invalidIntent := domain.DemandIntent{Quantity: 0}
	if _, err := usecase.DetermineDemand(invalidIntent); err == nil {
		t.Fatalf("expected error for 0 quantity")
	}
}

func TestComputeResultStructHasNoStockFields(t *testing.T) {
	resType := reflect.TypeOf(domain.ComputeResult{})
	for i := 0; i < resType.NumField(); i++ {
		field := resType.Field(i)
		fieldName := field.Name
		if fieldName == "Stock" || fieldName == "Inventory" || fieldName == "StockCheckStatus" {
			t.Fatalf("ComputeResult must not contain any stock or inventory fields, found: %s", fieldName)
		}
	}
}
