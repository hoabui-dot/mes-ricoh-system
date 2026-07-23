DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_master_data_user') THEN
    CREATE ROLE wms_master_data_user LOGIN PASSWORD 'wms_master_data_pass' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT CONNECT ON DATABASE wms_master_data_db TO wms_master_data_user;
