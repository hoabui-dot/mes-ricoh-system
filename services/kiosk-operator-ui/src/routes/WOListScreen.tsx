import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useKioskSocket } from '../context/KioskSocketContext';
import { cacheWorkOrders, getCachedWorkOrders } from '../lib/db';
import { ErrorBoundaryCard } from '../components/ErrorBoundaryCard';
import { ClipboardList, Play, CheckCircle2, RefreshCw, LogOut, Package } from 'lucide-react';
import { toast } from 'sonner';

export const WOListScreen: React.FC = () => {
  const { terminalId = 'KIOSK-MOLD-01' } = useParams();
  const navigate = useNavigate();
  const { lastEvent, disconnectSocket } = useKioskSocket();

  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const fetchWorkOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/execution/work-orders?limit=50`);
      if (!resp.ok) {
        throw { status: resp.status, message: 'Không thể tải danh sách lệnh sản xuất' };
      }
      const data = await resp.json();
      const list = data.data || [];
      setWorkOrders(list);
      await cacheWorkOrders(list);
    } catch (err: any) {
      console.warn('[WOList] Server fetch failed, falling back to IndexedDB:', err);
      const cached = await getCachedWorkOrders();
      if (cached.length > 0) {
        setWorkOrders(cached);
        toast.info('Đang hiển thị danh sách Lệnh sản xuất ngoại tuyến từ bộ nhớ đệm');
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  useEffect(() => {
    if (lastEvent) {
      toast.info(`Thông báo shopfloor: ${lastEvent.event_type || lastEvent.type}`);
      fetchWorkOrders();
    }
  }, [lastEvent]);

  const handleLogout = () => {
    disconnectSocket();
    localStorage.removeItem('kiosk_access_token');
    navigate(`/kiosk/${terminalId}/login`);
  };

  if (error) {
    return <ErrorBoundaryCard error={error} onRetry={fetchWorkOrders} />;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-indigo-600/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Danh Sách Lệnh Sản Xuất</h1>
            <p className="text-xs text-slate-400">Trạm Kiosk: <span className="font-mono text-slate-300">{terminalId}</span></p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchWorkOrders}
            className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition"
            title="Làm mới"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-3 bg-rose-950/60 border border-rose-800 hover:bg-rose-900/80 rounded-xl text-rose-300 text-sm font-semibold flex items-center space-x-2 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất ca</span>
          </button>
        </div>
      </div>

      {loading && workOrders.length === 0 ? (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
            <p className="text-sm text-slate-400">Đang tải danh sách Lệnh sản xuất...</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workOrders.map((wo) => (
            <div
              key={wo.wo_id}
              className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 space-y-4 shadow-lg transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Package className="w-5 h-5 text-indigo-400" />
                  <span className="font-mono font-bold text-lg text-slate-100">{wo.wo_code}</span>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    wo.status === 'Completed'
                      ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                      : wo.status === 'InProgress'
                      ? 'bg-amber-950 border border-amber-800 text-amber-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {wo.status}
                </span>
              </div>

              <div className="space-y-1 text-sm text-slate-300">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Mã Thành Phẩm:</span>
                  <span className="font-mono text-slate-200">{wo.item_code}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Sản Lượng Yêu Cầu:</span>
                  <span className="font-mono text-slate-200">{wo.quantity} {wo.uom || 'Cái'}</span>
                </div>
              </div>

              <button
                onClick={() => navigate(`/kiosk/${terminalId}/wo/${wo.wo_id}`)}
                className="w-full bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 text-indigo-200 hover:text-white font-semibold py-2.5 px-4 rounded-xl transition flex items-center justify-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>Mở Công Đoạn Thi Công</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
