export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
import { mesQueryClient } from './queryClient';
import { mesQueryKeys, normalizedQuery, type FilterInput } from './queryKeys';
import type { ApiErrorSummary, MesEnvelope, MesListResponse, MesUserContext, ProductionLineEligibilityCandidatePreview, ProductionVersionLineEligibility, ProductionVersionReadinessPreview } from './apiTypes';

export function gatewayBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return `${window.location.protocol}//${window.location.hostname}:18000`;
}

export function masterDataBaseUrl() {
  return `${gatewayBaseUrl()}/api/mes/master-data`;
}

export function authHeaders(user?: MesUserContext | null) {
  return {
    'X-User-ID': user?.userId || SYSTEM_USER_ID,
    'X-Role-Code': user?.roles?.[0] || 'PROD_MANAGER',
  };
}

export class MasterDataApiError extends Error {
  resource: string;
  status: number;
  code?: string;
  details?: unknown;

  constructor(resource: string, status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'MasterDataApiError';
    this.resource = resource;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function normalizeApiError(error: unknown, fallback = 'Request failed'): ApiErrorSummary {
  if (error instanceof MasterDataApiError) return { status: error.status, code: error.code, message: error.message, details: error.details };
  if (error instanceof Error) {
    const typed = error as Error & { status?: number; code?: string; details?: unknown };
    return { status: typed.status, code: typed.code, message: typed.message || fallback, details: typed.details };
  }
  if (error && typeof error === 'object') {
    const typed = error as { status?: number; code?: string; message?: string; error?: string; details?: unknown };
    return { status: typed.status, code: typed.code || typed.error, message: typed.message || typed.error || fallback, details: typed.details };
  }
  return { message: fallback };
}

export function queryString(filters?: FilterInput) {
  const normalized = normalizedQuery(filters);
  return normalized ? `?${normalized}` : '';
}

export async function fetchResourceEnvelope<T>(resource: string, user?: MesUserContext | null, filters?: FilterInput): Promise<MesListResponse<T>> {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}${queryString(filters)}`, { headers: authHeaders(user), cache: 'no-store' });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new MasterDataApiError(resource, resp.status, payload.message || payload.error || `Cannot load ${resource}`, payload.error);
  }
  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    total: payload.total,
    page: payload.page,
    page_size: payload.page_size,
  };
}

export async function fetchResource<T = any>(resource: string, user?: MesUserContext | null, query = ''): Promise<T[]> {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}${query}`, { headers: authHeaders(user), cache: 'no-store' });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new MasterDataApiError(resource, resp.status, error.message || error.error || `Cannot load ${resource}`, error.error);
  }
  const data = await resp.json();
  return data.data || [];
}

async function fetchJson<T>(path: string, user?: MesUserContext | null, init: RequestInit = {}, resource = path): Promise<T> {
  const resp = await fetch(`${masterDataBaseUrl()}${path}`, {
    ...init,
    headers: { ...authHeaders(user), ...(init.headers || {}) },
    cache: init.cache || 'no-store',
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new MasterDataApiError(resource, resp.status, payload.message || payload.error || `Request failed: ${path}`, payload.error);
  }
  return payload as T;
}

export async function fetchProductionVersionLineEligibility(id: string, user?: MesUserContext | null): Promise<ProductionVersionLineEligibility[]> {
  const payload = await fetchJson<MesListResponse<ProductionVersionLineEligibility>>(`/production-versions/${id}/line-eligibility`, user, {}, 'production-version-line-eligibility');
  return payload.data || [];
}

export async function saveProductionVersionLineEligibility(id: string, lines: ProductionVersionLineEligibility[], user?: MesUserContext | null): Promise<ProductionVersionLineEligibility[]> {
  const payload = await fetchJson<MesListResponse<ProductionVersionLineEligibility>>(`/production-versions/${id}/line-eligibility`, user, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines }),
  }, 'production-version-line-eligibility');
  await invalidateMesQueries('production-versions');
  return payload.data || [];
}

export async function fetchProductionVersionReadinessPreview(id: string, user?: MesUserContext | null, effectiveAt?: string): Promise<ProductionVersionReadinessPreview> {
  const payload = await fetchJson<MesEnvelope<ProductionVersionReadinessPreview>>(`/production-versions/${id}/line-readiness-preview`, user, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(effectiveAt ? { effective_at: effectiveAt } : {}),
  }, 'production-version-readiness-preview');
  return payload.data;
}

export async function fetchProductionLineEligibilityCandidates(routingHeaderId: string, user?: MesUserContext | null, effectiveAt?: string): Promise<ProductionLineEligibilityCandidatePreview> {
  const payload = await fetchJson<MesEnvelope<ProductionLineEligibilityCandidatePreview>>('/production-versions/line-eligibility-candidates', user, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routing_header_id: routingHeaderId, ...(effectiveAt ? { effective_at: effectiveAt } : {}) }),
  }, 'production-version-line-eligibility-candidates');
  return payload.data;
}

export async function validateProductionVersion(id: string, user?: MesUserContext | null) {
  return fetchJson<Record<string, unknown>>(`/production-versions/${id}/validate`, user, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }, 'production-version-validation');
}

export async function fetchProductionLineResourceScopes(id: string, user?: MesUserContext | null): Promise<Record<string, any>[]> {
  const payload = await fetchJson<MesListResponse<Record<string, any>>>(`/production-lines/${id}/resource-scopes`, user, {}, 'production-line-resource-scopes');
  return payload.data || [];
}

export async function createProductionLineAggregate(payload: Record<string, unknown>, user?: MesUserContext | null) {
  return fetchJson<Record<string, any>>('/production-lines/aggregate', user, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, 'production-line-create');
}

export async function saveProductionLineWorkCenters(id: string, workCenters: Record<string, unknown>[], user?: MesUserContext | null) {
  const payload = await fetchJson<MesListResponse<Record<string, any>>>(`/production-lines/${id}/work-centers`, user, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ work_centers: workCenters }),
  }, 'production-line-work-centers');
  await Promise.all([invalidateMesQueries('production-lines'), invalidateMesQueries('work-centers')]);
  return payload.data || [];
}

export async function saveProductionLineResourceScopes(id: string, resourceScopes: Record<string, unknown>[], user?: MesUserContext | null) {
  const payload = await fetchJson<MesListResponse<Record<string, any>>>(`/production-lines/${id}/resource-scopes`, user, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource_scopes: resourceScopes }),
  }, 'production-line-resource-scopes');
  await Promise.all([invalidateMesQueries('production-lines'), invalidateMesQueries('resource-assignments')]);
  return payload.data || [];
}

const invalidationMap: Record<string, string[]> = {
  items: ['items', 'item-revisions', 'mbom-headers', 'routing-headers', 'production-versions', 'production-ready-versions'],
  'item-revisions': ['item-revisions', 'items', 'mbom-headers', 'mbom-lines', 'component-substitutes', 'routing-headers', 'production-versions', 'production-ready-versions'],
  'mbom-headers': ['mbom-headers', 'mbom-lines', 'component-substitutes', 'production-versions', 'production-ready-versions'],
  'mbom-lines': ['mbom-lines', 'mbom-headers', 'component-substitutes', 'production-versions', 'production-ready-versions'],
  'component-substitutes': ['component-substitutes', 'mbom-lines', 'mbom-headers', 'production-versions', 'production-ready-versions'],
  'routing-headers': ['routing-headers', 'routing-operations', 'production-versions', 'production-ready-versions'],
  'routing-operations': ['routing-operations', 'routing-headers', 'production-versions', 'production-ready-versions'],
  'production-versions': ['production-versions', 'production-ready-versions'],
  'work-centers': ['work-centers', 'workstations', 'resource-capabilities', 'routing-operations', 'production-ready-versions'],
  workstations: ['workstations', 'work-centers', 'equipment', 'resource-capabilities', 'routing-operations', 'production-ready-versions'],
  equipment: ['equipment', 'workstations', 'resource-capabilities', 'production-ready-versions'],
  employees: ['employees', 'employee-schedules', 'resource-capabilities', 'production-ready-versions'],
  skills: ['skills', 'worker-skills', 'resource-skill-assignments', 'production-ready-versions'],
  'worker-skills': ['worker-skills', 'skills', 'operations', 'production-ready-versions'],
  shifts: ['shifts', 'employee-schedules', 'production-ready-versions'],
  operations: ['operations', 'routing-operations', 'workstation-operation-capabilities', 'production-ready-versions'],
};

export async function invalidateMesQueries(resource: string) {
  const resources = invalidationMap[resource] || [resource];
  await Promise.all(resources.flatMap((name) => [
    mesQueryClient.invalidateQueries({ queryKey: [name] }),
    mesQueryClient.invalidateQueries({ queryKey: mesQueryKeys.resource(name) }),
  ]));
}

export async function postResource(resource: string, payload: Record<string, unknown>, user?: MesUserContext | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}`, {
    method: 'POST',
    headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(error.message || error.error || `Cannot create ${resource}`), { code: error.error, details: error.details });
  }
  if (resp.status === 204 || resp.headers.get('content-length') === '0') { await invalidateMesQueries(resource); return null; }
  const contentType = resp.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await resp.json() : null;
  await invalidateMesQueries(resource);
  return result;
}

export async function putResource(resource: string, id: string, payload: Record<string, unknown>, user?: MesUserContext | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}/${id}`, {
    method: 'PUT',
    headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(error.message || error.error || `Cannot update ${resource}`), { code: error.error, details: error.details });
  }
  const result = await resp.json();
  await invalidateMesQueries(resource);
  return result;
}

export async function deleteResource(resource: string, id: string, user?: MesUserContext | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(user),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new MasterDataApiError(resource, resp.status, error.message || error.error || `Cannot delete ${resource}`, error.error);
  }
  const result = await resp.json();
  await invalidateMesQueries(resource);
  return result;
}

export async function releaseResource(resource: string, id: string, user?: MesUserContext | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}/${id}/release`, {
    method: 'POST',
    headers: authHeaders(user),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    const failures = Array.isArray(error.failures) ? error.failures : Array.isArray(error.errors) ? error.errors : [];
    if (failures.length) {
      throw Object.assign(new Error('Validation failed'), {
        validationFailures: failures,
        code: failures[0]?.code || error.error,
        status: resp.status,
      });
    }
    throw Object.assign(new Error(error.message || error.error || `Cannot release ${resource}`), { code: error.error, status: resp.status });
  }
  const result = await resp.json();
  await invalidateMesQueries(resource);
  return result;
}

export async function fetchMbomDetail(id: string, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/mbom-headers/${id}`, { headers: authHeaders(user), cache: 'no-store' });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new MasterDataApiError('mbom-headers', resp.status, error.message || error.error || 'Cannot load MBOM', error.error);
  }
  const payload = await resp.json();
  return payload.data;
}

export async function createMbomAggregate(payload: Record<string, unknown>, user?: MesUserContext | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/mbom-headers/aggregate`, {
    method: 'POST',
    headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new MasterDataApiError('mbom-headers', resp.status, result.message || result.error || 'Cannot create MBOM', result.error, result.details);
  }
  await invalidateMesQueries('mbom-headers');
  return result;
}

export async function validateMbom(id: string, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/mbom-headers/${id}/validate`, {
    method: 'POST',
    headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
    body: '{}',
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(payload.error || 'MBOM validation failed'), { validationErrors: payload.errors || [] });
  return payload;
}

export async function replaceMbomLines(id: string, expectedStructureVersion: number, lines: Array<Record<string, unknown>>, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/mbom-headers/${id}/lines/replace`, {
    method: 'PUT', headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_structure_version: expectedStructureVersion, lines }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(result.message || result.error || 'Cannot save MBOM structure'), { code: result.error, latestStructureVersion: result.latest_structure_version });
  await invalidateMesQueries('mbom-lines');
  return result.data;
}

export async function createMbomSubstitute(lineId: string, payload: Record<string, unknown>, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/mbom-lines/${lineId}/substitutes`, {
    method: 'POST', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(result.message || result.error || 'Cannot create substitute'), { code: result.error, details: result.details });
  await invalidateMesQueries('component-substitutes');
  return result.data;
}

export async function replaceMbomSubstitutes(lineId: string, substitutes: Array<Record<string, unknown>>, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/mbom-lines/${lineId}/substitutes/replace`, {
    method: 'PUT', headers: { ...authHeaders(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ substitutes }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(result.message || result.error || 'Cannot save substitutes'), { code: result.error, details: result.details });
  await invalidateMesQueries('component-substitutes');
  return result.data || result;
}

async function substituteMutation(path: string, method: string, payload: Record<string, unknown> | undefined, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/${path}`, {
    method,
    headers: { ...authHeaders(user), ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(result.message || result.error || 'Substitute mutation failed'), { code: result.error, details: result.details });
  await invalidateMesQueries('component-substitutes');
  return result.data || result;
}

export function updateMbomSubstitute(lineId: string, substituteId: string, payload: Record<string, unknown>, user?: { userId?: string; roles?: string[] } | null) {
  return substituteMutation(`mbom-lines/${lineId}/substitutes/${substituteId}`, 'PUT', payload, user);
}

export function deleteMbomSubstitute(lineId: string, substituteId: string, user?: { userId?: string; roles?: string[] } | null) {
  return substituteMutation(`mbom-lines/${lineId}/substitutes/${substituteId}`, 'DELETE', undefined, user);
}

export function endMbomSubstituteEffectivity(lineId: string, substituteId: string, effectiveTo: string | undefined, user?: { userId?: string; roles?: string[] } | null) {
  return substituteMutation(`mbom-lines/${lineId}/substitutes/${substituteId}/end-effectivity`, 'POST', effectiveTo ? { effective_to: effectiveTo } : {}, user);
}

export function approveMbomSubstitute(lineId: string, substituteId: string, reason: string | undefined, user?: { userId?: string; roles?: string[] } | null) {
  return substituteMutation(`mbom-lines/${lineId}/substitutes/${substituteId}/approve`, 'POST', reason ? { reason } : {}, user);
}

export function rejectMbomSubstitute(lineId: string, substituteId: string, reason: string, user?: { userId?: string; roles?: string[] } | null) {
  return substituteMutation(`mbom-lines/${lineId}/substitutes/${substituteId}/reject`, 'POST', { reason }, user);
}

export async function fetchMbomSubstituteAudit(lineId: string, substituteId: string, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/mbom-lines/${lineId}/substitutes/${substituteId}/audit`, { headers: authHeaders(user), cache: 'no-store' });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(result.message || result.error || 'Cannot load substitute audit'), { code: result.error });
  return result.data || [];
}
