type FilterInput = Record<string, unknown> | string | undefined;

function normalizeFilters(filters: FilterInput) {
  if (!filters) return '';
  if (typeof filters === 'string') {
    const query = filters.replace(/^\?/, '');
    return query.split('&').filter(Boolean).sort().join('&');
  }
  return Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
}

const domain = (name: string) => ({
  all: [name] as const,
  lists: () => [name, 'list'] as const,
  list: (filters?: FilterInput) => [name, 'list', normalizeFilters(filters)] as const,
  detail: (id: string) => [name, 'detail', id] as const,
});

export const mesQueryKeys = {
  items: domain('items'),
  itemRevisions: {
    ...domain('item-revisions'),
    byItem: (itemId: string) => ['item-revisions', 'by-item', itemId] as const,
    selector: (filters?: FilterInput) => ['item-revisions', 'selector', normalizeFilters(filters)] as const,
    released: (filters?: FilterInput) => ['item-revisions', 'released', normalizeFilters(filters)] as const,
  },
  eboms: domain('eboms'),
  mboms: {
    ...domain('mboms'),
    lines: (id: string) => ['mboms', 'lines', id] as const,
    substitutes: (lineId: string) => ['mboms', 'substitutes', lineId] as const,
    validation: (id: string) => ['mboms', 'validation', id] as const,
    referenceData: () => ['mboms', 'reference-data'] as const,
  },
  routings: { ...domain('routings'), operations: (id?: string) => ['routings', 'operations', id || 'all'] as const },
  productionVersions: { ...domain('production-versions'), validation: (id: string) => ['production-versions', 'validation', id] as const },
  resources: domain('resources'),
  resourceCapabilities: domain('resource-capabilities'),
  employees: domain('employees'),
  skills: domain('skills'),
  shifts: domain('shifts'),
  calendars: domain('calendars'),
  workOrders: { ...domain('work-orders'), readiness: (id: string) => ['work-orders', 'readiness', id] as const, operations: (id: string) => ['work-orders', 'operations', id] as const },
  productionReadyConfigurations: domain('production-ready-configurations'),
  resource: (resource: string, query?: FilterInput) => ['resource', resource, normalizeFilters(query)] as const,
} as const;

export function normalizedQuery(filters?: FilterInput) {
  return normalizeFilters(filters);
}
