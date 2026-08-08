package http

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type traceAnalyticsWindow struct{ from, to time.Time }

func parseTraceAnalyticsWindow(r *http.Request) (traceAnalyticsWindow, error) {
	now := time.Now().UTC()
	from, to := now.AddDate(0, 0, -30).Truncate(24*time.Hour), now.AddDate(0, 0, 1).Truncate(24*time.Hour)
	parse := func(value string, end bool) (time.Time, error) {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			return time.Time{}, err
		}
		parsed = parsed.UTC()
		if end {
			parsed = parsed.Add(24 * time.Hour)
		}
		return parsed, nil
	}
	var err error
	if value := strings.TrimSpace(r.URL.Query().Get("date_from")); value != "" {
		from, err = parse(value, false)
		if err != nil {
			return traceAnalyticsWindow{}, err
		}
	}
	if value := strings.TrimSpace(r.URL.Query().Get("date_to")); value != "" {
		to, err = parse(value, true)
		if err != nil {
			return traceAnalyticsWindow{}, err
		}
	}
	if !from.Before(to) || to.Sub(from) > 366*24*time.Hour {
		return traceAnalyticsWindow{}, strconv.ErrRange
	}
	return traceAnalyticsWindow{from, to}, nil
}

func writeTraceAnalyticsError(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "ANALYTICS_INVALID_DATE_RANGE", "message": err.Error()})
}

func handleTraceAnalyticsOverview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		window, err := parseTraceAnalyticsWindow(r)
		if err != nil {
			writeTraceAnalyticsError(w, http.StatusBadRequest, err)
			return
		}
		rows, err := pool.Query(r.Context(), `SELECT status, COUNT(*)::int, COUNT(*) FILTER (WHERE lot_or_serial_no LIKE 'LOT-%')::int, COUNT(*) FILTER (WHERE lot_or_serial_no NOT LIKE 'LOT-%')::int FROM label_instance WHERE created_at >= $1 AND created_at < $2 AND ($3 = '' OR site_id::text = $3) AND ($4 = '' OR item_revision_id::text = $4) GROUP BY status ORDER BY status`, window.from, window.to, r.URL.Query().Get("site"), r.URL.Query().Get("item_revision"))
		if err != nil {
			writeTraceAnalyticsError(w, http.StatusInternalServerError, err)
			return
		}
		defer rows.Close()
		data := []map[string]interface{}{}
		var total, active, consumed, scrapped, lots, serials int
		for rows.Next() {
			var status string
			var count, lotCount, serialCount int
			if err := rows.Scan(&status, &count, &lotCount, &serialCount); err != nil {
				writeTraceAnalyticsError(w, 500, err)
				return
			}
			total += count
			lots += lotCount
			serials += serialCount
			switch status {
			case "ACTIVE":
				active += count
			case "CONSUMED":
				consumed += count
			case "SCRAPPED":
				scrapped += count
			}
			data = append(data, map[string]interface{}{"status": status, "labels": count, "lots": lotCount, "serials": serialCount})
		}
		var genealogy int
		if err := pool.QueryRow(r.Context(), `SELECT COUNT(*)::int FROM genealogy_event WHERE occurred_at >= $1 AND occurred_at < $2`, window.from, window.to).Scan(&genealogy); err != nil {
			writeTraceAnalyticsError(w, 500, err)
			return
		}
		writeTraceAnalyticsJSON(w, map[string]interface{}{"range": map[string]time.Time{"from": window.from, "to": window.to}, "kpis": map[string]int{"labels_generated": total, "active_labels": active, "consumed_labels": consumed, "scrapped_labels": scrapped, "lots": lots, "serials": serials, "genealogy_relations": genealogy}, "status_distribution": data})
	}
}

func writeTraceAnalyticsJSON(w http.ResponseWriter, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

func handleTraceAnalyticsLabels(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		window, err := parseTraceAnalyticsWindow(r)
		if err != nil {
			writeTraceAnalyticsError(w, 400, err)
			return
		}
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		size, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
		if size < 1 || size > 200 {
			size = 50
		}
		args := []interface{}{window.from, window.to, r.URL.Query().Get("site"), r.URL.Query().Get("item_revision"), r.URL.Query().Get("status")}
		where := `created_at >= $1 AND created_at < $2 AND ($3 = '' OR site_id::text = $3) AND ($4 = '' OR item_revision_id::text = $4) AND ($5 = '' OR status = $5)`
		var total int
		if err := pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM label_instance WHERE `+where, args...).Scan(&total); err != nil {
			writeTraceAnalyticsError(w, 500, err)
			return
		}
		args = append(args, size, (page-1)*size)
		rows, err := pool.Query(r.Context(), `SELECT label_id::text,label_code,item_revision_id::text,lot_or_serial_no,parent_label_id::text,quantity,uom_id::text,status,created_by_operation,site_id::text,created_at,updated_at FROM label_instance WHERE `+where+` ORDER BY created_at DESC,label_id LIMIT $6 OFFSET $7`, args...)
		if err != nil {
			writeTraceAnalyticsError(w, 500, err)
			return
		}
		defer rows.Close()
		data := []map[string]interface{}{}
		for rows.Next() {
			var id, code, item, lot, uom, status, operation, site string
			var parent sql.NullString
			var quantity float64
			var created, updated time.Time
			if err := rows.Scan(&id, &code, &item, &lot, &parent, &quantity, &uom, &status, &operation, &site, &created, &updated); err != nil {
				writeTraceAnalyticsError(w, 500, err)
				return
			}
			data = append(data, map[string]interface{}{"label_id": id, "label_code": code, "item_revision_id": item, "lot_or_serial_no": lot, "parent_label_id": parent.String, "quantity": quantity, "uom_id": uom, "status": status, "created_by_operation": operation, "site_id": site, "created_at": created, "updated_at": updated})
		}
		writeTraceAnalyticsJSON(w, map[string]interface{}{"data": data, "pagination": map[string]int{"page": page, "page_size": size, "total": total, "total_pages": (total + size - 1) / size}, "range": map[string]time.Time{"from": window.from, "to": window.to}})
	}
}

func handleTraceAnalyticsGenealogy(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		window, err := parseTraceAnalyticsWindow(r)
		if err != nil {
			writeTraceAnalyticsError(w, 400, err)
			return
		}
		rows, err := pool.Query(r.Context(), `SELECT relationship_type, COUNT(*)::int FROM genealogy_event WHERE occurred_at >= $1 AND occurred_at < $2 GROUP BY relationship_type ORDER BY relationship_type`, window.from, window.to)
		if err != nil {
			writeTraceAnalyticsError(w, 500, err)
			return
		}
		defer rows.Close()
		data := []map[string]interface{}{}
		for rows.Next() {
			var relation string
			var count int
			if err := rows.Scan(&relation, &count); err != nil {
				writeTraceAnalyticsError(w, 500, err)
				return
			}
			data = append(data, map[string]interface{}{"relationship_type": relation, "count": count})
		}
		writeTraceAnalyticsJSON(w, map[string]interface{}{"data": data, "range": map[string]time.Time{"from": window.from, "to": window.to}})
	}
}
