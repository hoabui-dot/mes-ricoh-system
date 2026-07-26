import React from 'react'
import { cn } from '@/utils/cn'

// ─── StatusBadge ─────────────────────────────────────────────────────────────
interface StatusBadgeProps {
  status: string
  label?: string
  className?: string
}

const STATUS_CONFIG: Record<string, { cls: string; dot?: string }> = {
  // Generic
  active: { cls: 'badge-success', dot: '#22C55E' },
  inactive: { cls: 'badge-neutral', dot: '#6B7280' },
  suspended: { cls: 'badge-danger', dot: '#EF4444' },

  // Worker
  on_leave: { cls: 'badge-warning', dot: '#F59E0B' },
  terminated: { cls: 'badge-danger', dot: '#EF4444' },
  available: { cls: 'badge-success', dot: '#22C55E' },
  busy: { cls: 'badge-orange', dot: '#F97316' },
  off_shift: { cls: 'badge-neutral', dot: '#6B7280' },

  // Production orders
  draft: { cls: 'badge-neutral' },
  planned: { cls: 'badge-info' },
  in_progress: { cls: 'badge-orange' },
  completed: { cls: 'badge-success' },
  cancelled: { cls: 'badge-neutral' },
  on_hold: { cls: 'badge-warning' },
  delayed: { cls: 'badge-danger' },

  // Work orders
  pending: { cls: 'badge-neutral' },
  ready: { cls: 'badge-info' },

  // Shifts
  scheduled: { cls: 'badge-info' },

  // Assignments
  proposed: { cls: 'badge-info' },
  approved: { cls: 'badge-success' },
  rejected: { cls: 'badge-danger' },
  overridden: { cls: 'badge-warning' },

  // Leave
  annual: { cls: 'badge-info' },
  sick: { cls: 'badge-warning' },
  emergency: { cls: 'badge-danger' },
  unpaid: { cls: 'badge-neutral' },
  other: { cls: 'badge-neutral' },

  // Certifications
  valid: { cls: 'badge-success' },
  expired: { cls: 'badge-danger' },
  revoked: { cls: 'badge-neutral' },

  // Connections
  online: { cls: 'badge-success', dot: '#22C55E' },
  offline: { cls: 'badge-neutral', dot: '#6B7280' },
  connecting: { cls: 'badge-warning', dot: '#F59E0B' },
  error: { cls: 'badge-danger', dot: '#EF4444' },
}

function prettify(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status.toLowerCase()] ?? { cls: 'badge-neutral' }
  return (
    <span className={cn('badge', config.cls, className)}>
      {config.dot && (
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: config.dot,
            flexShrink: 0,
          }}
        />
      )}
      {label ?? prettify(status)}
    </span>
  )
}

// ─── RealtimeDot ─────────────────────────────────────────────────────────────
interface RealtimeDotProps {
  status?: 'online' | 'warning' | 'danger' | 'offline'
  size?: number
  className?: string
}

export function RealtimeDot({ status = 'online', size = 8, className }: RealtimeDotProps) {
  const cls = {
    online: 'realtime-dot',
    warning: 'realtime-dot realtime-dot--warning',
    danger: 'realtime-dot realtime-dot--danger',
    offline: '',
  }[status]

  const offlineStyle = status === 'offline'
    ? { backgroundColor: '#6B7280', width: size, height: size }
    : { width: size, height: size }

  return (
    <span
      className={cn(cls, className)}
      style={offlineStyle}
      role="status"
      aria-label={`Connection status: ${status}`}
    />
  )
}

// ─── ConnectionBadge ──────────────────────────────────────────────────────────
interface ConnectionBadgeProps {
  connected: boolean
  className?: string
}

export function ConnectionBadge({ connected, className }: ConnectionBadgeProps) {
  return (
    <span className={cn('badge', connected ? 'badge-success' : 'badge-neutral', className)}>
      <RealtimeDot status={connected ? 'online' : 'offline'} size={6} />
      {connected ? 'Live' : 'Offline'}
    </span>
  )
}

// ─── HealthIndicator ─────────────────────────────────────────────────────────
interface HealthIndicatorProps {
  value: number // 0-100
  label?: string
  className?: string
}

export function HealthIndicator({ value, label, className }: HealthIndicatorProps) {
  const color = value >= 80 ? '#22C55E' : value >= 50 ? '#F59E0B' : '#EF4444'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        style={{
          width: 32,
          height: 32,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
          <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle
            cx="16" cy="16" r="12"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${(2 * Math.PI * 12 * value) / 100} ${2 * Math.PI * 12}`}
          />
        </svg>
        <span style={{ fontSize: 8, fontWeight: 700, color }}>{value}%</span>
      </div>
      {label && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</span>}
    </div>
  )
}

// ─── ScoreIndicator ────────────────────────────────────────────────────────────
interface ScoreIndicatorProps {
  score: number // 0-100
  className?: string
}

export function ScoreIndicator({ score, className }: ScoreIndicatorProps) {
  const color = score >= 80 ? '#22C55E' : score >= 60 ? '#F59E0B' : '#EF4444'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        style={{
          height: 6,
          flex: 1,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 3,
          overflow: 'hidden',
          minWidth: 60,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${score}%`,
            background: color,
            borderRadius: 3,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{score.toFixed(0)}</span>
    </div>
  )
}
