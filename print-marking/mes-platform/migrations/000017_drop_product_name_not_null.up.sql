-- Up migration: Drop NOT NULL constraint on deprecated product_name column
ALTER TABLE production_orders ALTER COLUMN product_name DROP NOT NULL;
