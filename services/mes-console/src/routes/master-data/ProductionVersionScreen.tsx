import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { Cpu, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export const ProductionVersionScreen: React.FC = () => {
  const { user } = useAuth();
  const [pvList, setPvList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchPVs = async () => {
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/master-data/production-versions`, {
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error('Không thể tải danh sách Production Version');
      }
      const data = await resp.json();
      setPvList(data.data || []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPVs();
  }, []);

  const handleReleasePV = async (pvId: string) => {
    setSubmitting(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/master-data/production-versions/${pvId}/release`, {
        method: 'POST',
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || 'Release Production Version thất bại');
      }
      toast.success('Đã Release Production Version thành công qua Validation Engine!');
      await fetchPVs();
    } catch (err: any) {
      toast.error(`Lỗi Release Production Version: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchPVs} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-600/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Quản Lý Production Version (Phiên Bản Sản Xuất)</h1>
            <p className="text-xs text-slate-400">Master Data Tier 1 — Khóa kết nối 3 thành phần: ItemRevision + MBOM + Routing</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={fetchPVs} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">Mã PV</th>
              <th className="px-6 py-4">Mã Sản Phẩm</th>
              <th className="px-6 py-4">Liên Kết MBOM</th>
              <th className="px-6 py-4">Liên Kết Routing</th>
              <th className="px-6 py-4">Trạng Thái Release</th>
              <th className="px-6 py-4 text-right">Thao Tác Validation Engine</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {pvList.map((pv) => (
              <tr key={pv.production_version_id || pv.id} className="hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono font-bold text-emerald-400">{pv.version_code || pv.production_version_id?.slice(0, 8)}</td>
                <td className="px-6 py-4 text-slate-100 font-medium">{pv.item_code}</td>
                <td className="px-6 py-4 font-mono text-xs text-sky-300">{pv.mbom_id?.slice(0, 8) || 'MBOM-STD'}</td>
                <td className="px-6 py-4 font-mono text-xs text-amber-300">{pv.routing_id?.slice(0, 8) || 'ROUTING-STD'}</td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    pv.status === 'RELEASED'
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                      : 'bg-amber-950/60 border border-amber-800 text-amber-300'
                  }`}>
                    {pv.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {pv.status !== 'RELEASED' && (
                    <button
                      onClick={() => handleReleasePV(pv.production_version_id || pv.id)}
                      disabled={submitting}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
                    >
                      Release PV
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
