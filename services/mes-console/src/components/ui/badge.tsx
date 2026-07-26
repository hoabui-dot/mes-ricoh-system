import React from 'react';
import { cn } from '../../lib/utils';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'secondary';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-primary/40 bg-primary/15 text-primary-foreground',
  success: 'border-success/40 bg-success/15 text-success-foreground',
  warning: 'border-warning/50 bg-warning/15 text-warning-foreground',
  danger: 'border-danger/45 bg-danger/15 text-danger-foreground',
  info: 'border-info/40 bg-info/15 text-info-foreground',
  neutral: 'border-border bg-secondary text-secondary-foreground',
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
