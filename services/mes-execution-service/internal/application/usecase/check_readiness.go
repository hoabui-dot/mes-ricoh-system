package usecase

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/domain"
)

func CheckMasterDataReadiness(ctx context.Context, pool *pgxpool.Pool, itemRevisionID, siteID string) (domain.ReadinessResult, error) {
	result := domain.ReadinessResult{
		ItemRevisionID:       itemRevisionID,
		SiteID:               siteID,
		Ready:                false,
		MissingPrerequisites: []string{},
	}

	var itemMasterID string
	err := pool.QueryRow(ctx, `SELECT master_id FROM rm_item_revision WHERE master_id = $1 AND lifecycle_status = 'Released'`, itemRevisionID).Scan(&itemMasterID)
	if err != nil {
		result.MissingPrerequisites = append(result.MissingPrerequisites, fmt.Sprintf("Released Item Revision (%s) not found in read-model", itemRevisionID))
	}

	var pvID, mbomHeaderID, routingHeaderID string
	err = pool.QueryRow(ctx, `
		SELECT master_id, mbom_header_id, routing_header_id
		FROM rm_production_version
		WHERE item_revision_id = $1 AND site_id = $2 AND lifecycle_status = 'Released'
		ORDER BY is_default DESC LIMIT 1
	`, itemRevisionID, siteID).Scan(&pvID, &mbomHeaderID, &routingHeaderID)

	if err != nil {
		result.MissingPrerequisites = append(result.MissingPrerequisites, fmt.Sprintf("No Released Production Version found for Item Revision (%s) at Site (%s)", itemRevisionID, siteID))
	} else {
		result.ProductionVersionID = pvID
		result.MBOMHeaderID = mbomHeaderID
		result.RoutingHeaderID = routingHeaderID

		var mbomMasterID string
		if err := pool.QueryRow(ctx, `SELECT master_id FROM rm_mbom_header WHERE master_id = $1 AND lifecycle_status = 'Released'`, mbomHeaderID).Scan(&mbomMasterID); err != nil {
			result.MissingPrerequisites = append(result.MissingPrerequisites, fmt.Sprintf("Released MBOM Header (%s) not found in read-model", mbomHeaderID))
		}

		var routingMasterID string
		if err := pool.QueryRow(ctx, `SELECT master_id FROM rm_routing_header WHERE master_id = $1 AND lifecycle_status = 'Released'`, routingHeaderID).Scan(&routingMasterID); err != nil {
			result.MissingPrerequisites = append(result.MissingPrerequisites, fmt.Sprintf("Released Routing Header (%s) not found in read-model", routingHeaderID))
		}
	}

	result.Ready = len(result.MissingPrerequisites) == 0
	return result, nil
}
