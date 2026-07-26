import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base: larger touch targets (h-10 default), clearer focus, smooth transitions
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[15px] font-semibold ring-offset-2 ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] cursor-pointer select-none',
  {
    variants: {
      variant: {
        // Primary — filled orange
        default:
          'bg-brand text-white hover:bg-brand-light active:bg-brand-dark shadow-sm',
        // Destructive — red
        destructive:
          'bg-error text-white hover:bg-error/90 shadow-sm',
        // Secondary — outlined with clear border
        outline:
          'border border-border-strong bg-surface text-foreground hover:bg-surface-2 hover:border-brand hover:text-brand',
        // Tertiary — ghost
        ghost:
          'text-muted-fg hover:bg-surface-2 hover:text-foreground border border-transparent',
        // Muted secondary fill
        secondary:
          'bg-surface-2 text-foreground border border-border hover:bg-surface-3 hover:border-border-strong',
        link:
          'text-brand underline-offset-4 hover:underline p-0 h-auto',
        success:
          'bg-success text-white hover:bg-success/90 shadow-sm',
        // Connected/disconnected states (used in badge-like buttons)
        connected:
          'bg-success/10 text-success border border-success/25',
        disconnected:
          'bg-error/10 text-error border border-error/25',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-9 rounded-md px-3 text-[13px]',
        lg:      'h-12 rounded-lg px-6 text-base',
        xl:      'h-14 rounded-xl px-8 text-lg',
        icon:    'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
