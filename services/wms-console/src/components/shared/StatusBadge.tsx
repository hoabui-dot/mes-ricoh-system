import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Badge } from '../ui';

export function StatusBadge({ status }: { status?: string | null }) {
  const { t } = useI18n();
  const value = status ?? 'Inactive';
  const variant = value === 'Active' || value === 'Confirmed' || value === 'Staged' ? 'success' : value === 'Shortage' ? 'danger' : value === 'Draft' ? 'neutral' : 'outline';
  return <Badge variant={variant}>{t(`status.${value}`)}</Badge>;
}

export function PurposeBadge({ purpose }: { purpose?: string | null }) {
  const { t } = useI18n();
  return <Badge variant={purpose === 'WorkCenterStaging' ? 'info' : 'neutral'}>{t(`purpose.${purpose ?? 'Storage'}`)}</Badge>;
}
