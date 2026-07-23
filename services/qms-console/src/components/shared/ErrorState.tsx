import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { ApiError } from '../../lib/api/client';
import { Button, Card } from '../ui';

export function isUnavailable(error: unknown) {
  return error instanceof ApiError && error.status === 503;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n();
  const unavailable = isUnavailable(error);
  const message = error instanceof Error ? error.message : String(error);
  return (
    <Card className={unavailable ? 'border-destructive bg-destructive/5 p-5' : 'p-5'}>
      <div className="flex items-start gap-4">
        <div className={unavailable ? 'rounded-md bg-destructive/10 p-2 text-destructive' : 'rounded-md bg-warning/10 p-2 text-warning'}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{unavailable ? t('common.unavailableTitle') : t('common.validationError')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{unavailable ? t('common.unavailableBody') : message}</p>
          <Button className="mt-4" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            {t('common.retry')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
