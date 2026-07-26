package scoring_test

import (
	"testing"

	"github.com/nd/mes-platform/modules/assignment/application/service/scoring"
	"github.com/stretchr/testify/assert"
)

// buildOp creates a test RequiredOperation.
func buildOp(skills []string, minOps, maxOps, priority int) scoring.RequiredOperation {
	return scoring.RequiredOperation{
		RequiredSkills: skills,
		MinOperators:   minOps,
		MaxOperators:   maxOps,
		Priority:       priority,
	}
}

// ─── Skill Match Tests ────────────────────────────────────────────────────────

func TestScorer_SkillMatch_Full(t *testing.T) {
	candidates := []scoring.WorkerCandidate{
		{
			WorkerID:    "worker-1",
			WorkerName:  "Alice",
			Skills:      []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 4}, {SkillCode: "ZP1", ProficiencyLevel: 3}},
			IsAvailable: true,
		},
	}
	op := buildOp([]string{"LO1", "ZP1"}, 1, 2, 80)

	results := scoring.Score(candidates, op)
	assert.Len(t, results, 1)
	assert.Equal(t, "worker-1", results[0].WorkerID)
	assert.ElementsMatch(t, []string{"LO1", "ZP1"}, results[0].SkillMatched)
	assert.Greater(t, results[0].TotalScore, 0.0)
}

func TestScorer_SkillMatch_Partial(t *testing.T) {
	candidates := []scoring.WorkerCandidate{
		{
			WorkerID:    "worker-partial",
			WorkerName:  "Bob",
			Skills:      []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 3}},
			IsAvailable: true,
		},
	}
	op := buildOp([]string{"LO1", "ZP1"}, 1, 2, 50)

	results := scoring.Score(candidates, op)
	assert.Len(t, results, 1)
	assert.Equal(t, []string{"LO1"}, results[0].SkillMatched)
}

func TestScorer_NoSkillsRequired_FullScore(t *testing.T) {
	candidates := []scoring.WorkerCandidate{
		{WorkerID: "w1", WorkerName: "Any", Skills: nil, IsAvailable: true},
	}
	op := buildOp([]string{}, 1, 2, 50)

	results := scoring.Score(candidates, op)
	assert.Len(t, results, 1)
	// With no required skills, skill score = 100 and cert score = 100
	assert.Greater(t, results[0].TotalScore, 50.0)
}

// ─── Availability Tests ───────────────────────────────────────────────────────

func TestScorer_UnavailableWorker_LowScore(t *testing.T) {
	available := scoring.WorkerCandidate{
		WorkerID:    "avail",
		WorkerName:  "Alice",
		Skills:      []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 3}},
		IsAvailable: true,
	}
	unavailable := scoring.WorkerCandidate{
		WorkerID:    "unavail",
		WorkerName:  "Bob",
		Skills:      []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 3}},
		IsAvailable: false,
	}
	op := buildOp([]string{"LO1"}, 1, 2, 50)

	results := scoring.Score([]scoring.WorkerCandidate{available, unavailable}, op)

	// Both should be scored (score > 0 even when unavailable if skill match)
	assert.Len(t, results, 2)
	// Available worker should be ranked first
	assert.Equal(t, "avail", results[0].WorkerID)
}

func TestScorer_Unavailable_ZeroAvailabilityWeight(t *testing.T) {
	c := scoring.WorkerCandidate{
		WorkerID:    "w1",
		Skills:      []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 5}},
		IsAvailable: false,
	}
	op := buildOp([]string{"LO1"}, 1, 2, 50)

	results := scoring.Score([]scoring.WorkerCandidate{c}, op)
	assert.Len(t, results, 1)
	// Score > 0 because skill match and priority contribute even without availability
	assert.Greater(t, results[0].TotalScore, 0.0)
	// But lower than a fully available worker
	cAvail := c
	cAvail.IsAvailable = true
	cAvail.WorkerID = "w2"
	resultsAvail := scoring.Score([]scoring.WorkerCandidate{cAvail}, op)
	assert.Greater(t, resultsAvail[0].TotalScore, results[0].TotalScore)
}

// ─── Certification Tests ──────────────────────────────────────────────────────

func TestScorer_CertificationBoost(t *testing.T) {
	certified := scoring.WorkerCandidate{
		WorkerID:     "cert",
		Skills:       []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 3}},
		IsAvailable:  true,
		CertifiedFor: []string{"LO1"},
	}
	notCertified := scoring.WorkerCandidate{
		WorkerID:     "nocert",
		Skills:       []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 3}},
		IsAvailable:  true,
		CertifiedFor: []string{},
	}
	op := buildOp([]string{"LO1"}, 1, 2, 50)

	results := scoring.Score([]scoring.WorkerCandidate{certified, notCertified}, op)
	assert.Len(t, results, 2)
	assert.Equal(t, "cert", results[0].WorkerID, "certified worker should rank higher")
	assert.Greater(t, results[0].TotalScore, results[1].TotalScore)
}

// ─── Ranking Tests ────────────────────────────────────────────────────────────

func TestScorer_SortedByScoreDescending(t *testing.T) {
	candidates := []scoring.WorkerCandidate{
		{WorkerID: "low", Skills: []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 1}}, IsAvailable: false},
		{WorkerID: "high", Skills: []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 5}}, IsAvailable: true, CertifiedFor: []string{"LO1"}},
		{WorkerID: "mid", Skills: []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 3}}, IsAvailable: true},
	}
	op := buildOp([]string{"LO1"}, 1, 3, 70)

	results := scoring.Score(candidates, op)
	assert.Len(t, results, 3)
	assert.Equal(t, "high", results[0].WorkerID)
	assert.Equal(t, "mid", results[1].WorkerID)
	assert.Equal(t, "low", results[2].WorkerID)
}

// ─── SelectTop Tests ──────────────────────────────────────────────────────────

func TestScorer_SelectTop_RespectsMinOperators(t *testing.T) {
	candidates := []scoring.WorkerCandidate{
		{WorkerID: "w1", Skills: []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 4}}, IsAvailable: true},
		{WorkerID: "w2", Skills: []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 3}}, IsAvailable: true},
		{WorkerID: "w3", Skills: []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 2}}, IsAvailable: true},
	}
	op := buildOp([]string{"LO1"}, 2, 4, 50)

	scored := scoring.Score(candidates, op)
	selected := scoring.SelectTop(scored, op)
	assert.Len(t, selected, 2, "should select exactly min_operators")
}

func TestScorer_SelectTop_CappedAtAvailableWorkers(t *testing.T) {
	candidates := []scoring.WorkerCandidate{
		{WorkerID: "w1", Skills: []scoring.WorkerSkill{{SkillCode: "LO1", ProficiencyLevel: 4}}, IsAvailable: true},
	}
	op := buildOp([]string{"LO1"}, 3, 5, 50) // min=3 but only 1 worker

	scored := scoring.Score(candidates, op)
	selected := scoring.SelectTop(scored, op)
	assert.Len(t, selected, 1, "should not panic, selects all available")
}

// ─── AverageScore Tests ───────────────────────────────────────────────────────

func TestScorer_AverageScore(t *testing.T) {
	selected := []scoring.ScoredCandidate{
		{TotalScore: 80.0},
		{TotalScore: 60.0},
	}
	avg := scoring.AverageScore(selected)
	assert.Equal(t, 70.0, avg)
}

func TestScorer_AverageScore_Empty(t *testing.T) {
	assert.Equal(t, 0.0, scoring.AverageScore(nil))
}
