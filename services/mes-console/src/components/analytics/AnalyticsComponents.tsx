import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { AlertCircle, BarChart3, Inbox, LoaderCircle } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { SelectBase, type SelectBaseOption } from '../ui';
import { BaseDataTable } from '../base';
import type { ColumnDef } from '@tanstack/react-table';

export const analyticsPalette = { primary: '#38bdf8', secondary: '#a78bfa', success: '#34d399', warning: '#fbbf24', danger: '#fb7185', neutral: '#94a3b8' };
export const analyticsTabs = [
  { path: '/analytics', label: 'Tổng quan' },
  { path: '/analytics/production', label: 'Sản xuất & Work Order' },
  { path: '/analytics/lines-resources', label: 'Line & Nguồn lực' },
  { path: '/analytics/execution-quality', label: 'Thực thi & Chất lượng' },
  { path: '/analytics/materials-traceability', label: 'Vật tư & Truy xuất' },
  { path: '/analytics/print-system', label: 'In & Hệ thống' },
];

export function AnalyticsTabNav({ search }: { search: string }) {
  const { t } = useI18n();
  const keys = ['analytics.tabs.overview', 'analytics.tabs.production', 'analytics.tabs.lines', 'analytics.tabs.execution', 'analytics.tabs.materials', 'analytics.tabs.print'];
  return <nav className="flex flex-wrap gap-2 border-b border-border pb-3" aria-label={t('analytics.nav')} role="tablist">{analyticsTabs.map((tab, index) => <a key={tab.path} href={`${tab.path}${search}`} role="tab" aria-selected={window.location.pathname === tab.path} className={cn('rounded-md border px-3 py-2 text-sm font-semibold transition', window.location.pathname === tab.path ? 'border-info bg-info/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}>{t(keys[index])}</a>)}</nav>;
}

export function AnalyticsFilterBar({ from, to, site, line, status, searchText = '', siteOptions = [], lineOptions = [], onChange, onReset, showAdvanced = true }: { from: string; to: string; site: string; line: string; status: string; searchText?: string; siteOptions?: SelectBaseOption[]; lineOptions?: SelectBaseOption[]; onChange: (key: string, value: string) => void; onReset: () => void; showAdvanced?: boolean }) {
  const { t } = useI18n();
  const [advanced, setAdvanced] = useState(false); const activeCount = [site, line, status, searchText].filter(Boolean).length;
  return <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3">
    {[["from", "Từ ngày", from], ["to", "Đến ngày", to]].map(([key, label, value]) => <label key={key} className="space-y-1 text-sm"><span className="block font-semibold text-muted-foreground">{label}</span><Input aria-label={label} type="date" value={value} onChange={(e) => onChange(key, e.target.value)} /></label>)}
    <label className="min-w-48 flex-1 space-y-1 text-sm"><span className="block font-semibold text-muted-foreground">Nhà máy</span><SelectBase aria-label="Nhà máy" value={site} onValueChange={(value) => onChange('site', value)} options={siteOptions} placeholder="Chọn nhà máy" /></label>
    <label className="min-w-48 flex-1 space-y-1 text-sm"><span className="block font-semibold text-muted-foreground">Dây chuyền</span><SelectBase aria-label="Dây chuyền" value={line} onValueChange={(value) => onChange('line', value)} options={lineOptions} placeholder="Chọn dây chuyền" /></label>
    <label className="min-w-36 space-y-1 text-sm"><span className="block font-semibold text-muted-foreground">Trạng thái WO</span><select aria-label="Trạng thái WO" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => onChange('status', e.target.value)}><option value="">Tất cả trạng thái</option><option value="Released">Đã phát hành</option><option value="InProgress">Đang sản xuất</option><option value="Completed">Hoàn thành</option><option value="Paused">Tạm dừng</option></select></label>
    {showAdvanced ? <Button variant="ghost" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>Bộ lọc khác{activeCount ? ` (${activeCount})` : ''}</Button> : null}
    {advanced ? <label className="min-w-44 flex-1 space-y-1 text-sm"><span className="block font-semibold text-muted-foreground">Tìm WO / Item</span><Input aria-label="Tìm WO hoặc Item" value={searchText} placeholder="Mã WO hoặc sản phẩm" onChange={(e) => onChange('search', e.target.value)} /></label> : null}
    <Button variant="outline" onClick={onReset}>{t('analytics.filters.reset')}</Button>
  </div>;
}

export function AnalyticsKpiCard({ label, value, hint, tone = 'default' }: { label: string; value: string | number; hint?: string; tone?: 'default' | 'warning' | 'danger' | 'success' }) {
  return <Card className={cn('p-4', tone === 'warning' && 'border-amber-500/50', tone === 'danger' && 'border-rose-500/50', tone === 'success' && 'border-emerald-500/50')}><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold tracking-normal text-foreground">{value}</p>{hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}</Card>;
}

export function AnalyticsChartCard({ title, subtitle, option, loading, empty, onClick, emptyMessage }: { title: string; subtitle?: string; option?: echarts.EChartsOption; loading?: boolean; empty?: boolean; onClick?: (params: unknown) => void; emptyMessage?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || loading || empty || !option) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    if (onClick) chart.on('click', onClick);
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (!chart.isDisposed()) chart.dispose();
    };
  }, [option, loading, empty, onClick]);
  return <Card className="p-4"><div className="mb-2 flex items-start gap-2"><BarChart3 className="mt-0.5 h-4 w-4 text-info" /><div><h2 className="text-sm font-bold">{title}</h2>{subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}</div></div><div className="relative h-56 w-full"><div ref={ref} role="img" aria-label={`${title}. ${subtitle || ''}`} className="h-full w-full" />{loading ? <div className="absolute inset-0 flex items-center justify-center bg-card text-muted-foreground"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Đang tải dữ liệu</div> : null}{!loading && empty ? <div className="absolute inset-0 bg-card"><AnalyticsEmptyState message={emptyMessage} /></div> : null}</div></Card>;
}

export function AnalyticsEmptyState({ message = 'Chưa có dữ liệu trong khoảng thời gian đã chọn.' }: { message?: string }) { return <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><Inbox className="h-7 w-7" /><span>{message}</span><span className="text-xs">Thử đổi khoảng ngày hoặc xóa bộ lọc.</span></div>; }
export function AnalyticsErrorState({ onRetry }: { onRetry: () => void }) { return <div className="flex items-center justify-between rounded-md border border-rose-500/40 bg-rose-500/10 p-4 text-sm"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />Không tải được dữ liệu phân tích.</span><Button variant="outline" onClick={onRetry}>Thử lại</Button></div>; }
export function AnalyticsLegend({ items }: { items: Array<{ label: string; value: string | number; color?: string }> }) { return <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">{items.map((item) => <span key={item.label} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: item.color || 'currentColor' }} />{item.label}: <b className="text-foreground">{item.value}</b></span>)}</div>; }
export function AnalyticsDrilldownDrawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true"><div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-5 shadow-xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><Button variant="outline" size="sm" onClick={onClose}>Đóng</Button></div>{children}</div></div>; }
export function AnalyticsReportTable({ rows, onOpen }: { rows: Array<{ wo_id: string; wo_code: string; item_code: string; status: string; planned_quantity: number; selected_line_code?: string }>; onOpen: (id: string) => void }) {
  const columns = useMemo<ColumnDef<typeof rows[number]>[]>(() => [
    { accessorKey: 'wo_code', header: 'WO', cell: ({ row }) => <span className="font-mono font-semibold text-info">{row.original.wo_code}</span> },
    { accessorKey: 'item_code', header: 'Sản phẩm' },
    { accessorKey: 'status', header: 'Trạng thái', cell: ({ row }) => ({ Completed: 'Hoàn thành', InProgress: 'Đang sản xuất', Paused: 'Tạm dừng', Released: 'Đã phát hành', ResourceHold: 'Resource Hold' }[row.original.status] || row.original.status) },
    { accessorKey: 'planned_quantity', header: 'Sản lượng kế hoạch', meta: { align: 'right' } },
    { accessorKey: 'selected_line_code', header: 'Dây chuyền', cell: ({ row }) => row.original.selected_line_code || 'Chưa chọn' },
  ], []);
  return <BaseDataTable columns={columns} data={rows} getRowId={(row) => row.wo_id} onRowClick={(row) => onOpen(row.wo_id)} pageSizeOptions={[10, 25, 50]} emptyState={<AnalyticsEmptyState message="Chưa có Work Order trong khoảng thời gian này." />} />;
}

export function AnalyticsAggregateTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const keys = useMemo(() => rows.length ? Object.keys(rows[0]).slice(0, 8) : [], [rows]);
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => keys.map((key) => ({ accessorKey: key, header: key.split('_').join(' '), cell: ({ row }) => String(row.original[key] ?? 'Chưa có') })), [keys]);
  return <BaseDataTable columns={columns} data={rows} getRowId={(_, index) => `${index}`} pageSizeOptions={[10, 25, 50]} emptyState={<AnalyticsEmptyState />} />;
}
