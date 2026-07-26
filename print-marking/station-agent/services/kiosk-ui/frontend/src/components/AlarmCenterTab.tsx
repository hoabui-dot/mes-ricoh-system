import { useEffect, useState, useCallback, useRef } from 'react'
import axios from 'axios'
import { AlertTriangle, CheckCircle, RefreshCw, Search, X, ChevronLeft, ChevronRight, Wifi, Cpu, Activity, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import {
  Table as TableEl, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { type Alarm, type PagedAlarmResult } from '@/hooks/useDashboard'
import client from '@/api/client'
import {
  getRetentionLimitStr,
  getTodayStr,
  normalizeStartOfDay,
  normalizeEndOfDay,
  clampToRetentionWindow,
  buildLast7DaysRange,
  buildTodayRange,
  buildYesterdayRange,
  buildLast3DaysRange,
  formatRangeDisplay
} from '@/lib/dateUtils'

// ─── Types ─────────────────────────────────────────────────────────────────────

type AlarmCategory = 'DeviceConnection' | 'ProductionError'

interface AlarmFilters {
  status: string      // '' | 'Active' | 'Acknowledged' | 'Resolved'
  severity: string    // '' | 'Critical' | 'Error' | 'Warning'
  deviceId: string
  search: string
  dateFrom: string
  dateTo: string
}

const defaultFilters = (): AlarmFilters => {
  const range = buildLast7DaysRange()
  return {
    status: '',
    severity: '',
    deviceId: '',
    search: '',
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  }
}

const PAGE_SIZE = 20

// ─── Severity badge ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === 'Critical' ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
    severity === 'Error'    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30' :
                              'bg-amber-500/15 text-amber-400 border border-amber-500/30'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${severity === 'Critical' ? 'bg-red-400 animate-pulse' : severity === 'Error' ? 'bg-orange-400' : 'bg-amber-400'}`} />
      {severity}
    </span>
  )
}

// ─── State badge ────────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  if (state === 'Acknowledged')
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-bold">
        <CheckCircle className="h-3.5 w-3.5" /> Đã xác nhận
      </span>
    )
  if (state === 'Resolved')
    return (
      <span className="inline-flex items-center gap-1 text-blue-400 text-xs font-bold">
        <CheckCircle className="h-3.5 w-3.5" /> Đã giải quyết
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-orange-400 text-xs font-bold animate-pulse">
      <AlertTriangle className="h-3.5 w-3.5" /> Chưa xác nhận
    </span>
  )
}

// ─── Alarm Detail Modal ─────────────────────────────────────────────────────────

function AlarmDetailModal({
  alarm,
  onClose,
  onAcknowledge,
}: {
  alarm: Alarm | null
  onClose: () => void
  onAcknowledge: (id: string) => Promise<void>
}) {
  const [acking, setAcking] = useState(false)

  if (!alarm) return null

  const handleAck = async () => {
    setAcking(true)
    await onAcknowledge(alarm.id)
    setAcking(false)
  }

  const fmt = (ts?: string | null) =>
    ts ? new Date(ts).toLocaleString('vi-VN') : '—'

  // Build a simple timeline from the alarm's fields
  const timeline: { time: string; label: string; highlight?: boolean }[] = []
  if (alarm.firstOccurredAt)
    timeline.push({ time: fmt(alarm.firstOccurredAt), label: 'Cảnh báo được tạo', highlight: true })
  if (alarm.repeatCount > 0)
    timeline.push({ time: fmt(alarm.lastOccurredAt), label: `Sự kiện lặp lại (×${alarm.repeatCount})` })
  if (alarm.isAcknowledged && alarm.acknowledgedAt)
    timeline.push({ time: fmt(alarm.acknowledgedAt), label: `Đã xác nhận bởi ${alarm.acknowledgedBy ?? '—'}`, highlight: true })
  if (alarm.resolvedAt)
    timeline.push({ time: fmt(alarm.resolvedAt), label: 'Đã giải quyết', highlight: true })

  return (
    <Dialog open={!!alarm} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-base font-bold">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            Chi tiết cảnh báo
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-fg">
            ID: <code className="font-mono bg-surface-2 px-1 rounded">{alarm.id}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          {/* Info panel */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase text-muted-fg tracking-wider">Thông tin cảnh báo</h4>
            <div className="space-y-2 text-sm">
              {[
                ['Mức độ', <SeverityBadge key="sv" severity={alarm.severity} />],
                ['Loại',   <span key="typ" className="font-semibold text-foreground">{alarm.alarmType === 'DeviceConnection' ? 'Kết nối thiết bị' : 'Lỗi sản xuất'}</span>],
                ['Nguồn',  alarm.source],
                ['Thiết bị', alarm.deviceName ? `${alarm.deviceName} (${alarm.deviceId ?? '—'})` : (alarm.deviceId ?? '—')],
                ['Lệnh SX', alarm.productionOrderId ?? '—'],
                ['Trạng thái', <StateBadge key="st" state={alarm.currentState} />],
                ['Xác nhận bởi', alarm.acknowledgedBy ?? '—'],
                ['Thời gian xác nhận', fmt(alarm.acknowledgedAt)],
                ['Tạo lúc', fmt(alarm.createdAt)],
                ['Lần cuối', fmt(alarm.lastOccurredAt)],
                ['Số lần lặp', alarm.repeatCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between items-center border-b border-border pb-1.5 last:border-0">
                  <span className="text-muted-fg text-xs">{label}</span>
                  <span className="text-xs font-semibold text-right">{value as any}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Message + Timeline */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-fg tracking-wider mb-2">Nội dung thông báo</h4>
              <p className="text-sm text-foreground bg-surface-2 rounded-lg px-4 py-3 border border-border">
                {alarm.message}
              </p>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-fg tracking-wider mb-2">Dòng thời gian</h4>
              <ol className="relative border-l border-brand/30 space-y-3 pl-4">
                {timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[17px] top-0.5 h-3 w-3 rounded-full border-2 ${t.highlight ? 'bg-brand border-brand' : 'bg-surface-2 border-border'}`} />
                    <p className={`text-xs font-semibold ${t.highlight ? 'text-foreground' : 'text-muted-fg'}`}>{t.label}</p>
                    <time className="text-[10px] text-muted-fg font-mono">{t.time}</time>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        {/* Actions */}
        {!alarm.isAcknowledged && (
          <div className="flex justify-end pt-4 border-t border-border mt-2">
            <Button onClick={handleAck} disabled={acking} className="gap-2">
              <CheckCircle className="h-4 w-4" />
              {acking ? 'Đang xác nhận...' : 'Xác nhận cảnh báo'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Filter Toolbar ─────────────────────────────────────────────────────────────

function FilterToolbar({
  filters,
  onChange,
  onReset,
}: {
  filters: AlarmFilters
  onChange: (f: Partial<AlarmFilters>) => void
  onReset: () => void
}) {
  const rangeDisplay = formatRangeDisplay(filters.dateFrom, filters.dateTo)

  return (
    <div className="flex flex-wrap gap-2 items-end pb-4 border-b border-border">
      {/* Search */}
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-fg" />
        <Input
          placeholder="Tìm kiếm thiết bị, thông báo..."
          value={filters.search}
          onChange={e => onChange({ search: e.target.value })}
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* Status */}
      <Select value={filters.status || '__all__'} onValueChange={v => onChange({ status: v === '__all__' ? '' : v })}>
        <SelectTrigger className="h-8 text-xs w-36">
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tất cả trạng thái</SelectItem>
          <SelectItem value="Active">Chưa xác nhận</SelectItem>
          <SelectItem value="Acknowledged">Đã xác nhận</SelectItem>
          <SelectItem value="Resolved">Đã giải quyết</SelectItem>
        </SelectContent>
      </Select>

      {/* Severity */}
      <Select value={filters.severity || '__all__'} onValueChange={v => onChange({ severity: v === '__all__' ? '' : v })}>
        <SelectTrigger className="h-8 text-xs w-32">
          <SelectValue placeholder="Mức độ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tất cả mức độ</SelectItem>
          <SelectItem value="Critical">Critical</SelectItem>
          <SelectItem value="Error">Error</SelectItem>
          <SelectItem value="Warning">Warning</SelectItem>
        </SelectContent>
      </Select>

      {/* Date range quick picks */}
      <Select
        value=""
        onValueChange={v => {
          if (v === 'today') onChange(buildTodayRange())
          else if (v === 'yesterday') onChange(buildYesterdayRange())
          else if (v === '3d') onChange(buildLast3DaysRange())
          else if (v === '7d') onChange(buildLast7DaysRange())
        }}
      >
        <SelectTrigger className="h-8 text-xs w-36">
          <SelectValue placeholder="Khoảng thời gian" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Hôm nay</SelectItem>
          <SelectItem value="yesterday">Hôm qua</SelectItem>
          <SelectItem value="3d">3 ngày qua</SelectItem>
          <SelectItem value="7d">7 ngày qua</SelectItem>
        </SelectContent>
      </Select>

      {/* Date from / to */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          min={getRetentionLimitStr()}
          max={getTodayStr()}
          value={filters.dateFrom ? filters.dateFrom.split('T')[0] : ''}
          onChange={e => {
            const val = e.target.value
            if (val) {
              const clamped = clampToRetentionWindow(val, getRetentionLimitStr())
              onChange({ dateFrom: normalizeStartOfDay(clamped) })
            }
          }}
          className="h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground"
        />
        <span className="text-muted-fg text-xs self-center">→</span>
        <input
          type="date"
          min={getRetentionLimitStr()}
          max={getTodayStr()}
          value={filters.dateTo ? filters.dateTo.split('T')[0] : ''}
          onChange={e => {
            const val = e.target.value
            if (val) {
              const clamped = clampToRetentionWindow(val, getTodayStr())
              onChange({ dateTo: normalizeEndOfDay(clamped) })
            }
          }}
          className="h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground"
        />
      </div>

      {rangeDisplay && (
        <div className="text-[11px] text-brand-light font-bold self-center px-2.5 py-1 rounded bg-brand/5 border border-brand/10">
          📅 {rangeDisplay}
        </div>
      )}

      {/* Reset */}
      <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={onReset}>
        <X className="h-3.5 w-3.5" /> Xóa bộ lọc
      </Button>
    </div>
  )
}

// ─── Pagination Footer ──────────────────────────────────────────────────────────

function PaginationFooter({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPage,
}: {
  page: number
  totalPages: number
  totalCount: number
  pageSize: number
  onPage: (p: number) => void
}) {
  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, totalCount)
  return (
    <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
      <span className="text-xs text-muted-fg">
        Hiển thị <strong>{from}–{to}</strong> / <strong>{totalCount}</strong> cảnh báo
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          const p = Math.max(1, page - 2) + i
          if (p > totalPages) return null
          return (
            <Button key={p} size="sm" variant={p === page ? 'default' : 'ghost'} className="h-7 w-7 p-0 text-xs" onClick={() => onPage(p)}>
              {p}
            </Button>
          )
        })}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Alarm Table ────────────────────────────────────────────────────────────────

function AlarmTable({
  alarms,
  onRowClick,
  onAcknowledge,
}: {
  alarms: Alarm[]
  onRowClick: (a: Alarm) => void
  onAcknowledge: (id: string) => Promise<void>
}) {
  const [ackingId, setAckingId] = useState<string | null>(null)

  const handleAck = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setAckingId(id)
    await onAcknowledge(id)
    setAckingId(null)
  }

  if (alarms.length === 0)
    return (
      <div className="text-center py-16 text-muted-fg text-sm">
        <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-20" />
        Không có cảnh báo nào phù hợp với bộ lọc.
      </div>
    )

  return (
    <div className="overflow-x-auto border border-border rounded-xl bg-card">
      <TableEl>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="pl-4 font-bold text-xs uppercase tracking-wider">Mức độ</TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-wider">Nguồn / Thiết bị</TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-wider">Nội dung</TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-wider">Lần đầu</TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-wider">Lần cuối</TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-wider text-center">Lặp</TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-wider">Trạng thái</TableHead>
            <TableHead className="pr-4 text-right font-bold text-xs uppercase tracking-wider">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alarms.map(alarm => (
            <TableRow
              key={alarm.id}
              onClick={() => onRowClick(alarm)}
              className={`cursor-pointer transition-colors ${alarm.currentState !== 'Active' ? 'opacity-60 bg-muted/10' : 'hover:bg-surface-1'}`}
            >
              <TableCell className="pl-4">
                <SeverityBadge severity={alarm.severity} />
              </TableCell>
              <TableCell className="text-xs">
                <div className="font-semibold text-foreground">{alarm.source}</div>
                {alarm.deviceName && (
                  <div className="text-muted-fg font-mono text-[11px]">{alarm.deviceId}</div>
                )}
              </TableCell>
              <TableCell className="text-xs text-foreground max-w-xs truncate">{alarm.message}</TableCell>
              <TableCell className="text-muted-fg text-xs whitespace-nowrap">
                {new Date(alarm.firstOccurredAt || alarm.createdAt).toLocaleString('vi-VN')}
              </TableCell>
              <TableCell className="text-muted-fg text-xs whitespace-nowrap">
                {alarm.repeatCount > 0
                  ? new Date(alarm.lastOccurredAt).toLocaleString('vi-VN')
                  : '—'}
              </TableCell>
              <TableCell className="text-center">
                {alarm.repeatCount > 0 ? (
                  <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0">
                    +{alarm.repeatCount}
                  </Badge>
                ) : '—'}
              </TableCell>
              <TableCell>
                <StateBadge state={alarm.currentState} />
              </TableCell>
              <TableCell className="pr-4 text-right">
                {alarm.currentState === 'Active' && (
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={ackingId === alarm.id}
                    onClick={e => handleAck(e, alarm.id)}
                  >
                    {ackingId === alarm.id ? '...' : 'Xác nhận'}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TableEl>
    </div>
  )
}

// ─── Main AlarmCenterTab ────────────────────────────────────────────────────────

interface AlarmCenterTabProps {
  stationId: string
  /** Called from useDashboard SignalR OnAlarmRaised — triggers a list refresh */
  signalRAlarm?: Alarm | null
}

export function AlarmCenterTab({ stationId: _stationId, signalRAlarm }: AlarmCenterTabProps) {
  const [category, setCategory] = useState<AlarmCategory>('DeviceConnection')
  const [filters, setFilters] = useState<AlarmFilters>(defaultFilters())
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PagedAlarmResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedAlarm, setSelectedAlarm] = useState<Alarm | null>(null)

  const baseUrl = import.meta.env.VITE_PROJECTION_URL ||
    `${window.location.protocol}//${window.location.host}`

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAlarms = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))
      params.set('alarmType', category)
      if (filters.status)   params.set('status',   filters.status)
      if (filters.severity) params.set('severity', filters.severity)
      if (filters.deviceId) params.set('deviceId', filters.deviceId)
      if (filters.search)   params.set('search',   filters.search)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo)   params.set('dateTo',   filters.dateTo)

      const res = await axios.get<PagedAlarmResult>(
        `${baseUrl}/api/projection/alarms?${params.toString()}`
      )
      setResult(res.data)
    } catch (err) {
      console.error('[AlarmCenterTab] fetch error', err)
    } finally {
      setLoading(false)
    }
  }, [baseUrl, page, category, filters])

  useEffect(() => { fetchAlarms() }, [fetchAlarms])

  // React to SignalR real-time alarm — re-fetch to keep list fresh
  const prevSignalRAlarm = useRef<Alarm | null>(null)
  useEffect(() => {
    if (signalRAlarm && signalRAlarm !== prevSignalRAlarm.current) {
      prevSignalRAlarm.current = signalRAlarm
      if (signalRAlarm.alarmType === category) {
        fetchAlarms()
      }
    }
  }, [signalRAlarm, category, fetchAlarms])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAcknowledge = async (id: string) => {
    await client.post(`/projection/alarms/${id}/acknowledge`)
    // Optimistic: update selected alarm + list
    setSelectedAlarm(prev => prev?.id === id ? { ...prev, isAcknowledged: true, currentState: 'Acknowledged', acknowledgedBy: 'Operator', acknowledgedAt: new Date().toISOString() } : prev)
    setResult(prev => prev ? {
      ...prev,
      activeCount: Math.max(0, prev.activeCount - 1),
      items: prev.items.map(a => a.id === id ? { ...a, isAcknowledged: true, currentState: 'Acknowledged', acknowledgedBy: 'Operator', acknowledgedAt: new Date().toISOString() } : a)
    } : null)
  }

  const handleCategoryChange = (c: AlarmCategory) => {
    setCategory(c)
    setPage(1)
  }

  const handleFilterChange = (f: Partial<AlarmFilters>) => {
    setFilters(prev => ({ ...prev, ...f }))
    setPage(1)
  }

  const handleResetFilters = () => {
    setFilters(defaultFilters())
    setPage(1)
  }

  // ── Banner counts ─────────────────────────────────────────────────────────
  const totalActive = result?.activeCount ?? 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Header + Banner */}
      <Card className="border border-border bg-card">
        <CardHeader className="py-4 px-6 border-b border-border bg-brand/5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base font-bold tracking-wider text-brand uppercase flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Trung tâm quản lý cảnh báo
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Giám sát cảnh báo phần cứng và lỗi quy trình gia công theo thời gian thực
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {totalActive > 0 && (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold animate-pulse">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {totalActive} cảnh báo chưa xác nhận
                </span>
              )}
              {totalActive === 0 && result !== null && (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Không có cảnh báo hoạt động
                </span>
              )}
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={fetchAlarms} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Làm mới
              </Button>
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex gap-1 mt-4">
            <button
              onClick={() => handleCategoryChange('DeviceConnection')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${category === 'DeviceConnection'
                ? 'bg-brand text-white shadow-sm'
                : 'text-muted-fg hover:text-foreground hover:bg-surface-2'
              }`}
            >
              <Wifi className="h-3.5 w-3.5" />
              Kết nối thiết bị
            </button>
            <button
              onClick={() => handleCategoryChange('ProductionError')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${category === 'ProductionError'
                ? 'bg-brand text-white shadow-sm'
                : 'text-muted-fg hover:text-foreground hover:bg-surface-2'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Lỗi sản xuất
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {/* Category description */}
          <div className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${category === 'DeviceConnection' ? 'border-blue-500/20 bg-blue-500/5 text-blue-300' : 'border-orange-500/20 bg-orange-500/5 text-orange-300'}`}>
            {category === 'DeviceConnection'
              ? <><Cpu className="h-4 w-4 shrink-0 mt-0.5" /> Hiển thị cảnh báo mất kết nối thiết bị (Printer, Laser, PLC, Camera, Gateway). Chỉ tạo cảnh báo khi đang chạy lệnh sản xuất.</>
              : <><Activity className="h-4 w-4 shrink-0 mt-0.5" /> Hiển thị các lỗi quy trình gia công (Job Failed, Dispatch Failed, Workflow Exception, Retry Exhausted).</>
            }
          </div>

          {/* Filter toolbar */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-3.5 w-3.5 text-muted-fg" />
              <span className="text-xs font-bold text-muted-fg uppercase tracking-wider">Bộ lọc</span>
            </div>
            <FilterToolbar filters={filters} onChange={handleFilterChange} onReset={handleResetFilters} />
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-12 text-muted-fg text-sm">
              <RefreshCw className="h-6 w-6 mx-auto mb-3 animate-spin opacity-40" />
              Đang tải danh sách cảnh báo...
            </div>
          ) : (
            <AlarmTable
              alarms={result?.items ?? []}
              onRowClick={setSelectedAlarm}
              onAcknowledge={handleAcknowledge}
            />
          )}

          {/* Pagination */}
          {result && result.totalPages > 1 && (
            <PaginationFooter
              page={page}
              totalPages={result.totalPages}
              totalCount={result.totalCount}
              pageSize={PAGE_SIZE}
              onPage={setPage}
            />
          )}
        </CardContent>
      </Card>

      {/* Alarm Detail Modal */}
      <AlarmDetailModal
        alarm={selectedAlarm}
        onClose={() => setSelectedAlarm(null)}
        onAcknowledge={handleAcknowledge}
      />
    </div>
  )
}
