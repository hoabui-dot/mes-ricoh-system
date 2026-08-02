import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { ClipboardList, PlusCircle, RefreshCw, Eye, Search } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { WorkOrderDetailModal } from './WorkOrderDetailModal';
import { normalizeWorkOrderDetail } from './workOrderDetail';
import { gatewayBaseUrl } from '../../lib/masterDataApi';
import { BaseDataTable, type BaseDataTableColumn } from '../../components/base';
import { formatNumberForDisplay } from '../../lib/numeric/uomNumeric';
import type { WorkOrderListRow } from './workOrderContracts';

export const WOListScreen: React.FC = () => {
  const { user } = useAuth();
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<WorkOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filters, setFilters] = useState({ search: '', status: 'ALL', line_selection_status: 'ALL', hold: 'ALL', fallback_used: 'ALL' });
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const headers = { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER' };

  const fetchWorkOrders = async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      Object.entries(filters).forEach(([key, value]) => { if (value && value !== 'ALL') params.set(key, value === 'true' ? 'true' : value === 'false' ? 'false' : value); });
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders?${params.toString()}`, { headers });
      if (!resp.ok) throw new Error(t('wo.loadFailed'));
      const data = await resp.json();
      setWorkOrders(Array.isArray(data.data) ? data.data : []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  };
  useEffect(() => { void fetchWorkOrders(); }, [filters.search, filters.status, filters.line_selection_status, filters.hold, filters.fallback_used]);

  const openDetail = async (wo: WorkOrderListRow) => {
    setDetailLoading(true);
    try {
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${wo.wo_id}`, { headers });
      if (!resp.ok) throw new Error(t('woDetail.loadFailed'));
      setSelectedWorkOrder(normalizeWorkOrderDetail(await resp.json()));
    } catch (err) { setError(err); } finally { setDetailLoading(false); }
  };
  const updateFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const lineResult = (row: WorkOrderListRow, role: 'PRIMARY' | 'BACKUP') => {
    const result = role === 'PRIMARY' ? row.primary_evaluation : row.backup_evaluation;
    return result ? <span className={result.status === 'Ready' ? 'text-emerald-300' : 'text-rose-300'}>{result.status}</span> : <span className="text-slate-500">{t('common.notAvailable')}</span>;
  };
  const columns: BaseDataTableColumn<WorkOrderListRow>[] = [
    { accessorKey: 'wo_code', header: 'WO', cell: ({ getValue }) => <span className="font-mono font-bold text-amber-300">{String(getValue() || '')}</span> },
    { accessorKey: 'item_code', header: t('nav.items'), cell: ({ row }) => <div><span className="font-medium text-slate-100">{row.original.item_code}</span><span className="block text-xs text-slate-500">{String(row.original.item_name || '')}</span></div> },
    { accessorKey: 'quantity', header: t('wo.quantity'), cell: ({ row }) => <span className="font-mono font-semibold text-slate-200">{formatNumberForDisplay(row.original.quantity)} {row.original.uom_id || t('uom.pcs')}</span> },
    { accessorKey: 'planned_start_at', header: t('wo.targetDate'), cell: ({ getValue }) => <span className="text-xs font-mono text-slate-400">{getValue() ? formatDate(String(getValue())) : t('common.notAvailable')}</span> },
    { accessorKey: 'status', header: t('common.status'), cell: ({ getValue }) => <StatusBadge status={String(getValue() || '')}>{t(`status.wo.${String(getValue() || '')}`)}</StatusBadge> },
    { accessorKey: 'selected_production_line_code', header: t('woDetail.selectedProductionLine'), cell: ({ row }) => <div className="font-mono text-xs">{row.original.selected_production_line_code || t('common.notAvailable')}<span className="block font-sans text-slate-500">{row.original.line_selection_status || t('common.notAvailable')}</span></div> },
    { accessorKey: 'line_selection_mode', header: t('woDetail.lineSelectionMode'), cell: ({ row }) => <span className="text-xs">{row.original.line_selection_mode || t('common.notAvailable')}</span> },
    { id: 'result', header: t('woDetail.primaryBackupResult'), cell: ({ row }) => <div className="space-y-1 text-xs"><div>P: {lineResult(row.original, 'PRIMARY')}</div><div>B: {lineResult(row.original, 'BACKUP')}</div></div> },
    { id: 'fallback', header: t('woDetail.fallbackReason'), cell: ({ row }) => <span className={row.original.fallback_reason ? 'text-amber-300 text-xs' : 'text-slate-500 text-xs'}>{row.original.fallback_reason || t('common.none')}</span> },
    { id: 'hold', header: t('woDetail.resourceHold'), cell: ({ row }) => <span className={row.original.line_selection_status === 'RESOURCE_HOLD' ? 'text-rose-300 text-xs' : 'text-slate-500 text-xs'}>{row.original.resource_hold_reason?.code || (row.original.line_selection_status === 'RESOURCE_HOLD' ? t('woDetail.resourceHold') : t('common.none'))}</span> },
    { accessorKey: 'approval_state', header: t('woDetail.approvalState'), cell: ({ row }) => <span className="text-xs">{row.original.approval_state || t('common.notAvailable')}</span> },
    { accessorKey: 'execution_state', header: t('woDetail.executionState'), cell: ({ row }) => <span className="text-xs">{row.original.execution_state || t('common.notAvailable')}</span> },
    { id: 'actions', header: t('common.actions'), enableSorting: false, cell: ({ row }) => <Button onClick={(event) => { event.stopPropagation(); void openDetail(row.original); }} variant="secondary" size="sm"><Eye className="w-3.5 h-3.5" /><span>{t('common.detail')}</span></Button> },
  ];
  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchWorkOrders} />;
  return <div className="mes-page">
    <div className="mes-page-header"><div className="flex items-center space-x-3"><div className="mes-icon-tile"><ClipboardList className="w-6 h-6" /></div><div><h1 className="text-xl font-bold text-slate-100">{t('wo.listTitle')}</h1><p className="text-xs text-slate-400">{t('wo.listSubtitle')}</p></div></div><div className="flex items-center space-x-3"><Button onClick={() => void fetchWorkOrders()} variant="secondary" size="icon" title={t('common.refresh')}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button><Button onClick={() => navigate('/work-orders/new')}><PlusCircle className="w-4 h-4" /><span>{t('wo.create')}</span></Button></div></div>
    <div className="mes-panel flex flex-wrap items-center gap-2 p-3"><Search className="h-4 w-4 text-slate-500" /><input aria-label={t('common.search')} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder={t('common.search')} className="min-w-44 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100" /><select aria-label={t('common.status')} value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm">{['ALL', 'Draft', 'PendingApproval', 'Approved', 'Released', 'InProgress', 'Completed', 'Closed', 'Cancelled'].map((value) => <option key={value} value={value}>{value === 'ALL' ? t('common.all') : t(`status.wo.${value}`)}</option>)}</select><select aria-label={t('woDetail.lineSelectionMode')} value={filters.line_selection_status} onChange={(event) => updateFilter('line_selection_status', event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"><option value="ALL">{t('common.all')} · {t('woDetail.lineSelectionMode')}</option><option value="READY">READY</option><option value="RESOURCE_HOLD">RESOURCE_HOLD</option><option value="NOT_EVALUATED">NOT_EVALUATED</option></select><select aria-label={t('woDetail.resourceHold')} value={filters.hold} onChange={(event) => updateFilter('hold', event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"><option value="ALL">{t('common.all')} · {t('woDetail.resourceHold')}</option><option value="true">{t('woDetail.resourceHold')}</option><option value="false">{t('common.none')}</option></select><select aria-label={t('woDetail.fallbackReason')} value={filters.fallback_used} onChange={(event) => updateFilter('fallback_used', event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"><option value="ALL">{t('common.all')} · {t('woDetail.fallbackReason')}</option><option value="true">{t('common.yes')}</option><option value="false">{t('common.no')}</option></select></div>
    <BaseDataTable data={workOrders} columns={columns} loading={loading} getRowId={(row) => row.wo_id} onRowClick={(wo) => void openDetail(wo)} stickyHeader />
    {detailLoading && <div className="text-sm text-muted-foreground">{t('common.loading')}</div>}{selectedWorkOrder && <WorkOrderDetailModal wo={selectedWorkOrder} onClose={() => setSelectedWorkOrder(null)} onOpen={() => navigate(`/work-orders/${selectedWorkOrder.wo_id}`)} />}
  </div>;
};
