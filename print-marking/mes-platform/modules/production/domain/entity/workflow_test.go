package entity_test

import (
	"testing"

	"github.com/nd/mes-platform/modules/production/domain/entity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnit_NewProductionWorkflow_Success(t *testing.T) {
	wf, err := entity.NewProductionWorkflow("WF-COFFEE-001", "Coffee Packaging Workflow", "Standard workflow", "Coffee", "user1")
	require.NoError(t, err)
	assert.Equal(t, "WF-COFFEE-001", wf.WorkflowCode)
	assert.Equal(t, "Coffee Packaging Workflow", wf.WorkflowName)
	assert.Equal(t, entity.WorkflowStatusDraft, wf.Status)
	assert.Equal(t, 1, wf.Version)
	assert.Equal(t, 1, wf.Revision)
	assert.Equal(t, "user1", wf.CreatedBy)

	events := wf.PullEvents()
	require.Len(t, events, 1)
	assert.Equal(t, "mes.workflow.WorkflowCreated", events[0].EventName())
}

func TestUnit_NewProductionWorkflow_Validation(t *testing.T) {
	_, err := entity.NewProductionWorkflow("", "Name", "Desc", "Family", "user1")
	assert.ErrorContains(t, err, "workflow code is required")

	_, err = entity.NewProductionWorkflow("Code", "", "Desc", "Family", "user1")
	assert.ErrorContains(t, err, "workflow name is required")

	_, err = entity.NewProductionWorkflow("Code", "Name", "Desc", "", "user1")
	assert.ErrorContains(t, err, "product family is required")
}

func TestUnit_Workflow_UpdateBasicInfo(t *testing.T) {
	wf, _ := entity.NewProductionWorkflow("WF-01", "Name 1", "Desc 1", "Family 1", "user1")
	
	err := wf.UpdateBasicInfo("Updated Name", "Updated Desc", "Updated Family", "user2")
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", wf.WorkflowName)
	assert.Equal(t, "Updated Desc", wf.Description)
	assert.Equal(t, "Updated Family", wf.ProductFamily)
	assert.Equal(t, "user2", wf.UpdatedBy)
	assert.Equal(t, 2, wf.Revision)

	events := wf.PullEvents()
	require.NotEmpty(t, events)
	assert.Equal(t, "mes.workflow.WorkflowUpdated", events[len(events)-1].EventName())
}

func TestUnit_Workflow_AddOperation_Success(t *testing.T) {
	wf, _ := entity.NewProductionWorkflow("WF-01", "Name", "Desc", "Family", "user1")
	
	op, err := wf.AddOperation("PRINT", "PRINT_STATION", 15, 2, true, map[string]interface{}{"template": "tpl_1"}, "user1")
	require.NoError(t, err)
	require.NotNil(t, op)
	assert.Equal(t, 10, op.Sequence)
	assert.Equal(t, "PRINT", op.OperationType)
	assert.Equal(t, "PRINT_STATION", op.StationType)
	assert.Equal(t, 15, op.EstimatedDuration)
	assert.Equal(t, 2, op.RetryLimit)
	assert.True(t, op.IsRequired)
	assert.Equal(t, "tpl_1", op.Metadata["template"])

	op2, err := wf.AddOperation("MARK", "LASER_STATION", 30, 0, true, nil, "user1")
	require.NoError(t, err)
	assert.Equal(t, 20, op2.Sequence)

	assert.Equal(t, 2, len(wf.Operations))
}

func TestUnit_Workflow_AddOperation_Validation(t *testing.T) {
	wf, _ := entity.NewProductionWorkflow("WF-01", "Name", "Desc", "Family", "user1")
	
	_, err := wf.AddOperation("PRINT", "PRINT_STATION", 0, 1, true, nil, "user1")
	assert.ErrorContains(t, err, "duration must be greater than 0")

	_, err = wf.AddOperation("PRINT", "PRINT_STATION", 10, -1, true, nil, "user1")
	assert.ErrorContains(t, err, "retry limit must be between 0 and 10")

	_, err = wf.AddOperation("PRINT", "PRINT_STATION", 10, 11, true, nil, "user1")
	assert.ErrorContains(t, err, "retry limit must be between 0 and 10")
}

func TestUnit_Workflow_UpdateOperation(t *testing.T) {
	wf, _ := entity.NewProductionWorkflow("WF-01", "Name", "Desc", "Family", "user1")
	op, _ := wf.AddOperation("PRINT", "PRINT_STATION", 15, 2, true, nil, "user1")
	
	err := wf.UpdateOperation(op.ID, "MARK", "LASER_STATION", 45, 5, false, map[string]interface{}{"power": 80}, "user2")
	require.NoError(t, err)

	updatedOp := wf.Operations[0]
	assert.Equal(t, "MARK", updatedOp.OperationType)
	assert.Equal(t, "LASER_STATION", updatedOp.StationType)
	assert.Equal(t, 45, updatedOp.EstimatedDuration)
	assert.Equal(t, 5, updatedOp.RetryLimit)
	assert.False(t, updatedOp.IsRequired)
	assert.Equal(t, 80, updatedOp.Metadata["power"])
}

func TestUnit_Workflow_RemoveOperation(t *testing.T) {
	wf, _ := entity.NewProductionWorkflow("WF-01", "Name", "Desc", "Family", "user1")
	op1, _ := wf.AddOperation("PRINT", "PRINT_STATION", 15, 2, true, nil, "user1")
	op2, _ := wf.AddOperation("MARK", "LASER_STATION", 10, 2, true, nil, "user1")

	err := wf.RemoveOperation(op1.ID, "user1")
	require.NoError(t, err)
	assert.Equal(t, 1, len(wf.Operations))
	// sequence re-calculated sequentially
	assert.Equal(t, 10, wf.Operations[0].Sequence)
	assert.Equal(t, op2.ID, wf.Operations[0].ID)
}

func TestUnit_Workflow_MoveOperation(t *testing.T) {
	wf, _ := entity.NewProductionWorkflow("WF-01", "Name", "Desc", "Family", "user1")
	op1, _ := wf.AddOperation("PRINT", "PRINT_STATION", 10, 1, true, nil, "user1")
	op2, _ := wf.AddOperation("MARK", "LASER_STATION", 20, 1, true, nil, "user1")
	op3, _ := wf.AddOperation("VISION_VERIFY", "VISION_STATION", 30, 1, true, nil, "user1")

	// move first operation to bottom: new sequence target 40
	err := wf.MoveOperation(op1.ID, 40, "user1")
	require.NoError(t, err)

	// sequences re-ordered
	assert.Equal(t, 10, wf.Operations[0].Sequence)
	assert.Equal(t, op2.ID, wf.Operations[0].ID)

	assert.Equal(t, 20, wf.Operations[1].Sequence)
	assert.Equal(t, op3.ID, wf.Operations[1].ID)

	assert.Equal(t, 30, wf.Operations[2].Sequence)
	assert.Equal(t, op1.ID, wf.Operations[2].ID)
}

func TestUnit_Workflow_Validate(t *testing.T) {
	wf, _ := entity.NewProductionWorkflow("WF-01", "Name", "Desc", "Family", "user1")
	
	// empty operations validation failure
	errs := wf.Validate()
	assert.NotEmpty(t, errs)
	assert.Equal(t, entity.WorkflowStatusDraft, wf.Status)

	// correct setup validation passes
	_, _ = wf.AddOperation("PRINT", "PRINT_STATION", 10, 1, true, nil, "user1")
	errs2 := wf.Validate()
	assert.Empty(t, errs2)
	assert.Equal(t, entity.WorkflowStatusReady, wf.Status)
}

func TestUnit_Workflow_Publish_And_Archive_And_Clone(t *testing.T) {
	wf, _ := entity.NewProductionWorkflow("WF-01", "Name", "Desc", "Family", "user1")
	_, _ = wf.AddOperation("PRINT", "PRINT_STATION", 10, 1, true, nil, "user1")

	// Cannot publish draft directly without validate (status Ready)
	err := wf.Publish("user1")
	assert.Error(t, err)

	// Validate to move to Ready
	wf.Validate()
	assert.Equal(t, entity.WorkflowStatusReady, wf.Status)

	// Publish workflow
	err = wf.Publish("user1")
	require.NoError(t, err)
	assert.Equal(t, entity.WorkflowStatusPublished, wf.Status)
	assert.NotNil(t, wf.PublishedAt)

	// Published immutable check
	_, err = wf.AddOperation("MARK", "LASER_STATION", 10, 1, true, nil, "user1")
	assert.ErrorContains(t, err, "cannot modify")

	// Clone to version 2
	cloned, err := wf.Clone(2, "user1")
	require.NoError(t, err)
	assert.Equal(t, 2, cloned.Version)
	assert.Equal(t, entity.WorkflowStatusDraft, cloned.Status)
	assert.Equal(t, 1, len(cloned.Operations))
	assert.Equal(t, wf.Operations[0].OperationType, cloned.Operations[0].OperationType)

	// Archive workflow
	err = wf.Archive("user1")
	require.NoError(t, err)
	assert.Equal(t, entity.WorkflowStatusArchived, wf.Status)
	assert.NotNil(t, wf.ArchivedAt)
}
