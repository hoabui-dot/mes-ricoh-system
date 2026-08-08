import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { gatewayBaseUrl } from '../../lib/masterDataApi';
import { analyticsPalette, AnalyticsAggregateTable, AnalyticsChartCard, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsKpiCard, AnalyticsReportTable } from '../../components/analytics';
import { AnalyticsPageShell, analyticsHeaders, useAnalyticsFilters } from './AnalyticsPageShell';

type Kind = 'production' | 'lines-resources' | 'execution-quality' | 'materials-traceability' | 'print-system';
const pageMeta: Record<Kind, { title: string; subtitle: string }> = {
  production: { title: 'Sản xuất & Work Order', subtitle: 'Theo dõi throughput, vòng đời và Work Order cần điều tra.' },
  'lines-resources': { title: 'Line & Nguồn lực', subtitle: 'So sánh tải line, fallback và các điểm nghẽn nguồn lực.' },
  'execution-quality': { title: 'Thực thi & Chất lượng', subtitle: 'Theo dõi kết quả công đoạn, lỗi và sản lượng good/scrap.' },
  'materials-traceability': { title: 'Vật tư & Truy xuất', subtitle: 'Readiness vật tư và traceability trong MES, không thay thế tồn kho WMS.' },
  'print-system': { title: 'In & Hệ thống', subtitle: 'Theo dõi print job và mức sẵn sàng master data tách biệt khỏi KPI sản xuất.' },
};

function payloadRows(payload: any, key: string) { return Array.isArray(payload?.[key]?.data) ? payload[key].data : []; }
function appendQuery(path: string, query: URLSearchParams, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(query);
  Object.entries(extra).forEach(([key, value]) => params.set(key, value));
  return `${path}?${params.toString()}`;
}

async function fetchAnalytics(kind: Kind, query: URLSearchParams, headers: Record<string, string>) {
  const base = gatewayBaseUrl();
  const get = async (path: string, extra?: Record<string, string>) => {
    const response = await fetch(`${base}${appendQuery(path, query, extra)}`, { headers });
    if (!response.ok) throw new Error(path);
    return response.json();
  };
  if (kind === 'production') {
    const [overview, workOrders, lines] = await Promise.all([get('/api/mes/execution/analytics/overview'), get('/api/mes/execution/analytics/work-orders', { page_size: '200' }), get('/api/mes/execution/analytics/lines')]);
    return { overview, workOrders, lines };
  }
  if (kind === 'lines-resources') {
    const [overview, lines, resources] = await Promise.all([get('/api/mes/execution/analytics/overview'), get('/api/mes/execution/analytics/lines'), get('/api/mes/execution/analytics/resources')]);
    return { overview, lines, resources };
  }
  if (kind === 'execution-quality') {
    const [overview, operations] = await Promise.all([get('/api/mes/execution/analytics/overview'), get('/api/mes/execution/analytics/operations')]);
    return { overview, operations };
  }
  if (kind === 'materials-traceability') {
    const [materials, traceability] = await Promise.all([get('/api/mes/execution/analytics/materials'), get('/api/mes/traceability/analytics/overview')]);
    return { materials, traceability };
  }
  const [print, readiness] = await Promise.all([
    get('/api/mes/execution/analytics/print'),
    fetch(`${base}${appendQuery('/api/mes/master-data/analytics/readiness', query, query.get('site') ? { site_id: query.get('site')! } : {})}`, { headers }).then(async (response) => {
      if (!response.ok) throw new Error('readiness');
      return response.json();
    }),
  ]);
  return { print, readiness };
}

function labels(rows: any[]) { return rows.map((row) => row.line_code || row.operation_code || row.work_center_code || row.status || row.reason || row.failure_reason || row.print_station_code || row.selection || row.relationship_type || row.allocation_source || 'Khác'); }
function values(rows: any[]) { return rows.map((row) => Number(row.planned_quantity ?? row.good_quantity ?? row.operation_count ?? row.jobs ?? row.allocations ?? row.count ?? row.value ?? 0)); }

export const AnalyticsDeepDiveScreen: React.FC = () => {
  const { tab = 'production' } = useParams();
  const kind = (Object.keys(pageMeta).includes(tab) ? tab : 'production') as Kind;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { filters, query, change, reset, search } = useAnalyticsFilters();
  const headers = analyticsHeaders(user);
  const result = useQuery({ queryKey: ['mes-analytics-tab', kind, query.toString()], staleTime: 30_000, queryFn: () => fetchAnalytics(kind, query, headers) });
  const payload: any = result.data || {};
  const trend = payload.overview?.production_trend || [];
  const lineRows = payloadRows(payload, 'lines');
  const resourceRows = payloadRows(payload, 'resources');
  const operationRows = payloadRows(payload, 'operations');
  const materialRows = payloadRows(payload, 'materials');
  const printRows = payloadRows(payload, 'print');
  const traceRows = payload.traceability?.status_distribution || [];
  const chartRows = kind === 'lines-resources' ? lineRows : kind === 'execution-quality' ? operationRows : kind === 'materials-traceability' ? (materialRows.length ? materialRows : traceRows) : kind === 'print-system' ? printRows : [];
  const option = useMemo<EChartsOption>(() => {
    if (kind === 'production' || kind === 'execution-quality') {
      return { tooltip: { trigger: 'axis' }, legend: { textStyle: { color: analyticsPalette.neutral } }, xAxis: { type: 'category', data: trend.map((row: any) => row.date), axisLabel: { color: analyticsPalette.neutral } }, yAxis: { type: 'value', axisLabel: { color: analyticsPalette.neutral } }, series: [{ name: 'Kế hoạch', type: 'line', data: trend.map((row: any) => row.planned_quantity), itemStyle: { color: analyticsPalette.primary } }, { name: 'Good', type: 'line', data: trend.map((row: any) => row.good_quantity), itemStyle: { color: analyticsPalette.success } }, { name: 'Scrap', type: 'line', data: trend.map((row: any) => row.scrap_quantity), itemStyle: { color: analyticsPalette.danger } }] };
    }
    const categoryLabels = labels(chartRows);
    const categoryValues = values(chartRows);
    const ranking = kind === 'lines-resources' || kind === 'print-system';
    return { tooltip: { trigger: 'axis' }, grid: { left: ranking ? 145 : 70, right: 20, bottom: 55 }, xAxis: { type: ranking ? 'value' : 'category', data: ranking ? undefined : categoryLabels, axisLabel: { color: analyticsPalette.neutral, rotate: categoryLabels.length > 7 ? 25 : 0 } }, yAxis: { type: ranking ? 'category' : 'value', data: ranking ? categoryLabels : undefined, inverse: ranking, axisLabel: { color: analyticsPalette.neutral } }, series: [{ type: 'bar', data: categoryValues, itemStyle: { color: analyticsPalette.primary } }] };
  }, [kind, trend, chartRows]);
  if (result.isError) return <div className="mes-page"><AnalyticsErrorState onRetry={() => void result.refetch()} /></div>;
  const kpis = payload.overview?.kpis || payload.traceability?.kpis || {};
  const kpiEntries: Array<[string, string, string | number, 'default' | 'warning' | 'danger' | 'success']> = kind === 'production'
    ? [['total', 'Tổng Work Order', Number(kpis.active_work_orders || 0) + Number(kpis.completed_work_orders || 0) + Number(kpis.blocked_work_orders || 0), 'default'], ['active', 'Đang sản xuất', kpis.active_work_orders || 0, 'default'], ['completed', 'Hoàn thành', kpis.completed_work_orders || 0, 'success'], ['blocked', 'Bị chặn / Resource Hold', kpis.blocked_work_orders || 0, 'warning']]
    : kind === 'lines-resources'
      ? [['primary', 'Primary được chọn', kpis.active_work_orders || 0, 'default'], ['backup', 'Backup proxy', kpis.backup_line_used || 0, 'warning'], ['hold', 'Resource Hold', kpis.resource_hold_work_orders || 0, 'danger']]
      : kind === 'execution-quality'
        ? [['good', 'Sản lượng Good', kpis.good_quantity || 0, 'success'], ['scrap', 'Sản lượng Scrap', kpis.scrap_quantity || 0, 'danger'], ['rate', 'Tỷ lệ Scrap', `${((Number(kpis.scrap_rate || 0)) * 100).toFixed(1)}%`, 'danger']]
        : kind === 'materials-traceability'
          ? [['ready', 'Ready', payload.materials?.summary?.ready || 0, 'success'], ['waiting', 'Waiting', payload.materials?.summary?.waiting || 0, 'warning'], ['shortage', 'Shortage', payload.materials?.summary?.shortage || 0, 'danger'], ['labels', 'Nhãn', kpis.labels_generated || 0, 'default']]
          : [['jobs', 'Print jobs', printRows.reduce((sum: number, row: any) => sum + Number(row.jobs || 0), 0), 'default'], ['failed', 'Print lỗi', printRows.reduce((sum: number, row: any) => sum + Number(row.failed || row.failures || 0), 0), 'danger'], ['released', 'Line đã release', payload.readiness?.data?.released_production_lines || 0, 'success']];
  const reportRows = kind === 'production' ? payload.workOrders?.data || [] : chartRows;
  const title = pageMeta[kind].title;
  const chartTitle = kind === 'production' ? 'Created / Started / Completed theo thời gian' : kind === 'execution-quality' ? 'Xu hướng Good / Scrap theo thời gian' : kind === 'lines-resources' ? 'Xếp hạng tải theo line' : kind === 'materials-traceability' ? 'Readiness vật tư hoặc trạng thái traceability' : 'Xếp hạng print job theo trạm';
  return <AnalyticsPageShell title={title} subtitle={pageMeta[kind].subtitle} filters={filters} onChange={change} onReset={reset} search={search} onRefresh={() => void result.refetch()}>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{kpiEntries.map(([key, label, value, tone]) => <AnalyticsKpiCard key={key} label={label} value={value} tone={tone} />)}</div>
    <div className="grid grid-cols-12 gap-4"><div className="col-span-12 lg:col-span-8"><AnalyticsChartCard title={chartTitle} subtitle="Số liệu được tổng hợp bởi owner analytics API." option={option} loading={result.isLoading} empty={!chartRows.length && !trend.length} /></div><div className="col-span-12 lg:col-span-4 rounded-md border border-border bg-card p-4"><h2 className="text-sm font-bold">Phạm vi đang xem</h2><p className="mt-3 text-sm text-muted-foreground">{filters.from} - {filters.to}</p><p className="mt-3 text-xs text-muted-foreground">Metric proxy được ghi rõ khi backend chưa có contract chính thức.</p>{kind === 'lines-resources' && resourceRows.length ? <p className="mt-4 text-sm">{resourceRows.length} tài nguyên có dữ liệu trong kỳ.</p> : null}{kind === 'print-system' ? <ul className="mt-4 space-y-2 text-xs">{Object.entries(payload.readiness?.data || {}).slice(0, 6).map(([key, value]) => <li key={key} className="flex justify-between gap-3"><span>{key.split('_').join(' ')}</span><b>{String(value)}</b></li>)}</ul> : null}</div></div>
    <section className="overflow-hidden rounded-md border border-border bg-card"><div className="border-b border-border p-4"><h2 className="text-sm font-bold">Báo cáo điều tra chi tiết</h2></div>{kind === 'production' ? <AnalyticsReportTable rows={reportRows} onOpen={(id) => navigate(`/work-orders/${id}`)} /> : <AnalyticsAggregateTable rows={reportRows} />}</section>
  </AnalyticsPageShell>;
};
