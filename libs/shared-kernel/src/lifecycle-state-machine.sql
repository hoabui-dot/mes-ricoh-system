-- =============================================================================
-- LIFECYCLE STATE MACHINE — Shared Kernel
-- =============================================================================
-- Provides SQL helpers to enforce valid state transitions at the DB level.
-- This is a defense-in-depth measure: application code also enforces transitions,
-- but the DB constraint is the last line of defense against bugs.
--
-- Pattern:
--   1. Define a transition table or CHECK CONSTRAINT per domain object
--   2. A trigger validates NEW.status against allowed transitions from OLD.status
--   3. Invalid transitions raise an exception with a meaningful message
-- =============================================================================

-- ─── Generic transition validator function ────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_validate_state_transition(
  p_entity_name   TEXT,
  p_old_status    TEXT,
  p_new_status    TEXT,
  p_allowed_map   JSONB   -- e.g. '{"DRAFT":["RELEASED"],"RELEASED":["OBSOLETE"]}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed_next TEXT[];
BEGIN
  -- If status hasn't changed, allow (no-op update)
  IF p_old_status = p_new_status THEN
    RETURN;
  END IF;

  -- Get allowed next states from the map
  SELECT ARRAY(
    SELECT jsonb_array_elements_text(p_allowed_map -> p_old_status)
  ) INTO v_allowed_next;

  -- Null check: old_status not in map at all
  IF v_allowed_next IS NULL THEN
    RAISE EXCEPTION '[StateM] % — status "%" is terminal or unknown, cannot transition to "%"',
      p_entity_name, p_old_status, p_new_status;
  END IF;

  -- Check if new_status is in allowed list
  IF NOT (p_new_status = ANY(v_allowed_next)) THEN
    RAISE EXCEPTION '[StateM] % — invalid transition from "%" to "%". Allowed: %',
      p_entity_name, p_old_status, p_new_status, v_allowed_next;
  END IF;
END;
$$;

-- =============================================================================
-- STATE MACHINE DEFINITIONS per Domain Object
-- Copy the relevant section into your service's migration file.
-- =============================================================================

-- ─── Work Order (WO) State Machine — mes-execution-service ───────────────────
--
-- States: DRAFT → RELEASED → IN_PROGRESS → COMPLETED | CANCELLED
--         RELEASED → CANCELLED
--         IN_PROGRESS → ON_HOLD → IN_PROGRESS
--
-- Transition map (JSONB):
COMMENT ON FUNCTION fn_validate_state_transition IS
'Generic state machine validator. Pass a JSONB map of {from_state: [allowed_to_states]}.';

-- Example trigger for WO table:
-- CREATE OR REPLACE FUNCTION fn_validate_wo_status()
-- RETURNS TRIGGER LANGUAGE plpgsql AS $$
-- BEGIN
--   IF OLD.status IS NOT NULL AND NEW.status != OLD.status THEN
--     PERFORM fn_validate_state_transition(
--       'WorkOrder',
--       OLD.status,
--       NEW.status,
--       '{"DRAFT":["RELEASED","CANCELLED"],
--         "RELEASED":["IN_PROGRESS","CANCELLED"],
--         "IN_PROGRESS":["COMPLETED","ON_HOLD","CANCELLED"],
--         "ON_HOLD":["IN_PROGRESS","CANCELLED"]
--        }'::JSONB
--     );
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
-- CREATE TRIGGER trg_wo_status_fsm
--   BEFORE UPDATE ON wo_header
--   FOR EACH ROW EXECUTE FUNCTION fn_validate_wo_status();

-- ─── MBOM/Routing Status Machine — mes-master-data-service ───────────────────
-- DRAFT → RELEASED → OBSOLETE
-- (once RELEASED, can only go to OBSOLETE — never back to DRAFT)

-- Example trigger for md_mbom_header:
-- CREATE OR REPLACE FUNCTION fn_validate_mbom_status()
-- RETURNS TRIGGER LANGUAGE plpgsql AS $$
-- BEGIN
--   IF OLD.status IS NOT NULL AND NEW.status != OLD.status THEN
--     PERFORM fn_validate_state_transition(
--       'MBOMHeader',
--       OLD.status,
--       NEW.status,
--       '{"DRAFT":["RELEASED"],"RELEASED":["OBSOLETE"]}'::JSONB
--     );
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
-- CREATE TRIGGER trg_mbom_status_fsm
--   BEFORE UPDATE ON md_mbom_header
--   FOR EACH ROW EXECUTE FUNCTION fn_validate_mbom_status();

-- ─── Inspection Result — qms-inspection-service ───────────────────────────────
-- OPEN → IN_REVIEW → PASSED | FAILED
-- FAILED → DISPOSITIONED

-- ─── Stock Lot — wms-inventory-service ───────────────────────────────────────
-- AVAILABLE → RESERVED → CONSUMED | RETURNED
-- AVAILABLE → QUARANTINED → AVAILABLE | SCRAPPED
