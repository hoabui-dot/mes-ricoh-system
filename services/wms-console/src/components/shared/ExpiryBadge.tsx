import { useI18n } from '@mom-platform/i18n-ui-shared';
import { daysUntil } from '../../lib/utils';
import { Badge } from '../ui';

export function ExpiryBadge({ expiryDate }: { expiryDate?: string | null }) {
  const { t, formatDate } = useI18n();
  const days = daysUntil(expiryDate);
  if (!expiryDate || days === null) return <Badge variant="outline">-</Badge>;
  if (days < 0) return <Badge variant="danger">{t('inventory.expired')} · {formatDate(expiryDate)}</Badge>;
  if (days <= 7) return <Badge variant="warning">{t('inventory.nearExpiry')} · {formatDate(expiryDate)}</Badge>;
  return <Badge variant="success">{t('inventory.healthy')} · {formatDate(expiryDate)}</Badge>;
}
