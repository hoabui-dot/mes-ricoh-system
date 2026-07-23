DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_inbound_user') THEN
    CREATE ROLE wms_inbound_user LOGIN PASSWORD 'wms_inbound_pass' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT CONNECT ON DATABASE wms_inbound_db TO wms_inbound_user;
