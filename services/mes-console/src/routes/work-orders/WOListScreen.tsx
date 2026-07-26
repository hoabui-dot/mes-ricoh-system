import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { ClipboardList, PlusCircle, RefreshCw, Eye } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { WorkOrderDetailModal } from './WorkOrderDetailModal';
import { normalizeWorkOrderDetail } from './workOrderDetail';
import { gatewayBaseUrl } from '../../lib/masterDataApi';

export const WOListScreen: React.FC = () => {
  const { user } = useAuth();
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();

  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchWorkOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders?limit=50`, {
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER' },
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error(t('wo.loadFailed'));
      }
      const data = await resp.json();
      setWorkOrders(data.data || []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  const openDetail = async (wo: any) => {
    setDetailLoading(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`${gatewayBaseUrl()}/api/mes/execution/work-orders/${wo.wo_id}`, { headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER' } });
      if (!resp.ok) throw new Error(t('woDetail.loadFailed'));
      setSelectedWorkOrder(normalizeWorkOrderDetail(await resp.json()));
    } catch (err: any) { setError(err); } finally { setDetailLoading(false); }
  };

  const filteredWOs = workOrders.filter((wo) => {
    if (statusFilter === 'ALL') return true;
    return wo.status === statusFilter;
  });

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchWorkOrders} />;

  return (
    <div className="mes-page">
      <div className="mes-page-header">
        <div className="flex items-center space-x-3">
          <div className="mes-icon-tile">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('wo.listTitle')}</h1>
            <p className="text-xs text-slate-400">{t('wo.listSubtitle')}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button onClick={fetchWorkOrders} variant="secondary" size="icon">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={() => navigate('/work-orders/new')}
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t('wo.create')}</span>
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mes-panel flex items-center space-x-2 p-3 overflow-x-auto">
        <span className="text-xs font-bold text-slate-400 uppercase px-2">{t('common.status')}:</span>
        {['ALL', 'Draft', 'Approved', 'InProgress', 'Completed', 'Rejected'].map((st) => (
          <Button
            key={st}
            onClick={() => setStatusFilter(st)}
            variant={statusFilter === st ? 'default' : 'secondary'}
            size="sm"
          >
            {st === 'ALL' ? `${t('common.all')} ${t('common.status')}` : t(`status.wo.${st}`)}
          </Button>
        ))}
      </div>

      {/* WO Table */}
      <div className="mes-table-wrap">
        <table className="mes-table">
          <thead>
            <tr>
              <th className="px-6 py-4">WO</th>
              <th className="px-6 py-4">{t('nav.items')}</th>
              <th className="px-6 py-4">{t('wo.quantity')}</th>
              <th className="px-6 py-4">{t('wo.targetDate')}</th>
              <th className="px-6 py-4">{t('common.status')}</th>
              <th className="px-6 py-4 text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredWOs.map((wo) => (
              <tr key={wo.wo_id} onClick={() => void openDetail(wo)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') void openDetail(wo); }} tabIndex={0} className="cursor-pointer hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono font-bold text-amber-300">{wo.wo_code}</td>
                <td className="px-6 py-4 font-medium text-slate-100">{wo.item_code}</td>
                <td className="px-6 py-4 font-mono font-semibold text-slate-200">{wo.quantity} {wo.uom || t('uom.pcs')}</td>
                <td className="px-6 py-4 text-xs font-mono text-slate-400">
                  {wo.target_completion_date ? formatDate(wo.target_completion_date) : t('common.notAvailable')}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={wo.status}>
                    {t(`status.wo.${wo.status}`)}
                  </StatusBadge>
                </td>
                <td className="px-6 py-4 text-right">
                  <Button
                    onClick={(event) => { event.stopPropagation(); void openDetail(wo); }}
                    variant="secondary"
                    size="sm"
                    className="ml-auto"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{t('common.detail')}</span>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detailLoading && <div className="text-sm text-muted-foreground">{t('common.loading')}</div>}
      {selectedWorkOrder && <WorkOrderDetailModal wo={selectedWorkOrder} onClose={() => setSelectedWorkOrder(null)} onOpen={() => navigate(`/work-orders/${selectedWorkOrder.wo_id}`)} />}
    </div>
  );
};
