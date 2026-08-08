package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// analyticsRange is deliberately bounded. Analytics is an operational read model,
// so an omitted range means the recent bounded window rather than all history.
type analyticsRange struct {
	from time.Time
	to   time.Time
}

func parseAnalyticsRange(r *http.Request) (analyticsRange, error) {
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -30)
	to := now.AddDate(0, 0, 1).Truncate(24 * time.Hour)
	parse := func(value string, end bool) (time.Time, error) {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			return time.Time{}, fmt.Errorf("ANALYTICS_INVALID_DATE_RANGE")
		}
		if end {
			return parsed.UTC().Add(24 * time.Hour), nil
		}
		return parsed.UTC(), nil
	}
	var err error
	if value := strings.TrimSpace(r.URL.Query().Get("date_from")); value != "" {
		from, err = parse(value, false)
		if err != nil {
			return analyticsRange{}, err
		}
	}
	if value := strings.TrimSpace(r.URL.Query().Get("date_to")); value != "" {
		to, err = parse(value, true)
		if err != nil {
			return analyticsRange{}, err
		}
	}
	if !from.Before(to) || to.Sub(from) > 366*24*time.Hour {
		return analyticsRange{}, fmt.Errorf("ANALYTICS_INVALID_DATE_RANGE")
	}
	return analyticsRange{from: from, to: to}, nil
}

func analyticsFilters(r *http.Request) (site, line, shift, status, productionVersion, search string) {
	query := r.URL.Query()
	return strings.TrimSpace(query.Get("site")), strings.TrimSpace(query.Get("line")), strings.TrimSpace(query.Get("shift")), strings.TrimSpace(query.Get("status")), strings.TrimSpace(query.Get("production_version")), strings.TrimSpace(query.Get("search"))
}

func writeAnalyticsError(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error(), "message": err.Error()})
}

func writeAnalyticsJSON(w http.ResponseWriter, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

func analyticsBaseWhere(rangeWindow analyticsRange, site, line, shift, status, productionVersion string) (string, []interface{}) {
	return `created_at >= $1 AND created_at < $2
		AND ($3 = '' OR site_id::text = $3)
		AND ($4 = '' OR selected_production_line_code = $4)
		AND ($5 = '' OR shift_id::text = $5)
		AND ($6 = '' OR status::text = $6)
		AND ($7 = '' OR production_version_code = $7)`, []interface{}{rangeWindow.from, rangeWindow.to, site, line, shift, status, productionVersion}
}

func handleAnalyticsOverview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rangeWindow, err := parseAnalyticsRange(r)
		if err != nil {
			writeAnalyticsError(w, http.StatusBadRequest, err)
			return
		}
		site, line, shift, status, pv, _ := analyticsFilters(r)
		where, args := analyticsBaseWhere(rangeWindow, site, line, shift, status, pv)
		confirmationWhere := strings.ReplaceAll(where, "created_at", "h2.created_at")
		confirmationWhere = strings.ReplaceAll(confirmationWhere, "site_id", "h2.site_id")
		confirmationWhere = strings.ReplaceAll(confirmationWhere, "selected_production_line_code", "h2.selected_production_line_code")
		confirmationWhere = strings.ReplaceAll(confirmationWhere, "shift_id", "h2.shift_id")
		confirmationWhere = strings.ReplaceAll(confirmationWhere, "status", "h2.status")
		confirmationWhere = strings.ReplaceAll(confirmationWhere, "production_version_code", "h2.production_version_code")
		var active, completed, blocked, planned, good, scrap, fallback, hold int
		query := fmt.Sprintf(`SELECT
			COUNT(*) FILTER (WHERE status IN ('Released','InProgress','Paused')),
			COUNT(*) FILTER (WHERE status IN ('Completed','Closed')),
			COUNT(*) FILTER (WHERE status='Paused' OR line_selection_status='RESOURCE_HOLD'),
			COALESCE(SUM(quantity),0),
			COALESCE((SELECT SUM(c.qty_good) FROM operation_confirmation c JOIN wo_operation o ON o.wo_operation_id=c.wo_operation_id JOIN wo_header h2 ON h2.wo_id=o.wo_id WHERE %s),0),
			COALESCE((SELECT SUM(c.qty_scrap) FROM operation_confirmation c JOIN wo_operation o ON o.wo_operation_id=c.wo_operation_id JOIN wo_header h2 ON h2.wo_id=o.wo_id WHERE %s),0),
			COUNT(*) FILTER (WHERE NULLIF(fallback_reason,'') IS NOT NULL),
			COUNT(*) FILTER (WHERE line_selection_status='RESOURCE_HOLD')
			FROM wo_header WHERE %s`, confirmationWhere, confirmationWhere, where)
		if err := pool.QueryRow(r.Context(), query, args...).Scan(&active, &completed, &blocked, &planned, &good, &scrap, &fallback, &hold); err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, err)
			return
		}
		statusRows, err := pool.Query(r.Context(), fmt.Sprintf(`SELECT status::text, COUNT(*) FROM wo_header WHERE %s GROUP BY status ORDER BY status`, where), args...)
		if err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, err)
			return
		}
		defer statusRows.Close()
		statusDistribution := []map[string]interface{}{}
		for statusRows.Next() {
			var key string
			var count int
			if err := statusRows.Scan(&key, &count); err != nil {
				writeAnalyticsError(w, http.StatusInternalServerError, err)
				return
			}
			statusDistribution = append(statusDistribution, map[string]interface{}{"status": key, "count": count})
		}
		trendRows, err := pool.Query(r.Context(), fmt.Sprintf(`WITH days AS (SELECT generate_series(date_trunc('day',$1::timestamptz), date_trunc('day',$2::timestamptz - interval '1 microsecond'), interval '1 day') AS day), planned AS (SELECT date_trunc('day',created_at) AS day, COUNT(*)::int AS work_orders, COALESCE(SUM(quantity),0)::float8 AS quantity FROM wo_header WHERE %s GROUP BY 1), actual AS (SELECT date_trunc('day',c.confirmed_at) AS day, COALESCE(SUM(c.qty_good),0)::float8 AS good_quantity, COALESCE(SUM(c.qty_scrap),0)::float8 AS scrap_quantity FROM operation_confirmation c JOIN wo_operation o ON o.wo_operation_id=c.wo_operation_id JOIN wo_header h2 ON h2.wo_id=o.wo_id WHERE %s GROUP BY 1) SELECT days.day, COALESCE(planned.work_orders,0), COALESCE(planned.quantity,0), COALESCE(actual.good_quantity,0), COALESCE(actual.scrap_quantity,0) FROM days LEFT JOIN planned ON planned.day=days.day LEFT JOIN actual ON actual.day=days.day ORDER BY days.day`, where, confirmationWhere), args...)
		if err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, err)
			return
		}
		defer trendRows.Close()
		trend := []map[string]interface{}{}
		for trendRows.Next() {
			var day time.Time
			var workOrders int
			var plannedQty, goodQty, scrapQty float64
			if err := trendRows.Scan(&day, &workOrders, &plannedQty, &goodQty, &scrapQty); err != nil {
				writeAnalyticsError(w, http.StatusInternalServerError, err)
				return
			}
			trend = append(trend, map[string]interface{}{"date": day.Format("2006-01-02"), "work_orders": workOrders, "planned_quantity": plannedQty, "good_quantity": goodQty, "scrap_quantity": scrapQty})
		}
		selectionRows, err := pool.Query(r.Context(), fmt.Sprintf(`SELECT CASE WHEN line_selection_status='RESOURCE_HOLD' THEN 'RESOURCE_HOLD' WHEN NULLIF(fallback_reason,'') IS NOT NULL THEN 'BACKUP_PROXY' ELSE 'PRIMARY_PROXY' END AS selection, COUNT(*)::int FROM wo_header WHERE %s GROUP BY 1 ORDER BY 1`, where), args...)
		if err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, err)
			return
		}
		defer selectionRows.Close()
		selectionBreakdown := []map[string]interface{}{}
		for selectionRows.Next() {
			var selection string
			var count int
			if err := selectionRows.Scan(&selection, &count); err != nil {
				writeAnalyticsError(w, http.StatusInternalServerError, err)
				return
			}
			selectionBreakdown = append(selectionBreakdown, map[string]interface{}{"selection": selection, "count": count})
		}
		reasonRows, err := pool.Query(r.Context(), fmt.Sprintf(`SELECT COALESCE(NULLIF(resource_hold_reason->>'code',''), NULLIF(fallback_reason,''), 'Khác') AS reason, COUNT(*)::int FROM wo_header WHERE %s AND (line_selection_status='RESOURCE_HOLD' OR NULLIF(fallback_reason,'') IS NOT NULL) GROUP BY 1 ORDER BY COUNT(*) DESC, reason LIMIT 10`, where), args...)
		if err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, err)
			return
		}
		defer reasonRows.Close()
		blockingReasons := []map[string]interface{}{}
		for reasonRows.Next() {
			var reason string
			var count int
			if err := reasonRows.Scan(&reason, &count); err != nil {
				writeAnalyticsError(w, http.StatusInternalServerError, err)
				return
			}
			blockingReasons = append(blockingReasons, map[string]interface{}{"reason": reason, "count": count})
		}
		writeAnalyticsJSON(w, map[string]interface{}{"range": map[string]time.Time{"from": rangeWindow.from, "to": rangeWindow.to}, "filters": map[string]string{"site": site, "line": line, "shift": shift, "status": status, "production_version": pv}, "kpis": map[string]interface{}{"active_work_orders": active, "completed_work_orders": completed, "blocked_work_orders": blocked, "planned_quantity": planned, "good_quantity": good, "scrap_quantity": scrap, "completion_rate": ratio(good, planned), "scrap_rate": ratio(scrap, good+scrap), "fallback_rate_proxy": ratio(fallback, active+completed+blocked), "backup_line_used": fallback, "resource_hold_work_orders": hold}, "status_distribution": statusDistribution, "production_trend": trend, "selection_breakdown": selectionBreakdown, "blocking_reasons": blockingReasons, "selection_basis": "BACKUP_PROXY_FROM_FALLBACK_REASON"})
	}
}

func ratio(numerator, denominator int) float64 {
	if denominator == 0 {
		return 0
	}
	return float64(numerator) / float64(denominator)
}

func handleAnalyticsWorkOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rangeWindow, err := parseAnalyticsRange(r)
		if err != nil {
			writeAnalyticsError(w, http.StatusBadRequest, err)
			return
		}
		site, line, shift, status, pv, search := analyticsFilters(r)
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
		if pageSize < 1 || pageSize > 200 {
			pageSize = 50
		}
		sortColumn := map[string]string{"planned_start_at": "planned_start_at", "created_at": "created_at", "wo_code": "wo_code", "status": "status", "quantity": "quantity"}[r.URL.Query().Get("sort")]
		if sortColumn == "" {
			sortColumn = "planned_start_at"
		}
		direction := "ASC"
		if strings.EqualFold(r.URL.Query().Get("direction"), "desc") {
			direction = "DESC"
		}
		where, args := analyticsBaseWhere(rangeWindow, site, line, shift, status, pv)
		args = append(args, search)
		searchArg := len(args)
		where += fmt.Sprintf(" AND ($%d = '' OR wo_code ILIKE '%%' || $%d || '%%' OR item_code ILIKE '%%' || $%d || '%%' OR item_name ILIKE '%%' || $%d || '%%')", searchArg, searchArg, searchArg, searchArg)
		var total int
		if err := pool.QueryRow(r.Context(), fmt.Sprintf("SELECT COUNT(*) FROM wo_header WHERE %s", where), args...).Scan(&total); err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, err)
			return
		}
		args = append(args, pageSize, (page-1)*pageSize)
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`SELECT wo_id::text,wo_code,item_code,item_name,production_version_code,site_id::text,selected_production_line_code,status::text,quantity,planned_start_at,planned_end_at,created_at,COALESCE(fallback_reason,''),line_selection_status,COALESCE(resource_hold_reason,'{}'::jsonb),row_version FROM wo_header WHERE %s ORDER BY %s %s, wo_id LIMIT $%d OFFSET $%d`, where, sortColumn, direction, len(args)-1, len(args)), args...)
		if err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, err)
			return
		}
		defer rows.Close()
		data := []map[string]interface{}{}
		for rows.Next() {
			var id, code, item, itemName, pvCode, siteID, lineCode, woStatus, fallback, lineStatus string
			var qty float64
			var start, end, created time.Time
			var hold []byte
			var rowVersion int
			if err := rows.Scan(&id, &code, &item, &itemName, &pvCode, &siteID, &lineCode, &woStatus, &qty, &start, &end, &created, &fallback, &lineStatus, &hold, &rowVersion); err != nil {
				writeAnalyticsError(w, http.StatusInternalServerError, err)
				return
			}
			data = append(data, map[string]interface{}{"wo_id": id, "wo_code": code, "item_code": item, "item_name": itemName, "production_version_code": pvCode, "site_id": siteID, "selected_line_code": lineCode, "status": woStatus, "planned_quantity": qty, "planned_start_at": start, "planned_end_at": end, "created_at": created, "fallback_reason": fallback, "line_selection_status": lineStatus, "resource_hold_reason": json.RawMessage(hold), "row_version": rowVersion})
		}
		writeAnalyticsJSON(w, map[string]interface{}{"data": data, "pagination": map[string]interface{}{"page": page, "page_size": pageSize, "total": total, "total_pages": (total + pageSize - 1) / pageSize}, "range": map[string]time.Time{"from": rangeWindow.from, "to": rangeWindow.to}})
	}
}

func handleAnalyticsLines(pool *pgxpool.Pool) http.HandlerFunc {
	return analyticsGroupedHandler(pool, `selected_production_line_code`, `COUNT(*) AS work_orders, COUNT(*) FILTER (WHERE NULLIF(fallback_reason,'') IS NOT NULL) AS backup_selected, COUNT(*) FILTER (WHERE line_selection_status='RESOURCE_HOLD') AS resource_hold, COALESCE(SUM(quantity),0) AS planned_quantity`, "line")
}

func handleAnalyticsOperations(pool *pgxpool.Pool) http.HandlerFunc {
	return analyticsGroupedHandler(pool, `o.operation_code`, `COUNT(*) AS operation_count, COUNT(*) FILTER (WHERE o.status='Finished') AS completed, COUNT(*) FILTER (WHERE o.status IN ('ExecutionError','Failed')) AS failed, COALESCE(SUM(o.standard_cycle_time_sec),0) AS standard_cycle_seconds`, "operation")
}

func analyticsGroupedHandler(pool *pgxpool.Pool, groupColumn, aggregates, key string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rangeWindow, err := parseAnalyticsRange(r)
		if err != nil {
			writeAnalyticsError(w, http.StatusBadRequest, err)
			return
		}
		site, line, shift, status, pv, _ := analyticsFilters(r)
		where, args := analyticsBaseWhere(rangeWindow, site, line, shift, status, pv)
		from := "wo_header h"
		if key == "operation" {
			from = "wo_header h JOIN wo_operation o ON o.wo_id=h.wo_id"
			where = strings.ReplaceAll(where, "created_at", "h.created_at")
			where = strings.ReplaceAll(where, "site_id", "h.site_id")
			where = strings.ReplaceAll(where, "selected_production_line_code", "h.selected_production_line_code")
			where = strings.ReplaceAll(where, "shift_id", "h.shift_id")
			where = strings.ReplaceAll(where, "status", "h.status")
			where = strings.ReplaceAll(where, "production_version_code", "h.production_version_code")
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf("SELECT %s,%s FROM %s WHERE %s GROUP BY %s ORDER BY %s", groupColumn, aggregates, from, where, groupColumn, groupColumn), args...)
		if err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, err)
			return
		}
		defer rows.Close()
		data := []map[string]interface{}{}
		for rows.Next() {
			var group string
			var count, completed, failed int
			var planned, standard float64
			if key == "line" {
				if err := rows.Scan(&group, &count, &completed, &failed, &planned); err != nil {
					writeAnalyticsError(w, 500, err)
					return
				}
				data = append(data, map[string]interface{}{"line_code": group, "work_orders": count, "backup_selected": completed, "resource_hold": failed, "planned_quantity": planned})
			} else {
				if err := rows.Scan(&group, &count, &completed, &failed, &standard); err != nil {
					writeAnalyticsError(w, 500, err)
					return
				}
				data = append(data, map[string]interface{}{"operation_code": group, "operation_count": count, "completed": completed, "failed": failed, "standard_cycle_seconds": standard})
			}
		}
		writeAnalyticsJSON(w, map[string]interface{}{"data": data, "range": map[string]time.Time{"from": rangeWindow.from, "to": rangeWindow.to}})
	}
}

func handleAnalyticsResources(pool *pgxpool.Pool) http.HandlerFunc {
	return analyticsSimpleGroup(pool, `COALESCE(source,'Unknown')`, `COUNT(*) AS allocations, COUNT(*) FILTER (WHERE status='Committed') AS committed, COUNT(*) FILTER (WHERE validation_status NOT IN ('Valid','ValidWithWarnings')) AS invalid`, "allocation_source")
}

func analyticsSimpleGroup(pool *pgxpool.Pool, group, aggregates, key string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		window, err := parseAnalyticsRange(r)
		if err != nil {
			writeAnalyticsError(w, 400, err)
			return
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf("SELECT %s,%s FROM wo_resource_allocation WHERE allocated_at >= $1 AND allocated_at < $2 GROUP BY %s ORDER BY %s", group, aggregates, group, group), window.from, window.to)
		if err != nil {
			writeAnalyticsError(w, 500, err)
			return
		}
		defer rows.Close()
		data := []map[string]interface{}{}
		for rows.Next() {
			var groupValue string
			var allocations, committed, invalid int
			if err := rows.Scan(&groupValue, &allocations, &committed, &invalid); err != nil {
				writeAnalyticsError(w, 500, err)
				return
			}
			data = append(data, map[string]interface{}{key: groupValue, "allocations": allocations, "committed": committed, "invalid": invalid})
		}
		writeAnalyticsJSON(w, map[string]interface{}{"data": data, "range": map[string]time.Time{"from": window.from, "to": window.to}})
	}
}

func handleAnalyticsMaterials(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		window, err := parseAnalyticsRange(r)
		if err != nil {
			writeAnalyticsError(w, http.StatusBadRequest, err)
			return
		}
		rows, err := pool.Query(r.Context(), `SELECT COALESCE(m.stock_check_status,'Unknown'), COUNT(*)::int, COALESCE(SUM(m.required_qty),0) FROM wo_material_requirement m JOIN wo_header h ON h.wo_id=m.wo_id WHERE h.created_at >= $1 AND h.created_at < $2 GROUP BY m.stock_check_status ORDER BY m.stock_check_status`, window.from, window.to)
		if err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, err)
			return
		}
		defer rows.Close()
		data := []map[string]interface{}{}
		for rows.Next() {
			var status string
			var requirements int
			var required float64
			if err := rows.Scan(&status, &requirements, &required); err != nil {
				writeAnalyticsError(w, http.StatusInternalServerError, err)
				return
			}
			data = append(data, map[string]interface{}{"readiness_status": status, "requirements": requirements, "required_quantity": required})
		}
		writeAnalyticsJSON(w, map[string]interface{}{"data": data, "range": map[string]time.Time{"from": window.from, "to": window.to}})
	}
}

func handleAnalyticsPrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		window, err := parseAnalyticsRange(r)
		if err != nil {
			writeAnalyticsError(w, 400, err)
			return
		}
		rows, err := pool.Query(r.Context(), `SELECT status,COUNT(*)::int,COALESCE(SUM(attempt_count),0)::int,COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at-dispatched_at))) FILTER (WHERE completed_at IS NOT NULL AND dispatched_at IS NOT NULL),0) FROM wo_print_job WHERE created_at >= $1 AND created_at < $2 GROUP BY status ORDER BY status`, window.from, window.to)
		if err != nil {
			writeAnalyticsError(w, 500, err)
			return
		}
		defer rows.Close()
		data := []map[string]interface{}{}
		for rows.Next() {
			var status string
			var jobs, attempts int
			var latency float64
			if err := rows.Scan(&status, &jobs, &attempts, &latency); err != nil {
				writeAnalyticsError(w, 500, err)
				return
			}
			data = append(data, map[string]interface{}{"status": status, "jobs": jobs, "attempts": attempts, "average_latency_seconds": latency})
		}
		writeAnalyticsJSON(w, map[string]interface{}{"data": data, "range": map[string]time.Time{"from": window.from, "to": window.to}})
	}
}
