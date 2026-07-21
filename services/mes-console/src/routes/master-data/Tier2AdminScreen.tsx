import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { Factory, Wrench, Gauge, AlertTriangle, Award, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Tier2AdminProps {
  entityType: 'work-centers' | 'equipment' | 'production-standards' | 'reason-codes' | 'skills';
  title: string;
  subtitle: string;
  icon: any;
}

export const Tier2AdminScreen: React.FC<Tier2AdminProps> = ({ entityType, title, subtitle, icon: Icon }) => {
  const { user } = useAuth();
  const [dataList, setDataList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/master-data/${entityType}`, {
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error(`Không thể tải dữ liệu ${title}`);
      }
      const data = await resp.json();
      setDataList(data.data || []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [entityType]);

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-purple-600/10 border border-purple-500/20 rounded-xl text-purple-400">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{title}</h1>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={fetchData} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">Mã Đối Tượng</th>
              <th className="px-6 py-4">Tên / Mô Tả</th>
              <th className="px-6 py-4">Ghi Chú Chi Tiết</th>
              <th className="px-6 py-4">Trạng Thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {dataList.map((item, idx) => (
              <tr key={item.id || item.code || idx} className="hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono font-bold text-purple-400">
                  {item.code || item.work_center_code || item.equipment_code || item.reason_code || `ITEM-${idx + 1}`}
                </td>
                <td className="px-6 py-4 text-slate-100 font-medium">
                  {item.name || item.work_center_name || item.equipment_name || item.reason_name || 'Đã cấu hình'}
                </td>
                <td className="px-6 py-4 text-xs font-mono text-slate-400">
                  {item.description || item.site_id || 'Trực thuộc xưởng sản xuất Won Seal Tech'}
                </td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-full text-xs font-semibold">
                    ACTIVE
                  </span>
                </td>
              </tr>
            ))}
            {dataList.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  Chưa có dữ liệu cho {title}. Dữ liệu mặc định đang được seed từ database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
