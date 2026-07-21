package usecase

import (
	"errors"

	"github.com/mom-platform/mes-execution-service/internal/domain"
)

func DetermineDemand(intent domain.DemandIntent) (domain.DemandIntent, error) {
	if intent.Quantity <= 0 {
		return intent, errors.New("quantity must be greater than zero")
	}
	return intent, nil
}
