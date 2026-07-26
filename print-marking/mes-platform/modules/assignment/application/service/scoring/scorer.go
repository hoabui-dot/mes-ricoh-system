// Package scoring implements the automatic worker assignment scoring engine.
// It is a pure, stateless computation package with no external dependencies.
// This makes it fully unit testable without any database or infrastructure.
package scoring

import (
	"sort"
)

// Weights for the assignment scoring formula.
const (
	WeightSkillMatch     = 0.40
	WeightAvailability   = 0.30
	WeightCertification  = 0.20
	WeightPriority       = 0.10

	MaxProficiencyLevel = 5 // workforce module max proficiency level
)

// WorkerCandidate is the input to the scoring engine.
// It is populated by the AssignmentService from cross-module data.
type WorkerCandidate struct {
	WorkerID       string
	WorkerName     string
	Skills         []WorkerSkill   // skills the worker has
	IsAvailable    bool            // not on leave during the work order shift
	CertifiedFor   []string        // skill codes for which worker has a certificate
}

// WorkerSkill represents a worker's proficiency for a single skill code.
type WorkerSkill struct {
	SkillCode        string
	ProficiencyLevel int // 1–5
}

// RequiredOperation is the scoring target — what the operation demands.
type RequiredOperation struct {
	RequiredSkills []string // skill codes
	MinOperators   int
	MaxOperators   int
	Priority       int // production order priority (1–100)
}

// ScoredCandidate is the output of the scoring engine for one candidate.
type ScoredCandidate struct {
	WorkerID       string
	WorkerName     string
	TotalScore     float64
	SkillMatched   []string // which required skills this candidate covers
	IsAvailable    bool
}

// Score ranks candidates for the given operation and returns them sorted by
// TotalScore descending. Candidates with score 0 are excluded.
func Score(candidates []WorkerCandidate, op RequiredOperation) []ScoredCandidate {
	results := make([]ScoredCandidate, 0, len(candidates))

	for _, c := range candidates {
		scored := scoreCandidate(c, op)
		if scored.TotalScore > 0 {
			results = append(results, scored)
		}
	}

	// Sort by TotalScore descending
	sort.Slice(results, func(i, j int) bool {
		return results[i].TotalScore > results[j].TotalScore
	})

	return results
}

// SelectTop returns the top N candidates where N = op.MinOperators,
// capped at op.MaxOperators. Returns at most MaxOperators candidates.
func SelectTop(scored []ScoredCandidate, op RequiredOperation) []ScoredCandidate {
	n := op.MinOperators
	if n > op.MaxOperators {
		n = op.MaxOperators
	}
	if n > len(scored) {
		n = len(scored)
	}
	return scored[:n]
}

// AverageScore computes the mean score of the selected candidates.
func AverageScore(selected []ScoredCandidate) float64 {
	if len(selected) == 0 {
		return 0
	}
	var sum float64
	for _, s := range selected {
		sum += s.TotalScore
	}
	return sum / float64(len(selected))
}

// scoreCandidate computes the weighted total score for one worker candidate.
func scoreCandidate(c WorkerCandidate, op RequiredOperation) ScoredCandidate {
	skillScore, matched := computeSkillScore(c.Skills, op.RequiredSkills)
	availScore := computeAvailabilityScore(c.IsAvailable)
	certScore := computeCertificationScore(c.CertifiedFor, op.RequiredSkills, c.Skills)
	priorityScore := computePriorityScore(op.Priority)

	total := (WeightSkillMatch * skillScore) +
		(WeightAvailability * availScore) +
		(WeightCertification * certScore) +
		(WeightPriority * priorityScore)

	return ScoredCandidate{
		WorkerID:     c.WorkerID,
		WorkerName:   c.WorkerName,
		TotalScore:   round2(total),
		SkillMatched: matched,
		IsAvailable:  c.IsAvailable,
	}
}

// computeSkillScore returns (score 0–100, list of matched skill codes).
func computeSkillScore(workerSkills []WorkerSkill, required []string) (float64, []string) {
	if len(required) == 0 {
		// No skills required — full score, everyone qualifies
		return 100, []string{}
	}

	skillMap := make(map[string]int, len(workerSkills))
	for _, ws := range workerSkills {
		skillMap[ws.SkillCode] = ws.ProficiencyLevel
	}

	matched := []string{}
	for _, req := range required {
		if _, ok := skillMap[req]; ok {
			matched = append(matched, req)
		}
	}

	score := (float64(len(matched)) / float64(len(required))) * 100.0
	return score, matched
}

// computeAvailabilityScore returns 100 if available, 0 if on leave.
func computeAvailabilityScore(available bool) float64 {
	if available {
		return 100
	}
	return 0
}

// computeCertificationScore considers both certification status and average
// proficiency level for the required skills. Returns a score 0–100.
func computeCertificationScore(certifiedFor []string, required []string, skills []WorkerSkill) float64 {
	if len(required) == 0 {
		return 100
	}

	certSet := make(map[string]struct{}, len(certifiedFor))
	for _, c := range certifiedFor {
		certSet[c] = struct{}{}
	}

	skillMap := make(map[string]int, len(skills))
	for _, ws := range skills {
		skillMap[ws.SkillCode] = ws.ProficiencyLevel
	}

	var totalScore float64
	for _, req := range required {
		levelScore := 0.0
		if level, ok := skillMap[req]; ok {
			levelScore = (float64(level) / float64(MaxProficiencyLevel)) * 100.0
		}
		// Bonus if certified for this skill
		if _, ok := certSet[req]; ok {
			levelScore = min100(levelScore + 20)
		}
		totalScore += levelScore
	}

	return totalScore / float64(len(required))
}

// computePriorityScore converts production order priority (1–100) to a 0–100 score.
func computePriorityScore(priority int) float64 {
	if priority <= 0 {
		return 0
	}
	if priority > 100 {
		return 100
	}
	return float64(priority)
}

func min100(v float64) float64 {
	if v > 100 {
		return 100
	}
	return v
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
