import React from 'react'
import { cn } from '@/utils/cn'

// ─── PageHeader ───────────────────────────────────────────────────────────────
interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-6', className)}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.3 }}>
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  )
}

// ─── StatisticCard ────────────────────────────────────────────────────────────
interface StatisticCardProps {
  label: string
  value: number | string
  unit?: string
  delta?: number
  icon?: React.ReactNode
  color?: string
  loading?: boolean
  className?: string
  onClick?: () => void
}

export function StatisticCard({
  label,
  value,
  unit,
  delta,
  icon,
  color = '#F97316',
  loading,
  className,
  onClick,
}: StatisticCardProps) {
  return (
    <div
      className={cn('stat-card', className, onClick && 'cursor-pointer')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Icon + label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        {icon && (
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 8,
            background: `${color}18`,
            color,
          }}>
            {icon}
          </span>
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div className="skeleton" style={{ height: 32, width: 80, marginTop: 8 }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1 }}>
            {value}
          </span>
          {unit && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{unit}</span>}
        </div>
      )}

      {/* Delta */}
      {delta !== undefined && !loading && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 11,
            color: delta >= 0 ? '#22C55E' : '#EF4444',
            fontWeight: 500,
          }}>
            {delta >= 0 ? '+' : ''}{delta}%
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>vs last shift</span>
        </div>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
  rounded?: boolean
}

export function Skeleton({ className, width, height, rounded }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton', className)}
      style={{
        width,
        height,
        borderRadius: rounded ? '50%' : undefined,
      }}
    />
  )
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
interface SpinnerProps {
  size?: number
  color?: string
  className?: string
}

export function Spinner({ size = 20, color = '#F97316', className }: SpinnerProps) {
  return (
    <div className={cn('inline-flex items-center justify-center', className)}>
      <style>{`@keyframes mes-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: size,
          height: size,
          border: `2px solid rgba(249, 115, 22, 0.2)`,
          borderTopColor: color,
          borderRadius: '50%',
          animation: 'mes-spin 0.7s linear infinite',
        }}
      />
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 gap-4', className)}>
      {icon && (
        <div style={{
          width: 56, height: 56, borderRadius: 12,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-muted)',
        }}>
          {icon}
        </div>
      )}
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{title}</p>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
interface SectionHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

export function SectionHeader({ title, description, children, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{title}</h2>
        {description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

// ─── Divider ─────────────────────────────────────────────────────────────────
export function Divider({ className }: { className?: string }) {
  return (
    <hr
      className={cn(className)}
      style={{ border: 'none', borderTop: '1px solid var(--color-border-subtle)', margin: '16px 0' }}
    />
  )
}

// ─── PermissionGuard ─────────────────────────────────────────────────────────
import { useAuthStore } from '@/stores/auth.store'

interface PermissionGuardProps {
  permission: string | string[]
  fallback?: React.ReactNode
  children: React.ReactNode
}

export function PermissionGuard({ permission, fallback = null, children }: PermissionGuardProps) {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const permissions = Array.isArray(permission) ? permission : [permission]
  const allowed = user ? permissions.some((p) => hasPermission(p)) : false
  return <>{allowed ? children : fallback}</>
}

// ─── ErrorBoundary ─────────────────────────────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ color: 'var(--color-text-danger)', fontWeight: 600 }}>Something went wrong</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 8 }}>
              {this.state.error?.message}
            </p>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 16 }}
              onClick={() => this.setState({ hasError: false })}
            >
              Try again
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
