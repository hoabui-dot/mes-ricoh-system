import { cn } from '@/lib/utils'
import { translateJobStatus, getStatusColor } from '@/lib/utils'

export interface StatusBadgeProps {
  status: string
  jobType?: string
  className?: string
}

/**
 * Renders a coloured pill badge for job statuses.
 * Redesigned to work in both light and dark modes.
 */
export function StatusBadge({ status, jobType, className }: StatusBadgeProps) {
  const bgClass = getStatusColor(status)
  return (
    <span
      className={cn(
        // Larger padding + border for accessibility (doesn't rely on color alone)
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold border',
        bgClass,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
      {translateJobStatus(status, jobType)}
    </span>
  )
}
