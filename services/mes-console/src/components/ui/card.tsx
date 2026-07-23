import React from 'react';
import { cn } from '../../lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-md border border-border bg-card text-card-foreground shadow-[0_18px_45px_rgba(2,6,23,0.22)]', className)}
      {...props}
    />
  ),
);

Card.displayName = 'Card';
