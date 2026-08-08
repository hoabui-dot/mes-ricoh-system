import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLocalizedText, type LocalizedText } from '@mom-platform/i18n-ui-shared';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { AnalyticsFilterBar, AnalyticsTabNav } from '../../components/analytics';
import { fetchResource } from '../../lib/masterDataApi';

export type AnalyticsFilters = { from: string; to: string; site: string; line: string; status: string; search: string };
export function defaultAnalyticsFilters(): AnalyticsFilters { const today = new Date().toISOString().slice(0, 10); return { from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), to: today, site: '', line: '', status: '', search: '' }; }
export function useAnalyticsFilters() {
  const defaults = defaultAnalyticsFilters(); const [params, setParams] = useSearchParams(); const filters: AnalyticsFilters = { from: params.get('from') || defaults.from, to: params.get('to') || defaults.to, site: params.get('site') || '', line: params.get('line') || '', status: params.get('status') || '', search: params.get('search') || '' };
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); }; const reset = () => setParams({ from: defaults.from, to: defaults.to });
  const query = new URLSearchParams({ date_from: filters.from, date_to: filters.to }); for (const key of ['site', 'line', 'status', 'search']) if (filters[key as keyof AnalyticsFilters]) query.set(key, filters[key as keyof AnalyticsFilters]);
  return { filters, params, query, change, reset, search: params.toString() ? `?${params.toString()}` : '' };
}
export function analyticsHeaders(user: { userId?: string; roles?: string[] } | null) { return { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles?.[0] || 'PLANT_MANAGER' }; }

export function AnalyticsPageShell({ title, subtitle, filters, onChange, onReset, search, onRefresh, children, showAdvanced = true }: { title: string; subtitle: string; filters: AnalyticsFilters; onChange: (key: string, value: string) => void; onReset: () => void; search: string; onRefresh?: () => void; children: React.ReactNode; showAdvanced?: boolean }) {
  const { user } = useAuth();
  const text = useLocalizedText();
  const sites = useQuery({ queryKey: ['analytics-filter-sites'], staleTime: 60_000, queryFn: () => fetchResource<any>('sites', user, '?limit=200') });
  const lines = useQuery({ queryKey: ['analytics-filter-production-lines'], staleTime: 60_000, queryFn: () => fetchResource<any>('production-lines', user, '?limit=500') });
  const siteOptions = useMemo(() => (sites.data || []).filter((row: any) => row.lifecycle_status === 'Released').map((row: any) => ({ value: row.master_id, label: text(row.name as LocalizedText) || row.code, secondaryLabel: row.code })), [sites.data, text]);
  const lineOptions = useMemo(() => (lines.data || []).filter((row: any) => row.lifecycle_status === 'Released' && (!filters.site || row.site_id === filters.site)).map((row: any) => ({ value: row.code, label: text(row.name as LocalizedText) || row.code, secondaryLabel: row.code })), [filters.site, lines.data, text]);
  return <div className="mes-page space-y-4"><div className="mes-page-header"><div className="flex items-center gap-3"><div className="mes-icon-tile"><Activity className="h-6 w-6" /></div><div><h1 className="text-xl font-bold">{title}</h1><p className="text-xs text-muted-foreground">{subtitle}</p></div></div>{onRefresh ? <Button variant="outline" size="icon" title="Làm mới" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></Button> : null}</div><AnalyticsTabNav search={search} /><AnalyticsFilterBar from={filters.from} to={filters.to} site={filters.site} line={filters.line} status={filters.status} searchText={filters.search} siteOptions={siteOptions} lineOptions={lineOptions} onChange={onChange} onReset={onReset} showAdvanced={showAdvanced} />{children}</div>;
}
