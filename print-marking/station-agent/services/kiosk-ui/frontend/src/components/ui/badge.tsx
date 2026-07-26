import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  // Larger padding, consistent height, border always present for accessibility
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold border transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default:      'bg-brand text-white border-brand',
        secondary:    'bg-surface-2 text-muted-fg border-border',
        destructive:  'bg-error/10 text-error border-error/25',
        success:      'bg-success/10 text-success border-success/25',
        warning:      'bg-warning/10 text-warning border-warning/25',
        outline:      'bg-transparent border-border-strong text-foreground',
        info:         'bg-info/10 text-info border-info/25',
        admin:        'bg-brand text-white border-brand-dark',
        member:       'bg-surface-2 text-foreground border-border',
        // Connection status — works in both light and dark
        connected:    'bg-success/10 text-success border-success/25',
        disconnected: 'bg-error/10 text-error border-error/25',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
