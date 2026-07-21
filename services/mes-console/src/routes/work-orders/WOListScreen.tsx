import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { ClipboardList, PlusCircle, RefreshCw, Eye } from 'lucide-react';

export const WOListScreen: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchWorkOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/execution/work-orders?limit=50`, {
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER' },
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error('Không thể tải danh sách Lệnh sản xuất');
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

  const filteredWOs = workOrders.filter((wo) => {
    if (statusFilter === 'ALL') return true;
    return wo.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-emerald-950/80 border-emerald-800 text-emerald-300';
      case 'Approved':
        return 'bg-indigo-950/80 border-indigo-800 text-indigo-300';
      case 'InProgress':
        return 'bg-amber-950/80 border-amber-800 text-amber-300';
      case 'Rejected':
        return 'bg-rose-950/80 border-rose-800 text-rose-300';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchWorkOrders} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-600/10 border border-indigo-500/20 rounded-xl text-indigo-400">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Danh Sách Lệnh Sản Xuất (Work Orders)</h1>
            <p className="text-xs text-slate-400">Điều hành Kế hoạch Lập Lệnh — Lập lịch, Duyệt Lệnh & Theo dõi Tiến độ sản xuất</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={fetchWorkOrders} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => navigate('/work-orders/new')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 transition shadow-lg shadow-emerald-600/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Lập Lệnh Sản Xuất Mới</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-3 rounded-xl overflow-x-auto">
        <span className="text-xs font-bold text-slate-400 uppercase px-2">Lọc trạng thái:</span>
        {['ALL', 'Draft', 'Approved', 'InProgress', 'Completed', 'Rejected'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === st
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            {st === 'ALL' ? 'Tất cả trạng thái' : st}
          </button>
        ))}
      </div>

      {/* WO Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">Mã WO</th>
              <th className="px-6 py-4">Sản Phẩm</th>
              <th className="px-6 py-4">Sản Lượng Yêu Cầu</th>
              <th className="px-6 py-4">Ngày Hoàn Thành Mục Tiêu</th>
              <th className="px-6 py-4">Trạng Thái (WO Status)</th>
              <th className="px-6 py-4 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredWOs.map((wo) => (
              <tr key={wo.wo_id} className="hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono font-bold text-indigo-400">{wo.wo_code}</td>
                <td className="px-6 py-4 font-medium text-slate-100">{wo.item_code}</td>
                <td className="px-6 py-4 font-mono font-semibold text-slate-200">{wo.quantity} {wo.uom || 'Cái'}</td>
                <td className="px-6 py-4 text-xs font-mono text-slate-400">
                  {wo.target_completion_date ? new Date(wo.target_completion_date).toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 border rounded-full text-xs font-bold ${getStatusBadge(wo.status)}`}>
                    {wo.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => navigate(`/work-orders/${wo.wo_id}`)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-500 text-slate-200 hover:text-white rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ml-auto"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Xem Chi Tiết & Duyệt</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
