import React from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'outline';

const variants: Record<BadgeVariant, string> = {
  default: 'border-primary/20 bg-primary/10 text-primary',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-amber-700',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-info/30 bg-info/10 text-info',
  neutral: 'border-slate-300 bg-slate-100 text-slate-600',
  outline: 'border-border bg-transparent text-muted-foreground',
};

export function Badge({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold', variants[variant], className)} {...props} />;
}
