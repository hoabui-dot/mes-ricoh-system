DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_inventory_user') THEN
    CREATE ROLE wms_inventory_user LOGIN PASSWORD 'wms_inventory_pass' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT CONNECT ON DATABASE wms_inventory_db TO wms_inventory_user;
