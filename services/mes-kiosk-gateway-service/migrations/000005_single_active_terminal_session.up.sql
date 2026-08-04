WITH ranked_active AS (
  SELECT session_id,
         row_number() OVER (PARTITION BY terminal_id ORDER BY logged_in_at DESC, session_id DESC) AS active_rank
  FROM terminal_session
  WHERE status = 'ACTIVE'
)
UPDATE terminal_session ts
SET status = 'CLOSED', logged_out_at = COALESCE(ts.logged_out_at, NOW())
FROM ranked_active ranked
WHERE ts.session_id = ranked.session_id
  AND ranked.active_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_terminal_session_one_active
  ON terminal_session(terminal_id)
  WHERE status = 'ACTIVE';
