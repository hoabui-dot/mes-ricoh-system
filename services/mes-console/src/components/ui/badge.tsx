import React from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'secondary';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-primary/40 bg-primary/15 text-primary-foreground',
  success: 'border-emerald-700 bg-emerald-950/70 text-emerald-200',
  warning: 'border-action/50 bg-action/15 text-amber-100',
  danger: 'border-destructive/60 bg-destructive/15 text-rose-100',
  secondary: 'border-border bg-secondary text-secondary-foreground',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge: React.FC<BadgeProps> = ({ className, variant = 'default', ...props }) => (
  <span
    className={cn(
      'inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
      variantClasses[variant],
      className,
    )}
    {...props}
  />
);
