import { cn } from '@/lib/utils'
import { translatePermission } from '@/lib/utils'

export interface PermissionBadgeProps {
  permission: string
  className?: string
}

export function PermissionBadge({ permission, className }: PermissionBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-brand-light',
        className
      )}
    >
      {translatePermission(permission)}
    </span>
  )
}
