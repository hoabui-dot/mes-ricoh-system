import { Link, useLocation } from 'react-router-dom';
import { Home, SearchX } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Card } from '../components/ui';

export function NotFoundPage() {
  const { t } = useI18n();
  const location = useLocation();
  return (
    <div className="flex min-h-[560px] items-center justify-center">
      <Card className="w-full max-w-xl p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-action/30 bg-action/10 text-action">
          <SearchX className="h-7 w-7" />
        </div>
        <div className="text-sm font-bold uppercase text-action">404</div>
        <h1 className="mt-2 text-2xl font-black">{t('notFound.title')}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t('notFound.body')}</p>
        <div className="mt-5 rounded-md border bg-secondary px-4 py-3 font-mono text-xs text-muted-foreground">{location.pathname}</div>
        <Button asChild className="mt-6">
          <Link to="/dashboard"><Home className="h-4 w-4" />{t('nav.dashboard')}</Link>
        </Button>
      </Card>
    </div>
  );
}
