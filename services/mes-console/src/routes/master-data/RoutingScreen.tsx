import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { GitCommit, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export const RoutingScreen: React.FC = () => {
  const { user } = useAuth();
  const [routings, setRoutings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchRoutings = async () => {
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/master-data/routings`, {
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error('Không thể tải danh sách Routing');
      }
      const data = await resp.json();
      setRoutings(data.data || []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutings();
  }, []);

  const handleReleaseRouting = async (routingId: string) => {
    setSubmitting(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/master-data/routings/${routingId}/release`, {
        method: 'POST',
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || 'Release Routing thất bại');
      }
      toast.success('Đã Release Routing thành công qua Validation Engine!');
      await fetchRoutings();
    } catch (err: any) {
      toast.error(`Lỗi Release Routing: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchRoutings} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-600/10 border border-amber-500/20 rounded-xl text-amber-400">
            <GitCommit className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Quản Lý Routing (Quy Trình Công Đoạn)</h1>
            <p className="text-xs text-slate-400">Master Data Tier 1 — Chuỗi công đoạn thi công sản xuất (MIX → PREP → CUT → MOLD → TRIM → QC)</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={fetchRoutings} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">Mã Routing</th>
              <th className="px-6 py-4">Sản Phẩm</th>
              <th className="px-6 py-4">Chuỗi Công Đoạn (Sequence)</th>
              <th className="px-6 py-4">Trạng Thái</th>
              <th className="px-6 py-4 text-right">Thao Tác Validation Engine</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {routings.map((rt) => (
              <tr key={rt.routing_id} className="hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono font-bold text-amber-400">{rt.routing_code || rt.routing_id.slice(0, 8)}</td>
                <td className="px-6 py-4 text-slate-100 font-medium">{rt.item_code}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-1">
                    <span className="px-2 py-0.5 bg-slate-800 text-xs font-mono rounded">OP-MIX</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 bg-slate-800 text-xs font-mono rounded">OP-PREP</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 bg-slate-800 text-xs font-mono rounded">OP-CUT</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 bg-slate-800 text-xs font-mono rounded">OP-MOLD</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 bg-slate-800 text-xs font-mono rounded">OP-QC</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    rt.status === 'RELEASED'
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                      : 'bg-amber-950/60 border border-amber-800 text-amber-300'
                  }`}>
                    {rt.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {rt.status !== 'RELEASED' && (
                    <button
                      onClick={() => handleReleaseRouting(rt.routing_id)}
                      disabled={submitting}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
                    >
                      Release Routing
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
