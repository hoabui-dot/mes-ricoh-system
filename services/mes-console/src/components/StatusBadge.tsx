import React from 'react';
import { Badge, type BadgeProps, type BadgeVariant } from './ui';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../lib/i18nLabels';

type StatusBadgeProps = Omit<BadgeProps, 'variant'> & {
  status?: string | null;
  variant?: BadgeVariant;
};

function toneForStatus(status?: string | null): BadgeVariant {
  const normalized = (status || '').toLowerCase().replace(/[\s_-]/g, '');
  if (['completed', 'approved', 'released', 'active', 'pass', 'passed', 'confirmed', 'inprogress'].includes(normalized)) return normalized === 'inprogress' ? 'info' : 'success';
  if (['pending', 'inreview', 'draft', 'onleave', 'quarantined'].includes(normalized)) return normalized === 'draft' ? 'neutral' : 'warning';
  if (['rejected', 'cancelled', 'canceled', 'blocked', 'fail', 'failed', 'inactive', 'obsolete', 'expired'].includes(normalized)) return 'danger';
  return 'neutral';
}

export function StatusBadge({ status, variant, ...props }: StatusBadgeProps) {
  const { t } = useI18n();
  const label = translatedEnum(t, 'status.resource', status || 'Unknown');
  return <Badge variant={variant || toneForStatus(status)} {...props}>{label}</Badge>;
}
