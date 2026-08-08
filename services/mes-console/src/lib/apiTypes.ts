export type LocalizedText = Partial<Record<'vi' | 'en' | 'ja' | 'ko', string>>;

export type MesUserContext = {
  userId?: string;
  roles?: string[];
};

export type MesListResponse<T> = {
  data: T[];
  total?: number;
  page?: number;
  page_size?: number;
};

export type MesEnvelope<T> = {
  data: T;
};

export type MasterDataRow = {
  master_id?: string;
  id?: string;
  code?: string;
  name?: LocalizedText | string;
  name_i18n?: LocalizedText;
  description?: LocalizedText | string;
  lifecycle_status?: string;
  status?: string;
  active_flag?: boolean;
  row_version?: number;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;
};

export type ProductionVersionRow = MasterDataRow & {
  production_version_id?: string;
  version_code?: string;
  item_revision_id?: string;
  item_code?: string;
  item_name?: LocalizedText | string;
  item_revision_code?: string;
  mbom_header_id?: string;
  mbom_code?: string;
  mbom_name?: LocalizedText | string;
  routing_header_id?: string;
  routing_code?: string;
  routing_name?: LocalizedText | string;
  site_id?: string;
  site_code?: string;
  line_eligibility_count?: number;
  primary_line_code?: string;
  primary_line_name?: LocalizedText | string;
  backup_line_count?: number;
  line_eligibility_summary?: ProductionVersionLineEligibility[];
};

export type ProductionVersionLineEligibility = {
  eligibility_id?: string;
  production_version_id?: string;
  production_line_id: string;
  production_line_code?: string;
  production_line_name?: LocalizedText | string;
  line_code?: string;
  line_name?: LocalizedText | string;
  is_primary: boolean;
  priority_no: number;
  efficiency_factor?: number | string;
  selection_mode?: string;
  selection_policy?: string;
  lifecycle_status?: string;
  effective_from?: string;
  effective_to?: string | null;
  active_flag?: boolean;
};

export type ProductionVersionReadinessLine = ProductionVersionLineEligibility & {
  readiness_status: 'Ready' | 'NotReady' | string;
  blockers?: BackendBlocker[];
  operations?: Array<Record<string, unknown>>;
};

export type ProductionVersionReadinessPreview = {
  production_version_id: string;
  effective_at: string;
  lines: ProductionVersionReadinessLine[];
};

export type ProductionLineEligibilityCandidate = {
  production_line_id: string;
  production_line_code: string;
  production_line_name?: LocalizedText | string;
  site_id: string;
  lifecycle_status: string;
  eligible: boolean;
  blockers: BackendBlocker[];
  operations: Array<Record<string, unknown>>;
};

export type ProductionLineEligibilityCandidatePreview = {
  routing_header_id: string;
  site_id: string;
  effective_at: string;
  candidates: ProductionLineEligibilityCandidate[];
};

export type ItemRow = MasterDataRow & {
  item_id?: string;
};

export type ItemRevisionRow = MasterDataRow & {
  item_id?: string;
  item_code?: string;
  revision_code?: string;
};

export type ApiErrorSummary = {
  status?: number;
  code?: string;
  message: string;
  details?: unknown;
};

export type BackendBlocker = {
  code: string;
  message?: string;
  severity?: 'info' | 'warning' | 'blocking' | 'error';
  dimension?: string;
  entity_type?: string;
  entity_id?: string;
  operation_code?: string;
  route?: string;
  details?: unknown;
};
