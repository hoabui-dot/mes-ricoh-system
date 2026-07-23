import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundaryCard } from '../../components/ErrorBoundaryCard';
import { Factory, Wrench, Gauge, AlertTriangle, Award, RefreshCw, Plus } from 'lucide-react';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';

interface Tier2AdminProps {
  entityType: 'work-centers' | 'equipment' | 'production-standards' | 'reason-codes' | 'skills';
  title: string;
  subtitle: string;
  icon: any;
}

export const Tier2AdminScreen: React.FC<Tier2AdminProps> = ({ entityType, title, subtitle, icon: Icon }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const text = useLocalizedText();
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
        throw new Error(t('tier2.loadFailed', { title }));
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
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-md">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-action/10 border border-action/20 rounded-md text-action">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{title}</h1>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={fetchData} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-xs font-bold text-slate-400 uppercase border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">{t('tier2.objectCode')}</th>
              <th className="px-6 py-4">{t('tier2.nameDescription')}</th>
              <th className="px-6 py-4">{t('tier2.notes')}</th>
              <th className="px-6 py-4">{t('common.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {dataList.map((item, idx) => (
              <tr key={item.id || item.code || idx} className="hover:bg-slate-800/40 transition">
                <td className="px-6 py-4 font-mono font-bold text-action">
                  {item.code || item.work_center_code || item.equipment_code || item.reason_code || `ITEM-${idx + 1}`}
                </td>
                <td className="px-6 py-4 text-slate-100 font-medium">
                  {text(item.name) || item.work_center_name || item.equipment_name || item.reason_name || t('tier2.configured')}
                </td>
                <td className="px-6 py-4 text-xs font-mono text-slate-400">
                  {item.description || item.site_id || t('tier2.defaultNote')}
                </td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-emerald-950/60 border border-emerald-800 text-amber-200 rounded-full text-xs font-semibold">
                    {t('common.active')}
                  </span>
                </td>
              </tr>
            ))}
            {dataList.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  {t('tier2.empty', { title })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
