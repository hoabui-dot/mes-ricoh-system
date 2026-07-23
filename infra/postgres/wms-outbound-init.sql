DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_outbound_user') THEN
    CREATE ROLE wms_outbound_user LOGIN PASSWORD 'wms_outbound_pass' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT CONNECT ON DATABASE wms_outbound_db TO wms_outbound_user;
