/**
 * StationActivityLog
 *
 * Shows the last 10 production orders in a compact operator-friendly table.
 * Replaces the old developer-oriented event log (MQTTReceived, JobCreated, etc.)
 */
import { CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'
import { ProductionRecord } from '@/hooks/useDashboard'

interface Props {
  records: ProductionRecord[]
  onRowClick?: (record: ProductionRecord) => void
}

function getStatusConfig(status: string) {
  const s = status?.toUpperCase()
  if (s === 'COMPLETED') return {
    label: 'Hoàn thành',
    icon: <CheckCircle className="h-4 w-4" />,
    className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    dot: 'bg-emerald-400'
  }
  if (s === 'FAILED' || s === 'WAIT_REWORK') return {
    label: s === 'FAILED' ? 'Thất bại' : 'Chờ xử lý',
    icon: <XCircle className="h-4 w-4" />,
    className: 'text-red-400 bg-red-500/10 border-red-500/30',
    dot: 'bg-red-400'
  }
  if (s === 'PROCESSING' || s === 'PRINTING' || s === 'VERIFYING') return {
    label: 'Đang xử lý',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    className: 'text-brand-light bg-brand/10 border-brand/30',
    dot: 'bg-brand animate-pulse'
  }
  return {
    label: 'Đang chờ',
    icon: <Clock className="h-4 w-4" />,
    className: 'text-muted-fg bg-surface-2 border-border',
    dot: 'bg-muted-fg'
  }
}

function formatTime(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export function StationActivityLog({ records, onRowClick }: Props) {
  // Sort by updatedAt desc and take last 10
  const sorted = [...records]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10)

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-fg">
        <Clock className="h-10 w-10 mb-3 opacity-20" />
        <p className="text-sm font-medium">Chưa có lệnh sản xuất nào hôm nay.</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/50">
      {sorted.map((record, idx) => {
        const cfg = getStatusConfig(record.currentStatus)
        const isFirst = idx === 0
        return (
          <div
            key={record.id}
            onClick={() => onRowClick?.(record)}
            className={[
              'flex items-center justify-between gap-3 px-4 py-3 transition-colors',
              onRowClick ? 'cursor-pointer hover:bg-surface-2' : '',
              isFirst ? 'bg-brand/5' : ''
            ].join(' ')}
          >
            {/* Left: status dot + order info */}
            <div className="flex items-center gap-3 min-w-0">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${cfg.dot}`} />
              <div className="min-w-0">
                <div className="font-bold text-base text-foreground font-mono truncate leading-tight">
                  {record.jobNo}
                  {isFirst && (
                    <span className="ml-2 text-[10px] font-bold text-brand-light bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded-full align-middle">
                      MỚI NHẤT
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-fg truncate leading-tight">{record.productCode}</div>
              </div>
            </div>

            {/* Middle: planned quantity (if available) */}
            <div className="hidden sm:block text-center shrink-0">
              {record.plannedQty != null ? (
                <>
                  <div className="text-xs text-muted-fg">Kế hoạch</div>
                  <div className="text-sm font-bold text-foreground font-mono">{record.plannedQty} pcs</div>
                </>
              ) : (
                <div className="text-xs text-muted-fg font-mono">{record.jobType || '—'}</div>
              )}
            </div>

            {/* Status badge */}
            <div className="shrink-0">
              <span className={[
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border',
                cfg.className
              ].join(' ')}>
                {cfg.icon}
                {cfg.label}
              </span>
            </div>

            {/* Time */}
            <div className="text-right shrink-0 hidden md:block">
              <div className="text-xs text-muted-fg">
                {formatTime(record.updatedAt)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
