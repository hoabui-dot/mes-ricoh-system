import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { Package, Plus, CheckCircle2, AlertOctagon, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Card, Input, Select } from '../../components/ui';
import { translatedEnum } from '../../lib/i18nLabels';

const ITEM_TYPES = ['FG', 'SFG', 'RM'] as const;

export const ItemsScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
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
        throw new Error(t('items.loadFailed'));
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
      toast.error(t('items.required'));
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
        throw new Error(errJson.message || errJson.error || t('items.createFailed'));
      }
      toast.success(t('items.created', { code: itemCode }));
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
        throw new Error(errJson.message || errJson.error || t('items.releaseFailed'));
      }
      toast.success(t('items.releasedRevision'));
      await fetchItems();
    } catch (err: any) {
      toast.error(t('items.releaseError', { message: err.message }));
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <ErrorBoundaryCard error={error} onRetry={fetchItems} />;

  return (
    <div className="mes-page">
      <div className="mes-page-header">
        <div className="flex items-center space-x-3">
          <div className="mes-icon-tile">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('items.title')}</h1>
            <p className="text-xs text-slate-400">{t('items.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button onClick={fetchItems} variant="secondary" size="icon">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="w-4 h-4" />
            <span>{t('items.create')}</span>
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="mes-table-wrap">
        <table className="mes-table">
          <thead>
            <tr>
              <th className="px-6 py-4">{t('items.itemCode')}</th>
              <th className="px-6 py-4">{t('items.itemName')}</th>
              <th className="px-6 py-4">{t('items.itemType')}</th>
              <th className="px-6 py-4">{t('items.uom')}</th>
              <th className="px-6 py-4">{t('items.releaseStatus')}</th>
              <th className="px-6 py-4 text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {items.map((item) => (
              <tr key={item.item_id} className="hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono font-bold text-amber-300">{item.item_code}</td>
                <td className="px-6 py-4 text-slate-100 font-medium">{item.item_name}</td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-slate-300">
                    {translatedEnum(t, 'item.type', item.item_type)}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-400">{item.uom || t('uom.pcs')}</td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-emerald-950/60 border border-emerald-800 text-amber-200 rounded-full text-xs font-semibold flex items-center space-x-1 w-fit">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t('common.active')}</span>
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Button
                    onClick={() => handleReleaseRevision(item.item_id, item.active_revision_id || 'rev-01')}
                    disabled={submitting}
                    variant="secondary"
                    size="sm"
                  >
                    {t('items.releaseRevision')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <Card className="max-w-md w-full">
          <form onSubmit={handleCreateItem} className="p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-100">{t('items.create')}</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">{t('items.itemCode')} *</label>
              <Input
                type="text"
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value)}
                placeholder={t('items.codePlaceholder')}
                className="font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">{t('items.itemName')} *</label>
              <Input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={t('items.namePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">{t('items.itemType')}</label>
              <Select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
              >
                {ITEM_TYPES.map((type) => <option key={type} value={type}>{translatedEnum(t, 'item.type', type)}</option>)}
              </Select>
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <Button
                type="button"
                onClick={() => setShowCreateModal(false)}
                variant="secondary"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={submitting}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{t('common.save')}</span>
              </Button>
            </div>
          </form>
          </Card>
        </div>
      )}
    </div>
  );
};
