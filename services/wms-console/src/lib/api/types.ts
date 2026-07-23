import type { LocalizedText } from '@mom-platform/i18n-ui-shared';

export type Status = 'Active' | 'Inactive' | 'Draft' | 'Confirmed' | 'Staged' | 'Shortage' | string;

export interface Warehouse {
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: LocalizedText | string;
  warehouse_description?: LocalizedText | string | null;
  site_id: string;
  status: Status;
}

export interface Zone {
  zone_id: string;
  warehouse_id: string;
  zone_code: string;
  zone_name: LocalizedText | string;
  zone_type: string;
  status: Status;
}

export interface Location {
  location_id: string;
  zone_id: string;
  location_code: string;
  location_name: LocalizedText | string | null;
  location_purpose: 'Storage' | 'WorkCenterStaging';
  staging_for_work_center_ref?: string | null;
  status: Status;
}

export interface Bin {
  bin_id: string;
  location_id: string;
  bin_code: string;
  bin_name?: LocalizedText | string | null;
  capacity_qty?: number | null;
  capacity_uom_id?: string | null;
  status: Status;
}

export interface ItemUomMapping {
  mapping_id: string;
  item_revision_id: string;
  item_code?: string | null;
  item_name?: LocalizedText | string | null;
  storage_uom_code: string;
  conversion_factor: number;
  default_bin_capacity_qty?: number | null;
}

export interface Balance {
  lot_id: string;
  lot_code: string;
  location_id: string;
  on_hand_qty: number;
  expiry_date?: string | null;
  status: Status;
}

export interface InventoryMovement {
  movement_id: string;
  movement_type: 'RECEIPT' | 'TRANSFER_TO_STAGING' | 'CONSUMPTION' | 'ADJUSTMENT' | string;
  lot_id: string;
  lot_code: string;
  item_revision_id: string;
  from_location_id?: string | null;
  to_location_id?: string | null;
  qty: number;
  wo_id?: string | null;
  work_center_ref?: string | null;
  occurred_at: string;
}

export interface Receipt {
  receipt_id: string;
  receipt_code?: string;
  warehouse_location_id?: string;
  status: Status;
  line_count?: number;
  confirmed_at?: string | null;
}

export interface MaterialRequest {
  request_id: string;
  wo_id?: string;
  work_center_ref?: string;
  item_revision_id?: string;
  required_qty?: number;
  requested_qty?: number;
  status: Status;
  staging_location_id?: string;
  already_staged_qty?: number;
  shortfall_qty?: number;
  available_qty?: number;
  transferred_qty?: number;
  error_code?: string;
  detail?: Record<string, unknown>;
  details?: Record<string, unknown>;
  created_at?: string;
}
