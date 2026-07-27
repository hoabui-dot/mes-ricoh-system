-- Routing is a reusable process definition. It is linked to products and sites
-- through Production Version, so the execution read model must not require
-- item-revision or site ownership on the routing header itself.
ALTER TABLE rm_routing_header
  ALTER COLUMN item_revision_id DROP NOT NULL,
  ALTER COLUMN site_id DROP NOT NULL;
