import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        // h-10 = 40px, plenty of touch target; bg-surface = white in light mode
        'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2',
        'text-[15px] font-medium text-foreground placeholder:text-subtle-fg',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand',
        'focus-visible:ring-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'transition-shadow duration-150',
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
