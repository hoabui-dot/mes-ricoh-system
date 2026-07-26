export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

export function gatewayBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return `${window.location.protocol}//${window.location.hostname}:18000`;
}

export function masterDataBaseUrl() {
  return `${gatewayBaseUrl()}/api/mes/master-data`;
}

export function authHeaders(user?: { userId?: string; roles?: string[] } | null) {
  return {
    'X-User-ID': user?.userId || SYSTEM_USER_ID,
    'X-Role-Code': user?.roles?.[0] || 'PROD_MANAGER',
  };
}

export class MasterDataApiError extends Error {
  resource: string;
  status: number;

  constructor(resource: string, status: number, message: string) {
    super(message);
    this.name = 'MasterDataApiError';
    this.resource = resource;
    this.status = status;
  }
}

export async function fetchResource(resource: string, user?: { userId?: string; roles?: string[] } | null, query = '') {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}${query}`, { headers: authHeaders(user), cache: 'no-store' });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new MasterDataApiError(resource, resp.status, error.message || error.error || `Cannot load ${resource}`);
  }
  const data = await resp.json();
  return data.data || [];
}

export async function postResource(resource: string, payload: Record<string, unknown>, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}`, {
    method: 'POST',
    headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(error.message || error.error || `Cannot create ${resource}`), { code: error.error, details: error.details });
  }
  return resp.json();
}

export async function putResource(resource: string, id: string, payload: Record<string, unknown>, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}/${id}`, {
    method: 'PUT',
    headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(error.message || error.error || `Cannot update ${resource}`), { code: error.error, details: error.details });
  }
  return resp.json();
}

export async function deleteResource(resource: string, id: string, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(user),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new MasterDataApiError(resource, resp.status, error.message || error.error || `Cannot delete ${resource}`);
  }
  return resp.json();
}

export async function releaseResource(resource: string, id: string, user?: { userId?: string; roles?: string[] } | null) {
  const resp = await fetch(`${masterDataBaseUrl()}/${resource}/${id}/release`, {
    method: 'POST',
    headers: authHeaders(user),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    if (Array.isArray(error.failures)) {
      throw Object.assign(new Error('Validation failed'), { validationFailures: error.failures });
    }
    const messages = Array.isArray(error.errors) ? error.errors.map((item: any) => item.message || item.error || String(item)).join('\n') : '';
    throw new Error(messages || error.message || error.error || `Cannot release ${resource}`);
  }
  return resp.json();
}
