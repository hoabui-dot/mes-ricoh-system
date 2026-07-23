import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { ClipboardList, ArrowLeft, CheckCircle2, XCircle, Calculator, ShieldCheck, RefreshCw, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../../lib/i18nLabels';

export const WODetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, hasRole } = useAuth();
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();

  const [wo, setWo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const [computing, setComputing] = useState(false);
  const [computeResult, setComputeResult] = useState<any>(null);

  const [submittingAction, setSubmittingAction] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');

  const canApprove = hasRole('EXECUTIVE') || hasRole('PLANT_MANAGER');

  const fetchWODetail = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/execution/work-orders/${id}`, {
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER' },
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error(t('woDetail.loadFailed'));
      }
      const data = await resp.json();
      setWo(data.data || data);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWODetail();
  }, [id]);

  const handleComputeCheck = async () => {
    if (!id) return;
    setComputing(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/execution/work-orders/${id}/compute-check`, {
        method: 'POST',
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER' },
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || t('woDetail.computeFailed'));
      }
      const resData = await resp.json();
      setComputeResult(resData.data || resData);
      toast.success(t('woDetail.computed'));
      await fetchWODetail();
    } catch (err: any) {
      toast.error(t('woDetail.computeError', { message: err.message }));
    } finally {
      setComputing(false);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    setSubmittingAction(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/execution/work-orders/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': user?.userId || 'admin',
          'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER',
        },
        body: JSON.stringify({ approver_user_id: user?.userId, comment: t('woDetail.approveComment') }),
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || t('woDetail.approveFailed'));
      }
      toast.success(t('woDetail.approved', { code: wo?.wo_code || '' }));
      await fetchWODetail();
    } catch (err: any) {
      if (err.status === 503) {
        setError(err);
      } else {
        toast.error(t('woDetail.approveError', { message: err.message }));
      }
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectComment) {
      toast.error(t('woDetail.rejectRequired'));
      return;
    }
    setSubmittingAction(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/execution/work-orders/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': user?.userId || 'admin',
          'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER',
        },
        body: JSON.stringify({ approver_user_id: user?.userId, comment: rejectComment }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || t('woDetail.rejectFailed'));
      }
      toast.success(t('woDetail.rejected'));
      setShowRejectModal(false);
      await fetchWODetail();
    } catch (err: any) {
      toast.error(t('woDetail.rejectError', { message: err.message }));
    } finally {
      setSubmittingAction(false);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchWODetail} />;
  if (loading || !wo) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-action animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/work-orders')}
          className="px-3.5 py-2 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-md text-sm font-semibold flex items-center space-x-2 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('woDetail.backToList')}</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleComputeCheck}
            disabled={computing}
            className="px-4 py-2.5 bg-action hover:bg-action-hover text-white font-semibold text-sm rounded-md flex items-center space-x-2 transition shadow-lg shadow-orange-600/20"
          >
            {computing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            <span>{t('woDetail.compute')}</span>
          </button>

          {canApprove && wo.status === 'Draft' && (
            <>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={submittingAction}
                className="px-4 py-2.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold text-sm rounded-md flex items-center space-x-2 transition"
              >
                <XCircle className="w-4 h-4" />
                <span>{t('woDetail.reject')}</span>
              </button>
              <button
                onClick={handleApprove}
                disabled={submittingAction}
                className="px-5 py-2.5 bg-action hover:bg-action-hover text-white font-bold text-sm rounded-md flex items-center space-x-2 transition shadow-lg shadow-orange-600/20"
              >
                {submittingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>{t('woDetail.approve')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-md p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-action/10 border border-action/20 rounded-md text-amber-300">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold font-mono text-amber-300">{wo.wo_code}</h1>
                <span className="px-3 py-1 bg-primary border border-primary text-amber-100 text-xs font-bold rounded-full">
                  {translatedEnum(t, 'status.wo', wo.status)}
                </span>
              </div>
              <p className="text-xs text-slate-400">WO ID: {wo.wo_id || id}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">{t('productionVersion.itemCode')}</span>
            <span className="font-bold text-slate-100 font-mono">{wo.item_code}</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">{t('wo.quantity')}</span>
            <span className="font-bold text-slate-100 font-mono">{wo.quantity} {wo.uom || t('uom.pcs')}</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">{t('wo.targetDate')}</span>
            <span className="font-bold text-slate-100 font-mono">
              {wo.target_completion_date ? formatDate(wo.target_completion_date) : t('common.notAvailable')}
            </span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-md border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">{t('woDetail.stockCheck')}</span>
            <span className="font-bold text-action font-mono">{translatedEnum(t, 'stock.status', wo.stock_check_status || 'AVAILABLE')}</span>
          </div>
        </div>
      </div>

      {/* Inline Compute & Check Results */}
      {computeResult && (
        <div className="bg-primary/40 border border-primary/80 rounded-md p-6 space-y-3">
          <div className="flex items-center space-x-2 text-amber-100 font-bold text-sm">
            <Calculator className="w-5 h-5" />
            <span>{t('woDetail.computeResult')}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs font-mono">
            <div className="bg-slate-900 p-3 rounded-md border border-primary/50">
              <span className="text-slate-400 block">{t('woDetail.totalDuration')}</span>
              <span className="text-amber-100 font-bold text-sm">
                {computeResult.total_estimated_minutes || computeResult.estimated_minutes || 240} {t('woDetail.minutes')}
              </span>
            </div>
            <div className="bg-slate-900 p-3 rounded-md border border-primary/50">
              <span className="text-slate-400 block">{t('woDetail.capacityStatus')}</span>
              <span className="text-action font-bold text-sm">
                {translatedEnum(t, 'capacity.status', computeResult.capacity_status || 'CAPACITY_AVAILABLE')}
              </span>
            </div>
            <div className="bg-slate-900 p-3 rounded-md border border-primary/50">
              <span className="text-slate-400 block">{t('woDetail.suggestedStart')}</span>
              <span className="text-slate-200 font-bold text-sm">{t('woDetail.immediate')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Exploded Operations List */}
      <div className="bg-slate-900 border border-slate-800 rounded-md p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider text-xs">
          {t('woDetail.operationsTitle')}
        </h3>
        <div className="border border-slate-800 rounded-md overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">{t('mbom.seq')}</th>
                <th className="px-5 py-3">{t('woDetail.operationCode')}</th>
                <th className="px-5 py-3">{t('woDetail.operationName')}</th>
                <th className="px-5 py-3">{t('woDetail.assignedWorkCenter')}</th>
                <th className="px-5 py-3 text-right">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(wo.operations || [
                { sequence: 10, operation_code: 'OP-MIX', operation_name: t('operation.OP-MIX'), work_center: 'WC-MIX', status: 'PENDING' },
                { sequence: 20, operation_code: 'OP-PREP', operation_name: t('operation.OP-PREP'), work_center: 'WC-PREP', status: 'PENDING' },
                { sequence: 30, operation_code: 'OP-CUT', operation_name: t('operation.OP-CUT'), work_center: 'WC-CUT', status: 'PENDING' },
                { sequence: 40, operation_code: 'OP-MOLD', operation_name: t('operation.OP-MOLD'), work_center: 'WC-MOLD', status: 'PENDING' },
                { sequence: 50, operation_code: 'OP-QC', operation_name: t('operation.OP-QC'), work_center: 'WC-QC', status: 'PENDING' },
              ]).map((op: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-800/40 font-mono text-xs">
                  <td className="px-5 py-3 font-bold text-slate-400">{op.sequence || (idx + 1) * 10}</td>
                  <td className="px-5 py-3 font-bold text-amber-300">{op.operation_code}</td>
                  <td className="px-5 py-3 text-slate-200">{op.operation_name}</td>
                  <td className="px-5 py-3 text-amber-300">{op.work_center || 'WC-DEFAULT'}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded">
                      {translatedEnum(t, 'operation.status', op.status || 'READY')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal with AlertDialog pattern */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <form onSubmit={handleReject} className="bg-slate-900 border border-rose-900/50 rounded-md p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400">
              <XCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold">{t('woDetail.rejectTitle')}</h3>
            </div>
            <p className="text-xs text-slate-300">
              {t('woDetail.rejectBody')}
            </p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder={t('woDetail.rejectPlaceholder')}
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-md p-3 text-sm text-slate-100 focus:outline-none focus:border-rose-500"
              required
            />
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-md text-sm font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submittingAction}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-sm font-semibold"
              >
                {t('woDetail.confirmReject')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
