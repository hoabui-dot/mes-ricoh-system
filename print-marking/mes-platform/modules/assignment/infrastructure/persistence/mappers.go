package persistence

import (
	"encoding/json"
	"time"

	"github.com/nd/mes-platform/modules/assignment/domain/entity"
	"github.com/nd/mes-platform/modules/assignment/infrastructure/model"
	"github.com/nd/mes-platform/shared/domain"
)

// ─── Model → Entity ───────────────────────────────────────────────────────────

func modelToAssignment(m *model.AssignmentModel) *entity.Assignment {
	workers := make([]entity.AssignedWorker, len(m.Workers))
	for i, wm := range m.Workers {
		workers[i] = modelToAssignedWorker(wm)
	}

	a := &entity.Assignment{
		WorkOrderID: m.WorkOrderID,
		OperationID: m.OperationID,
		Revision:    m.Revision,
		Status:      entity.AssignmentStatus(m.Status),
		ProposedBy:  m.ProposedBy,
		ReviewedBy:  m.ReviewedBy,
		Score:       m.Score,
		Notes:       m.Notes,
		Workers:     workers,
	}
	a.BaseEntity = domain.BaseEntity{
		ID:        m.ID,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
	return a
}

func modelToAssignedWorker(m model.AssignedWorkerModel) entity.AssignedWorker {
	var skills []string
	_ = json.Unmarshal([]byte(m.SkillMatchedJSON), &skills)
	if skills == nil {
		skills = []string{}
	}
	return entity.AssignedWorker{
		ID:           m.ID,
		AssignmentID: m.AssignmentID,
		WorkerID:     m.WorkerID,
		WorkerName:   m.WorkerName,
		SkillMatched: skills,
		Score:        m.Score,
		CreatedAt:    m.CreatedAt,
	}
}

// ─── Entity → Model ───────────────────────────────────────────────────────────

func assignmentToModel(e *entity.Assignment) *model.AssignmentModel {
	workers := make([]model.AssignedWorkerModel, len(e.Workers))
	for i, w := range e.Workers {
		workers[i] = assignedWorkerToModel(w)
	}

	return &model.AssignmentModel{
		ID:          e.ID,
		WorkOrderID: e.WorkOrderID,
		OperationID: e.OperationID,
		Revision:    e.Revision,
		Status:      string(e.Status),
		ProposedBy:  e.ProposedBy,
		ReviewedBy:  e.ReviewedBy,
		Score:       e.Score,
		Notes:       e.Notes,
		CreatedAt:   e.CreatedAt,
		UpdatedAt:   e.UpdatedAt,
		Workers:     workers,
	}
}

func assignedWorkerToModel(e entity.AssignedWorker) model.AssignedWorkerModel {
	skills := e.SkillMatched
	if skills == nil {
		skills = []string{}
	}
	skillsJSON, _ := json.Marshal(skills)

	createdAt := e.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}

	return model.AssignedWorkerModel{
		ID:               e.ID,
		AssignmentID:     e.AssignmentID,
		WorkerID:         e.WorkerID,
		WorkerName:       e.WorkerName,
		SkillMatchedJSON: string(skillsJSON),
		Score:            e.Score,
		CreatedAt:        createdAt,
	}
}
