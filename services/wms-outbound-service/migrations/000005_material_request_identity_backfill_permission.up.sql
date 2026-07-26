DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_outbound_user') THEN
    GRANT UPDATE ON TABLE material_request TO wms_outbound_user;
  END IF;
END $$;
