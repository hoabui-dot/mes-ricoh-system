import { normalizeList } from '../utils';
import type { Balance, Bin, InventoryMovement, ItemUomMapping, Location, MaterialRequest, Receipt, Warehouse, Zone } from './types';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

let tokenProvider: (() => string | undefined) | null = null;

export function setTokenProvider(provider: () => string | undefined) {
  tokenProvider = provider;
}

function headers(): HeadersInit {
  const token = tokenProvider?.();
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
  const bodyText = await response.text();
  const payload = parseBody(bodyText);
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload ? String((payload as { message: unknown }).message) : response.statusText;
    throw new ApiError(response.status, message, payload);
  }
  return payload as T;
}

function parseBody(bodyText: string): unknown {
  if (!bodyText) return null;
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

function apiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return '';
}

const md = '/api/wms/master-data';
const inv = '/api/wms/inventory';
const inbound = '/api/wms/inbound';
const outbound = '/api/wms/outbound';

export const api = {
  listWarehouses: () => request<{ data: Warehouse[] }>(`${md}/warehouses?limit=500`).then((r) => normalizeList<Warehouse>(r)),
  getWarehouse: (id: string) => request<Warehouse>(`${md}/warehouses/${id}`),
  createWarehouse: (body: Partial<Warehouse>) => request<Warehouse>(`${md}/warehouses`, { method: 'POST', body: JSON.stringify(body) }),
  updateWarehouse: (id: string, body: Partial<Warehouse>) => request<Warehouse>(`${md}/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  listWarehouseZones: (id: string) => request<{ data: Zone[] }>(`${md}/warehouses/${id}/zones`).then((r) => normalizeList<Zone>(r)),
  createZone: (warehouseId: string, body: Partial<Zone>) => request<Zone>(`${md}/warehouses/${warehouseId}/zones`, { method: 'POST', body: JSON.stringify(body) }),
  getZone: (id: string) => request<Zone>(`${md}/zones/${id}`),
  updateZone: (id: string, body: Partial<Zone>) => request<Zone>(`${md}/zones/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  listZoneLocations: (id: string) => request<{ data: Location[] }>(`${md}/zones/${id}/locations`).then((r) => normalizeList<Location>(r)),
  createLocation: (zoneId: string, body: Partial<Location>) => request<Location>(`${md}/zones/${zoneId}/locations`, { method: 'POST', body: JSON.stringify(body) }),
  listLocations: () => request<{ data: Location[] }>(`${md}/locations?limit=500`).then((r) => normalizeList<Location>(r)),
  getLocation: (id: string) => request<Location>(`${md}/locations/${id}`),
  updateLocation: (id: string, body: Partial<Location>) => request<Location>(`${md}/locations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  listLocationBins: (id: string) => request<{ data: Bin[] }>(`${md}/locations/${id}/bins`).then((r) => normalizeList<Bin>(r)),
  createBin: (locationId: string, body: Partial<Bin>) => request<Bin>(`${md}/locations/${locationId}/bins`, { method: 'POST', body: JSON.stringify(body) }),
  listItemUomMappings: () => request<{ data: ItemUomMapping[] }>(`${md}/item-uom-mappings?limit=500`).then((r) => normalizeList<ItemUomMapping>(r)),
  createItemUomMapping: (body: Partial<ItemUomMapping>) => request<ItemUomMapping>(`${md}/item-uom-mappings`, { method: 'POST', body: JSON.stringify(body) }),
  listBalances: (params: URLSearchParams = new URLSearchParams()) => request<Balance[]>(`${inv}/balances${params.size ? `?${params}` : ''}`).then((r) => normalizeList<Balance>(r)),
  listMovements: (params: URLSearchParams = new URLSearchParams()) => request<InventoryMovement[]>(`${inv}/movements${params.size ? `?${params}` : ''}`).then((r) => normalizeList<InventoryMovement>(r)),
  createReceipt: (body: Record<string, unknown>) => request<Receipt>(`${inbound}/receipts`, { method: 'POST', body: JSON.stringify(body) }),
  getReceipt: (id: string) => request<Receipt>(`${inbound}/receipts/${id}`),
  confirmReceipt: (id: string) => request<Receipt>(`${inbound}/receipts/${id}/confirm`, { method: 'POST' }),
  createMaterialRequest: (body: Record<string, unknown>) => request<MaterialRequest>(`${outbound}/material-requests`, { method: 'POST', body: JSON.stringify(body) }),
  getMaterialRequest: (id: string) => request<MaterialRequest>(`${outbound}/material-requests/${id}`),
};
