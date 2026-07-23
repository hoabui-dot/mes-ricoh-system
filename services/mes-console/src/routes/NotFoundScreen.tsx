import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, SearchX } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Card } from '../components/ui';

export const NotFoundScreen: React.FC = () => {
  const location = useLocation();
  const { t } = useI18n();

  return (
    <div className="min-h-[520px] flex items-center justify-center p-6">
      <Card className="w-full max-w-xl p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-action/30 bg-action/10 text-action">
          <SearchX className="h-7 w-7" />
        </div>
        <div className="text-sm font-semibold uppercase tracking-widest text-amber-300">404</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-50">{t('notFound.title')}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">{t('notFound.body')}</p>
        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-xs text-slate-400">
          {location.pathname}
        </div>
        <div className="mt-6 flex justify-center">
          <Link
            to="/work-orders"
          className="inline-flex items-center gap-2 rounded-md border border-action bg-action px-4 py-2.5 text-sm font-semibold text-action-foreground transition hover:bg-action-hover"
          >
            <Home className="h-4 w-4" />
            {t('notFound.backHome')}
          </Link>
        </div>
      </Card>
    </div>
  );
};
