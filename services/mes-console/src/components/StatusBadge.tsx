import React from 'react';
import { Badge, type BadgeProps, type BadgeVariant } from './ui';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { translatedEnum } from '../lib/i18nLabels';

type StatusBadgeProps = Omit<BadgeProps, 'variant'> & {
  status?: string | null;
  kind?: 'resource' | 'lifecycle' | 'workOrder' | 'lineSelection' | 'readiness' | 'active';
  variant?: BadgeVariant;
};

function toneForStatus(status?: string | null): BadgeVariant {
  const normalized = (status || '').toLowerCase().replace(/[\s_-]/g, '');
  if (['completed', 'approved', 'released', 'active', 'pass', 'passed', 'confirmed', 'inprogress'].includes(normalized)) return normalized === 'inprogress' ? 'info' : 'success';
  if (['pending', 'inreview', 'draft', 'onleave', 'quarantined'].includes(normalized)) return normalized === 'draft' ? 'neutral' : 'warning';
  if (['rejected', 'cancelled', 'canceled', 'blocked', 'fail', 'failed', 'inactive', 'obsolete', 'expired'].includes(normalized)) return 'danger';
  return 'neutral';
}

function prefixForKind(kind: NonNullable<StatusBadgeProps['kind']>) {
  if (kind === 'workOrder') return 'status.wo';
  if (kind === 'readiness') return 'resourceReadiness.status';
  if (kind === 'lineSelection') return 'woDetail.lineSelectionStatus';
  if (kind === 'lifecycle') return 'status.master';
  if (kind === 'active') return 'status.resource';
  return 'status.resource';
}

export function StatusBadge({ status, kind = 'resource', variant, ...props }: StatusBadgeProps) {
  const { t } = useI18n();
  const label = translatedEnum(t, prefixForKind(kind), status || 'Unknown');
  return <Badge variant={variant || toneForStatus(status)} {...props}>{label}</Badge>;
}
