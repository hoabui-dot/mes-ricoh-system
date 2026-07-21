-- =============================================================================
-- AUDIT TRIGGER TEMPLATE — Shared Kernel
-- =============================================================================
-- Usage: Call setup_audit_trigger('schema_name', 'table_name') after creating
--        any table that needs automatic audit timestamps and user tracking.
--
-- Requirements:
--   • Table must have columns: created_at, updated_at, created_by, updated_by
--   • The calling session must SET LOCAL app.current_user_id = '<user_id>'
--     before each write (the API layer / service should do this after reading
--     X-User-ID from the Gateway-injected header).
-- =============================================================================

-- ─── Audit columns helper — add to any table ─────────────────────────────────
-- Add these to every table that needs audit tracking:
--
--   created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   created_by   TEXT,   -- UserID from IAM (set via session variable)
--   updated_by   TEXT    -- UserID from IAM (set via session variable)

-- ─── Trigger Function ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_audit_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  -- Read the UserID injected by the application layer
  -- Set via: SET LOCAL "app.current_user_id" = '<user_id>';
  BEGIN
    v_user_id := current_setting('app.current_user_id', true);
  EXCEPTION WHEN OTHERS THEN
    v_user_id := 'system';
  END;

  IF v_user_id IS NULL OR v_user_id = '' THEN
    v_user_id := 'system';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    NEW.created_by := v_user_id;
    NEW.updated_by := v_user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Preserve original created_at and created_by — never allow overwrite
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    NEW.updated_at := NOW();
    NEW.updated_by := v_user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Helper procedure to attach trigger to any table ─────────────────────────
CREATE OR REPLACE PROCEDURE setup_audit_trigger(
  p_schema TEXT,
  p_table  TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_trigger_name TEXT;
BEGIN
  v_trigger_name := 'trg_audit_' || p_table;

  EXECUTE format(
    'DROP TRIGGER IF EXISTS %I ON %I.%I',
    v_trigger_name, p_schema, p_table
  );

  EXECUTE format(
    'CREATE TRIGGER %I
     BEFORE INSERT OR UPDATE ON %I.%I
     FOR EACH ROW EXECUTE FUNCTION fn_set_audit_timestamps()',
    v_trigger_name, p_schema, p_table
  );
END;
$$;

-- ─── Example usage in a service migration ────────────────────────────────────
-- CALL setup_audit_trigger('public', 'md_item');
-- CALL setup_audit_trigger('public', 'md_mbom_header');
-- CALL setup_audit_trigger('public', 'wo_header');

-- ─── How to set the current user from Node.js (pg) ───────────────────────────
-- In your repository layer, before each write:
--
--   await client.query(`SET LOCAL "app.current_user_id" = $1`, [userId]);
--
-- The value comes from the X-User-ID header injected by Kong API Gateway
-- (which extracted it from the Keycloak JWT sub claim).
