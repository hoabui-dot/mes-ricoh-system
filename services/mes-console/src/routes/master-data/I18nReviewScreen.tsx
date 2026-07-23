import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Languages, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { useAuth } from '../../context/AuthContext';
import { authHeaders, masterDataBaseUrl } from '../../lib/masterDataApi';
import { Button, Card } from '../../components/ui';

interface I18nFlag {
  flag_id: string;
  table_name: string;
  column_name: string;
  row_id: string;
  flagged_locale: string;
  current_value: string;
  detected_language_guess?: string;
  confidence?: string;
}

const editRouteByTable: Record<string, string> = {
  md_item: '/master-data/items',
  md_work_center: '/master-data/work-centers',
  md_equipment: '/master-data/equipment',
  md_skill: '/master-data/skills',
  md_reason_code: '/master-data/reason-codes',
  md_shift: '/shifts',
  md_operation: '/master-data/routings',
  md_work_instruction: '/master-data/production-standards',
};

export const I18nReviewScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [flags, setFlags] = useState<I18nFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${masterDataBaseUrl()}/i18n-quality-flags?status=OPEN`, { headers: authHeaders(user) });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.message || json.error || 'Cannot load i18n flags');
      setFlags(json.data || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    return flags.reduce<Record<string, I18nFlag[]>>((acc, flag) => {
      acc[flag.table_name] = [...(acc[flag.table_name] || []), flag];
      return acc;
    }, {});
  }, [flags]);

  const updateStatus = async (flagId: string, status: 'RESOLVED' | 'DISMISSED') => {
    const resp = await fetch(`${masterDataBaseUrl()}/i18n-quality-flags/${flagId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      toast.error(json.message || json.error || 'Cannot update i18n flag');
      return;
    }
    setFlags((current) => current.filter((flag) => flag.flag_id !== flagId));
  };

  return (
    <div className="mes-page">
      <div className="mes-page-header">
        <div className="flex items-center gap-3">
          <div className="mes-icon-tile"><Languages className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('i18nReview.title')}</h1>
            <p className="text-xs text-slate-400">{t('i18nReview.subtitle')}</p>
          </div>
        </div>
        <Button onClick={load} variant="secondary" size="icon">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {flags.length === 0 && (
        <Card className="p-8 text-center text-slate-400">{t('i18nReview.empty')}</Card>
      )}

      {Object.entries(grouped).map(([tableName, rows]) => (
        <Card key={tableName} className="overflow-hidden">
          <div className="border-b border-border bg-slate-950/70 px-5 py-3 font-mono text-sm font-bold text-amber-200">
            {tableName}
          </div>
          <div className="divide-y divide-border/70">
            {rows.map((flag) => (
              <div key={flag.flag_id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_170px_340px] lg:items-center">
                <div>
                  <div className="text-xs uppercase text-slate-500">{flag.column_name} / {flag.flagged_locale}</div>
                  <div className="mt-1 text-sm text-slate-100">{flag.current_value}</div>
                </div>
                <div className="text-xs text-slate-400">
                  {t('i18nReview.detected')}: <span className="font-mono text-amber-200">{flag.detected_language_guess || '-'}</span>
                </div>
                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                  <Link
                    className="inline-flex h-8 items-center rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
                    to={`${editRouteByTable[flag.table_name] || '/master-data/items'}?i18nFlag=${flag.flag_id}&rowId=${flag.row_id}&field=${flag.column_name}`}
                  >
                    {t('i18nReview.openEditor')}
                  </Link>
                  <Button size="sm" onClick={() => updateStatus(flag.flag_id, 'RESOLVED')}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t('i18nReview.markResolved')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => updateStatus(flag.flag_id, 'DISMISSED')}>
                    <XCircle className="h-3.5 w-3.5" />
                    {t('i18nReview.dismiss')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
};
