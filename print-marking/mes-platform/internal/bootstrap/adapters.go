// Package bootstrap provides cross-module query adapters.
// These adapters wire infrastructure repositories from other modules to the
// assignment service ports, without creating a dependency between modules.
// Only the bootstrap (composition root) is allowed to import across module boundaries.
package bootstrap

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/assignment/application/service/scoring"
	workforceentity "github.com/nd/mes-platform/modules/workforce/domain/entity"
	workforcerepository "github.com/nd/mes-platform/modules/workforce/domain/repository"
	workforcepersistence "github.com/nd/mes-platform/modules/workforce/infrastructure/persistence"
	productionpersistence "github.com/nd/mes-platform/modules/production/infrastructure/persistence"
)

// ─── Worker Query Adapter ─────────────────────────────────────────────────────

// WorkerQueryAdapter adapts the workforce GORM repository to the assignment
// service's WorkerQuery port. Lives in bootstrap to avoid cross-module coupling.
type WorkerQueryAdapter struct {
	workerRepo *workforcepersistence.GormWorkerRepository
}

func NewWorkerQueryAdapter(workerRepo *workforcepersistence.GormWorkerRepository) *WorkerQueryAdapter {
	return &WorkerQueryAdapter{workerRepo: workerRepo}
}

// FindCandidates returns all active workers as scoring candidates.
func (a *WorkerQueryAdapter) FindCandidates(ctx context.Context) ([]scoring.WorkerCandidate, error) {
	workers, _, err := a.workerRepo.List(ctx, workforcerepository.WorkerFilter{
		Page:     1,
		PageSize: 1000,
	})
	if err != nil {
		return nil, err
	}

	candidates := make([]scoring.WorkerCandidate, 0, len(workers))
	for _, w := range workers {
		if w.Status == workforceentity.WorkerStatusResigned || w.Status == workforceentity.WorkerStatusRetired || w.Status == workforceentity.WorkerStatusTerminated {
			continue // skip resigned, retired, or terminated workers
		}
		candidates = append(candidates, workerEntityToCandidate(w))
	}
	return candidates, nil
}

// FindWorkersByIDs returns specific workers for manual override selection.
func (a *WorkerQueryAdapter) FindWorkersByIDs(ctx context.Context, ids []uuid.UUID) ([]scoring.WorkerCandidate, error) {
	candidates := make([]scoring.WorkerCandidate, 0, len(ids))
	for _, id := range ids {
		w, err := a.workerRepo.FindByID(ctx, id)
		if err != nil {
			continue // skip not found — service will detect empty result
		}
		if w.Status == workforceentity.WorkerStatusResigned || w.Status == workforceentity.WorkerStatusRetired || w.Status == workforceentity.WorkerStatusTerminated {
			continue // skip resigned, retired, or terminated workers
		}
		candidates = append(candidates, workerEntityToCandidate(w))
	}
	return candidates, nil
}

// workerEntityToCandidate converts a Worker entity into a scoring.WorkerCandidate.
// WorkerSkill.Skill is populated when loaded via GORM Preload("Skills.Skill").
// Certification: workers with certificates are treated as certified for all their skills.
// (The current data model uses general certificates, not per-skill certificates.)
func workerEntityToCandidate(w *workforceentity.Worker) scoring.WorkerCandidate {
	skills := make([]scoring.WorkerSkill, 0, len(w.Skills))
	for _, ws := range w.Skills {
		skillCode := ""
		if ws.Skill != nil {
			skillCode = ws.Skill.Code
		}
		if skillCode == "" {
			continue // skip skills without a loaded Skill reference
		}
		skills = append(skills, scoring.WorkerSkill{
			SkillCode:        skillCode,
			ProficiencyLevel: ws.ProficiencyLevel,
		})
	}

	// If the worker has any certificates, treat all their skills as certified.
	// Phase 6+ can refine this to per-skill certification.
	certifiedFor := []string{}
	if len(w.Certificates) > 0 {
		for _, sk := range skills {
			certifiedFor = append(certifiedFor, sk.SkillCode)
		}
	}

	return scoring.WorkerCandidate{
		WorkerID:     w.ID.String(),
		WorkerName:   fmt.Sprintf("%s %s", w.FirstName, w.LastName),
		Skills:       skills,
		IsAvailable:  w.Availability == workforceentity.WorkerAvailabilityAvailable,
		CertifiedFor: certifiedFor,
	}
}

// ─── Operation Query Adapter ──────────────────────────────────────────────────

// OperationQueryAdapter adapts the production GORM repository to the assignment
// service's OperationQuery port.
type OperationQueryAdapter struct {
	routingRepo *productionpersistence.GormRoutingRepository
}

func NewOperationQueryAdapter(routingRepo *productionpersistence.GormRoutingRepository) *OperationQueryAdapter {
	return &OperationQueryAdapter{routingRepo: routingRepo}
}

// FindOperation searches across all routings for the operation with the given ID.
func (a *OperationQueryAdapter) FindOperation(ctx context.Context, operationID uuid.UUID) (*scoring.RequiredOperation, error) {
	routings, err := a.routingRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	for _, r := range routings {
		for _, op := range r.Operations {
			if op.ID == operationID {
				return &scoring.RequiredOperation{
					RequiredSkills: op.RequiredSkills,
					MinOperators:   op.MinOperators,
					MaxOperators:   op.MaxOperators,
					Priority:       50, // default; can be enriched with order priority in future
				}, nil
			}
		}
	}
	return nil, fmt.Errorf("operation %s not found", operationID)
}
