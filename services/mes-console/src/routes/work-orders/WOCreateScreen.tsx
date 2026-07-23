import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PlusCircle, AlertTriangle, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';

export const WOCreateScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [itemCode, setItemCode] = useState('FG-WS-CM01');
  const [quantity, setQuantity] = useState<number>(500);
  const [targetDate, setTargetDate] = useState<string>('2026-08-01');
  const [submitting, setSubmitting] = useState(false);
  const [missingPrereqs, setMissingPrereqs] = useState<string[] | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMissingPrereqs(null);

    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/execution/work-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': user?.userId || 'admin',
          'X-Role-Code': user?.roles[0] || 'PLANT_MANAGER',
        },
        body: JSON.stringify({
          item_code: itemCode,
          quantity: Number(quantity),
          target_date: targetDate,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        // If CheckMasterDataReadiness returned missing prerequisites list
        if (data.missing_prerequisites && Array.isArray(data.missing_prerequisites)) {
          setMissingPrereqs(data.missing_prerequisites);
          toast.error(t('woCreate.readinessFailed'));
          return;
        }
        throw new Error(data.message || data.error || t('woCreate.createFailed'));
      }

      toast.success(t('woCreate.created', { code: data.wo_code || '' }));
      navigate(`/work-orders/${data.wo_id || data.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/work-orders')}
          className="px-3.5 py-2 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-md text-sm font-semibold flex items-center space-x-2 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('woCreate.backToList')}</span>
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-6 shadow-2xl space-y-6">
        <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
          <div className="p-3 bg-action/10 border border-action/20 rounded-md text-action">
            <PlusCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('woCreate.title')}</h1>
            <p className="text-xs text-slate-400">{t('woCreate.subtitle')}</p>
          </div>
        </div>

        {/* Missing Prerequisites Warning Box */}
        {missingPrereqs && missingPrereqs.length > 0 && (
          <div className="bg-rose-950/40 border border-rose-800 rounded-md p-5 space-y-3">
            <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>{t('woCreate.missingTitle', { count: missingPrereqs.length })}</span>
            </div>
            <ul className="space-y-1.5 pl-6 list-disc text-xs text-rose-200 font-mono">
              {missingPrereqs.map((prereq, idx) => (
                <li key={idx}>{prereq}</li>
              ))}
            </ul>
            <p className="text-[11px] text-rose-300/80 pt-1">
              {t('woCreate.missingHint')}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">{t('woCreate.itemCode')} *</label>
            <input
              type="text"
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              placeholder={t('items.codePlaceholder')}
              className="w-full bg-slate-950 border border-slate-800 rounded-md p-3.5 font-mono text-sm text-slate-100 focus:outline-none focus:border-action"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">{t('woCreate.quantity')} *</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                min={1}
                className="w-full bg-slate-950 border border-slate-800 rounded-md p-3.5 font-mono text-sm text-slate-100 focus:outline-none focus:border-action"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">{t('woCreate.targetDate')} *</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md p-3.5 font-mono text-sm text-slate-100 focus:outline-none focus:border-action"
                required
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3.5 bg-action hover:bg-action-hover text-white font-bold text-sm rounded-md flex items-center space-x-2 shadow-lg shadow-orange-600/20 transition disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              <span>{t('woCreate.submit')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
