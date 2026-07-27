package usecase

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mom-platform/mes-execution-service/internal/domain"
)

func CheckMasterDataReadiness(ctx context.Context, pool *pgxpool.Pool, itemRevisionID, siteID, requestedProductionVersionID string) (domain.ReadinessResult, error) {
	result := domain.ReadinessResult{
		ItemRevisionID:       itemRevisionID,
		SiteID:               siteID,
		Ready:                false,
		MissingPrerequisites: []string{},
	}

	if requestedProductionVersionID == "" {
		result.MissingPrerequisites = append(result.MissingPrerequisites, "Production Version selection is required; the backend will not infer one from an Item Revision")
		return result, nil
	}
	var pvID, mbomHeaderID, routingHeaderID, derivedItemRevisionID, derivedSiteID, derivedUOMID string
	var pvCode string
	var pvName []byte
	query := `SELECT master_id, item_revision_id, mbom_header_id, routing_header_id, site_id, COALESCE(code, ''), COALESCE(name_i18n, '{}'::jsonb)
		FROM rm_production_version WHERE master_id = $1 AND lifecycle_status = 'Released'`
	err := pool.QueryRow(ctx, query, requestedProductionVersionID).Scan(&pvID, &derivedItemRevisionID, &mbomHeaderID, &routingHeaderID, &derivedSiteID, &pvCode, &pvName)
	if err == nil {
		if itemRevisionID != "" && itemRevisionID != derivedItemRevisionID {
			result.MissingPrerequisites = append(result.MissingPrerequisites, "WORK_ORDER_PRODUCTION_VERSION_CONTEXT_MISMATCH:item_revision_id")
		}
		if siteID != "" && siteID != derivedSiteID {
			result.MissingPrerequisites = append(result.MissingPrerequisites, "WORK_ORDER_PRODUCTION_VERSION_CONTEXT_MISMATCH:site_id")
		}
		itemRevisionID = derivedItemRevisionID
		siteID = derivedSiteID
		result.ItemRevisionID, result.SiteID = itemRevisionID, siteID
	}
	if err == nil {
		var itemMasterID string
		err = pool.QueryRow(ctx, `SELECT master_id, COALESCE(base_uom_id::text, '') FROM rm_item_revision WHERE master_id = $1 AND lifecycle_status = 'Released'`, itemRevisionID).Scan(&itemMasterID, &derivedUOMID)
	}

	if err != nil {
		result.MissingPrerequisites = append(result.MissingPrerequisites, fmt.Sprintf("Selected Production Version (%s) is not Released", requestedProductionVersionID))
	} else {
		result.ProductionVersionID = pvID
		result.MBOMHeaderID = mbomHeaderID
		result.RoutingHeaderID = routingHeaderID
		result.UOMID = derivedUOMID
		result.ProductionVersionCode = pvCode
		if len(pvName) > 0 {
			result.ProductionVersionNameI18n = string(pvName)
		}

		var mbomMasterID string
		if err := pool.QueryRow(ctx, `SELECT master_id FROM rm_mbom_header WHERE master_id = $1 AND lifecycle_status = 'Released'`, mbomHeaderID).Scan(&mbomMasterID); err != nil {
			result.MissingPrerequisites = append(result.MissingPrerequisites, fmt.Sprintf("Released MBOM Header (%s) not found in read-model", mbomHeaderID))
		}

		var routingMasterID string
		if err := pool.QueryRow(ctx, `SELECT master_id FROM rm_routing_header WHERE master_id = $1 AND lifecycle_status = 'Released'`, routingHeaderID).Scan(&routingMasterID); err != nil {
			result.MissingPrerequisites = append(result.MissingPrerequisites, fmt.Sprintf("Released Routing Header (%s) not found in read-model", routingHeaderID))
		}
		if derivedUOMID == "" {
			result.MissingPrerequisites = append(result.MissingPrerequisites, "WORK_ORDER_MASTER_DATA_INCOMPLETE:base_uom_id")
		}

		var routingSite string
		var routingSiteCount int
		if err := pool.QueryRow(ctx, `
			SELECT COALESCE(MIN(wc.site_id::text), ''), COUNT(DISTINCT wc.site_id)
			FROM rm_routing_operation ro
			JOIN rm_work_center wc ON wc.master_id = ro.work_center_id
			WHERE ro.routing_header_id = $1
		`, routingHeaderID).Scan(&routingSite, &routingSiteCount); err != nil {
			result.MissingPrerequisites = append(result.MissingPrerequisites, "WORK_ORDER_MASTER_DATA_QUERY_FAILED:routing_site")
		} else if routingSite == "" {
			result.MissingPrerequisites = append(result.MissingPrerequisites, "ROUTING_SITE_CONTEXT_INVALID")
		} else if routingSiteCount > 1 {
			result.MissingPrerequisites = append(result.MissingPrerequisites, "ROUTING_SITE_CONTEXT_AMBIGUOUS")
		} else if routingSite != derivedSiteID {
			result.MissingPrerequisites = append(result.MissingPrerequisites, "PRODUCTION_VERSION_SITE_CONTEXT_INVALID")
		}
	}

	result.Ready = len(result.MissingPrerequisites) == 0
	return result, nil
}
