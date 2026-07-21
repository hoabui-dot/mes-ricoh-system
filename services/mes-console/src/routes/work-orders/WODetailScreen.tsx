import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { ClipboardList, ArrowLeft, CheckCircle2, XCircle, Calculator, ShieldCheck, RefreshCw, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export const WODetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, hasRole } = useAuth();
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
        throw new Error('Không thể tải thông tin Lệnh sản xuất');
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
        throw new Error(errJson.message || errJson.error || 'Compute & Check thất bại');
      }
      const resData = await resp.json();
      setComputeResult(resData.data || resData);
      toast.success('Đã tính toán thời lượng & capacity check thành công!');
      await fetchWODetail();
    } catch (err: any) {
      toast.error(`Lỗi Compute & Check: ${err.message}`);
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
        body: JSON.stringify({ approver_user_id: user?.userId, comment: 'Đã phê duyệt sản xuất' }),
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || 'Phê duyệt WO thất bại');
      }
      toast.success(`Đã Phê Duyệt Lệnh sản xuất ${wo?.wo_code || ''}! Event WOApproved.v1 đã gửi Kafka.`);
      await fetchWODetail();
    } catch (err: any) {
      if (err.status === 503) {
        setError(err);
      } else {
        toast.error(`Lỗi Approve: ${err.message}`);
      }
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectComment) {
      toast.error('Vui lòng nhập lý do từ chối');
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
        throw new Error(errJson.message || errJson.error || 'Từ chối WO thất bại');
      }
      toast.success('Đã Từ Chối Lệnh sản xuất.');
      setShowRejectModal(false);
      await fetchWODetail();
    } catch (err: any) {
      toast.error(`Lỗi Từ chối: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchWODetail} />;
  if (loading || !wo) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/work-orders')}
          className="px-3.5 py-2 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Danh sách Lệnh</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleComputeCheck}
            disabled={computing}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 transition shadow-lg shadow-indigo-600/20"
          >
            {computing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            <span>Compute & Check</span>
          </button>

          {canApprove && wo.status === 'Draft' && (
            <>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={submittingAction}
                className="px-4 py-2.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold text-sm rounded-xl flex items-center space-x-2 transition"
              >
                <XCircle className="w-4 h-4" />
                <span>Từ Chối</span>
              </button>
              <button
                onClick={handleApprove}
                disabled={submittingAction}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl flex items-center space-x-2 transition shadow-lg shadow-emerald-600/20"
              >
                {submittingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Phê Duyệt Lệnh</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-600/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold font-mono text-indigo-400">{wo.wo_code}</h1>
                <span className="px-3 py-1 bg-indigo-950 border border-indigo-800 text-indigo-300 text-xs font-bold rounded-full">
                  {wo.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">WO ID: {wo.wo_id || id}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">Mã Sản Phẩm</span>
            <span className="font-bold text-slate-100 font-mono">{wo.item_code}</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">Sản Lượng Mục Tiêu</span>
            <span className="font-bold text-slate-100 font-mono">{wo.quantity} {wo.uom || 'Cái'}</span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">Hạn Mục Tiêu</span>
            <span className="font-bold text-slate-100 font-mono">
              {wo.target_completion_date ? new Date(wo.target_completion_date).toLocaleDateString() : '2026-08-01'}
            </span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-500 font-semibold block uppercase">Stock Check Status</span>
            <span className="font-bold text-emerald-400 font-mono">{wo.stock_check_status || 'AVAILABLE'}</span>
          </div>
        </div>
      </div>

      {/* Inline Compute & Check Results */}
      {computeResult && (
        <div className="bg-indigo-950/40 border border-indigo-800/80 rounded-2xl p-6 space-y-3">
          <div className="flex items-center space-x-2 text-indigo-300 font-bold text-sm">
            <Calculator className="w-5 h-5" />
            <span>Kết quả Tính toán Thời Lượng & Capacity Check (ComputeAndCheck):</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs font-mono">
            <div className="bg-slate-900 p-3 rounded-xl border border-indigo-900/50">
              <span className="text-slate-400 block">Tổng thời lượng sản xuất:</span>
              <span className="text-indigo-200 font-bold text-sm">
                {computeResult.total_estimated_minutes || computeResult.estimated_minutes || 240} phút
              </span>
            </div>
            <div className="bg-slate-900 p-3 rounded-xl border border-indigo-900/50">
              <span className="text-slate-400 block">Trạng thái Capacity Check:</span>
              <span className="text-emerald-400 font-bold text-sm">
                {computeResult.capacity_status || 'CAPACITY_AVAILABLE'}
              </span>
            </div>
            <div className="bg-slate-900 p-3 rounded-xl border border-indigo-900/50">
              <span className="text-slate-400 block">Thời gian bắt đầu đề xuất:</span>
              <span className="text-slate-200 font-bold text-sm">Immediate</span>
            </div>
          </div>
        </div>
      )}

      {/* Exploded Operations List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider text-xs">
          Danh Sách Công Đoạn Thi Công (Exploded wo_operation)
        </h3>
        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Thứ Tự (Seq)</th>
                <th className="px-5 py-3">Mã Công Đoạn</th>
                <th className="px-5 py-3">Tên Công Đoạn</th>
                <th className="px-5 py-3">WorkCenter Giao Việc</th>
                <th className="px-5 py-3 text-right">Trạng Thái Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(wo.operations || [
                { sequence: 10, operation_code: 'OP-MIX', operation_name: 'Pha chế cao su (Mixing)', work_center: 'WC-MIX', status: 'PENDING' },
                { sequence: 20, operation_code: 'OP-PREP', operation_name: 'Chuẩn bị phôi (Pre-form)', work_center: 'WC-PREP', status: 'PENDING' },
                { sequence: 30, operation_code: 'OP-CUT', operation_name: 'Cắt phôi (Cutting)', work_center: 'WC-CUT', status: 'PENDING' },
                { sequence: 40, operation_code: 'OP-MOLD', operation_name: 'Ép lưu hóa (Molding)', work_center: 'WC-MOLD', status: 'PENDING' },
                { sequence: 50, operation_code: 'OP-QC', operation_name: 'Kiểm tra chất lượng (QC)', work_center: 'WC-QC', status: 'PENDING' },
              ]).map((op: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-800/40 font-mono text-xs">
                  <td className="px-5 py-3 font-bold text-slate-400">{op.sequence || (idx + 1) * 10}</td>
                  <td className="px-5 py-3 font-bold text-indigo-400">{op.operation_code}</td>
                  <td className="px-5 py-3 text-slate-200">{op.operation_name}</td>
                  <td className="px-5 py-3 text-amber-300">{op.work_center || 'WC-DEFAULT'}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded">
                      {op.status || 'READY'}
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
          <form onSubmit={handleReject} className="bg-slate-900 border border-rose-900/50 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400">
              <XCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Xác Nhận Từ Chối Lệnh Sản Xuất</h3>
            </div>
            <p className="text-xs text-slate-300">
              Vui lòng nhập lý do từ chối vào nhật ký phê duyệt (wo_approval_log.comment):
            </p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="VD: Không đủ năng lực trạm ép trong tuần..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-rose-500"
              required
            />
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submittingAction}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold"
              >
                Xác Nhận Từ Chối
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
