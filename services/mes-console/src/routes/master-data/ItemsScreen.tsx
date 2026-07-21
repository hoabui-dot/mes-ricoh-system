import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { Package, Plus, CheckCircle2, AlertOctagon, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export const ItemsScreen: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState('FG');
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/master-data/items`, {
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
      });
      if (!resp.ok) {
        if (resp.status === 503) throw { status: 503, message: 'Circuit breaker open' };
        throw new Error('Không thể tải danh sách sản phẩm');
      }
      const data = await resp.json();
      setItems(data.data || []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemCode || !itemName) {
      toast.error('Vui lòng nhập Mã và Tên sản phẩm');
      return;
    }
    setSubmitting(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/master-data/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': user?.userId || 'admin',
          'X-Role-Code': user?.roles[0] || 'PROD_MANAGER',
        },
        body: JSON.stringify({ item_code: itemCode, item_name: itemName, item_type: itemType, uom: 'Cái' }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || 'Tạo sản phẩm thất bại');
      }
      toast.success(`Đã tạo sản phẩm ${itemCode}`);
      setShowCreateModal(false);
      setItemCode('');
      setItemName('');
      await fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReleaseRevision = async (itemId: string, revId: string) => {
    setSubmitting(true);
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/master-data/items/${itemId}/revisions/${revId}/release`, {
        method: 'POST',
        headers: { 'X-User-ID': user?.userId || 'admin', 'X-Role-Code': user?.roles[0] || 'PROD_MANAGER' },
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || 'Release revision thất bại');
      }
      toast.success('Đã Release ItemRevision thành công!');
      await fetchItems();
    } catch (err: any) {
      toast.error(`Lỗi Release: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchItems} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-600/10 border border-indigo-500/20 rounded-xl text-indigo-400">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Quản Lý Sản Phẩm (Item & Revision)</h1>
            <p className="text-xs text-slate-400">Master Data Tier 1 — Danh mục Thành phẩm, Bán thành phẩm, Nguyên liệu</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={fetchItems} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 transition shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Sản Phẩm Mới</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">Mã Sản Phẩm</th>
              <th className="px-6 py-4">Tên Sản Phẩm</th>
              <th className="px-6 py-4">Loại (Type)</th>
              <th className="px-6 py-4">Đơn Vị Tính</th>
              <th className="px-6 py-4">Trạng Thái Release</th>
              <th className="px-6 py-4 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {items.map((item) => (
              <tr key={item.item_id} className="hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono font-bold text-indigo-400">{item.item_code}</td>
                <td className="px-6 py-4 text-slate-100 font-medium">{item.item_name}</td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-slate-300">
                    {item.item_type}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-400">{item.uom || 'Cái'}</td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-full text-xs font-semibold flex items-center space-x-1 w-fit">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Active</span>
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleReleaseRevision(item.item_id, item.active_revision_id || 'rev-01')}
                    disabled={submitting}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-emerald-600 border border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-white rounded-lg text-xs font-semibold transition"
                  >
                    Release Revision
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <form onSubmit={handleCreateItem} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Thêm Sản Phẩm Mới</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Mã Sản Phẩm (Item Code) *</label>
              <input
                type="text"
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value)}
                placeholder="VD: FG-WS-CM01"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Tên Sản Phẩm *</label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="VD: Won Seal Rubber Gasket CM01"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Loại Sản Phẩm</label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100"
              >
                <option value="FG">FG (Thành Phẩm)</option>
                <option value="WIP">WIP (Bán Thành Phẩm)</option>
                <option value="RAW">RAW (Nguyên Vật Tư)</option>
              </select>
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Lưu Sản Phẩm</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
