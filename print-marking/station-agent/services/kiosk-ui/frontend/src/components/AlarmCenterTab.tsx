import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { AlertTriangle, BellRing, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Filter, Loader2, RefreshCw, ShieldAlert, UserCheck, WifiOff, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useAuth } from '@/context/AuthContext'
import { alarmGuidance, translateAlarmCategory, translateAlarmResolution,
  translateAlarmSeverity, translateAlarmState, translateAlarmTitle } from '@/lib/utils'

export interface AlarmView {
  alarmId: string; alarmCode: string; dedupeKey: string; severity: string; category: string; state: string
  stationId: string; sourceService: string; sourceType: string; sourceId: string; deviceId?: string
  jobId?: string; workOrderNo?: string; productCode?: string; productSerial?: string
  titleKey: string; messageKey: string; messageParams: Record<string, string | null>
  technicalMessage?: string; productionImpact?: string; firstSeenAt: string; lastSeenAt: string
  occurrenceCount: number; acknowledgedBy?: string; acknowledgedAt?: string; assignedTo?: string
  assignedAt?: string; resolvedBy?: string; resolvedAt?: string; resolutionCode?: string
  resolutionComment?: string; suppressedUntil?: string; suppressionReason?: string
  escalationLevel: number; escalatedAt?: string; updatedAt: string; rowVersion: number
}

interface AlarmTimeline {
  id: string; actionType: string; previousState?: string; newState: string; actorUsername: string
  actorRole: string; comment?: string; occurredAt: string
}

interface AlarmSummary {
  activeCount: number; unacknowledgedCount: number; criticalCount: number
  inProgressCount: number; clearedTodayCount: number
}

type AlarmTab = 'ACTIVE' | 'RAISED' | 'IN_PROGRESS' | 'HISTORY' | 'SUPPRESSED'
interface Filters {
  severity: string; category: string; deviceId: string; workOrderNo: string
  assignedTo: string; from: string; to: string; productionImpactOnly: boolean
}

const EMPTY_FILTERS: Filters = { severity: '', category: '', deviceId: '', workOrderNo: '',
  assignedTo: '', from: '', to: '', productionImpactOnly: false }
const EMPTY_SUMMARY: AlarmSummary = { activeCount: 0, unacknowledgedCount: 0, criticalCount: 0,
  inProgressCount: 0, clearedTodayCount: 0 }
const PAGE_SIZE = 20

const severityClass: Record<string, string> = {
  CRITICAL: 'border-red-500/50 bg-red-500/15 text-red-300', HIGH: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  MEDIUM: 'border-amber-500/40 bg-amber-500/10 text-amber-300', LOW: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  INFO: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
}

export function AlarmSeverityBadge({ severity, animate = false }: { severity: string; animate?: boolean }) {
  return <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold ${severityClass[severity] ?? severityClass.INFO} ${animate ? 'motion-safe:animate-pulse' : ''}`}>
    <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />{translateAlarmSeverity(severity)}
  </span>
}

export function AlarmStateBadge({ state }: { state: string }) {
  return <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 text-xs font-semibold">
    {state === 'RAISED' ? <AlertTriangle className="h-3.5 w-3.5 text-orange-400" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
    {translateAlarmState(state)}
  </span>
}

function formatTime(value?: string) { return value ? new Date(value).toLocaleString('vi-VN') : '—' }
function duration(from: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 60000))
  return minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`
}

function SummaryCards({ value, onSelect }: { value: AlarmSummary; onSelect: (tab: AlarmTab) => void }) {
  const cards: Array<[string, number, AlarmTab, string]> = [
    ['Đang hoạt động', value.activeCount, 'ACTIVE', 'text-orange-300'],
    ['Chưa xác nhận', value.unacknowledgedCount, 'RAISED', 'text-red-300'],
    ['Nghiêm trọng', value.criticalCount, 'ACTIVE', 'text-red-400'],
    ['Đang xử lý', value.inProgressCount, 'IN_PROGRESS', 'text-blue-300'],
    ['Đã khôi phục hôm nay', value.clearedTodayCount, 'HISTORY', 'text-emerald-300'],
  ]
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
    {cards.map(([label, count, tab, color]) => <button key={label} onClick={() => onSelect(tab)}
      className="min-h-20 rounded-xl border border-border bg-card p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-brand hover:bg-surface-2">
      <div className={`text-2xl font-black ${color}`}>{count}</div><div className="text-xs text-muted-fg">{label}</div>
    </button>)}
  </div>
}

function AlarmDetail({ alarm, timeline, can, onAction, onClose }: {
  alarm: AlarmView | null; timeline: AlarmTimeline[]; can: (permission: string) => boolean
  onAction: (action: string, alarm: AlarmView) => void; onClose: () => void
}) {
  if (!alarm) return null
  const criticalWorkflow = alarm.severity === 'CRITICAL' && alarm.state === 'RAISED'
  return <Dialog open onOpenChange={open => { if (!open && !criticalWorkflow) onClose() }}>
    <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto bg-card" aria-describedby="alarm-detail-description">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-orange-400" />{translateAlarmTitle(alarm.alarmCode)}</DialogTitle>
        <DialogDescription id="alarm-detail-description">Mã cảnh báo: <code>{alarm.alarmCode}</code></DialogDescription></DialogHeader>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2"><AlarmSeverityBadge severity={alarm.severity} animate={criticalWorkflow} /><AlarmStateBadge state={alarm.state} /><Badge>{translateAlarmCategory(alarm.category)}</Badge></div>
          <Info title="Tóm tắt" rows={[
            ['Lần đầu', formatTime(alarm.firstSeenAt)], ['Lần cuối', formatTime(alarm.lastSeenAt)],
            ['Thời lượng', duration(alarm.firstSeenAt)], ['Số lần xuất hiện', String(alarm.occurrenceCount)],
            ['Người xử lý', alarm.assignedTo ?? 'Chưa phân công'], ['Kết quả', translateAlarmResolution(alarm.resolutionCode)],
            ['Tạm ẩn bởi', alarm.suppressionReason ?? '—'], ['Hết hạn tạm ẩn', formatTime(alarm.suppressedUntil)],
            ['Mức chuyển cấp', alarm.escalationLevel > 0 ? `Cấp ${alarm.escalationLevel}` : 'Chưa chuyển cấp'],
          ]} />
          <Info title="Ảnh hưởng sản xuất" rows={[
            ['Mức ảnh hưởng', alarm.productionImpact ?? 'Chưa xác định'], ['Công việc', alarm.jobId ?? '—'],
            ['Lệnh sản xuất', alarm.workOrderNo ?? '—'], ['SKU', alarm.productCode ?? '—'], ['Serial', alarm.productSerial ?? '—'],
          ]} />
          <Info title="Nguồn cảnh báo" rows={[
            ['Dịch vụ', alarm.sourceService], ['Loại thiết bị', alarm.sourceType], ['Thiết bị', alarm.deviceId ?? alarm.sourceId],
            ['Thông tin kỹ thuật', alarm.technicalMessage ?? '—'],
          ]} />
        </section>
        <section className="space-y-4">
          <div className="rounded-xl border border-border p-4"><h3 className="mb-3 text-sm font-bold">Hướng dẫn cho người vận hành</h3>
            <ol className="space-y-2">{alarmGuidance(alarm.alarmCode).map((item, index) => <li key={item} className="flex gap-2 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-light">{index + 1}</span>{item}</li>)}</ol>
          </div>
          <div className="rounded-xl border border-border p-4"><h3 className="mb-3 text-sm font-bold">Dòng thời gian</h3>
            {timeline.length === 0 ? <p className="text-sm text-muted-fg">Chưa có sự kiện lịch sử.</p> : <ol className="space-y-3 border-l border-brand/30 pl-4">{timeline.map(item => <li key={item.id} className="relative text-sm"><span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand" /><div className="font-semibold">{translateAlarmState(item.newState)}</div><div className="text-xs text-muted-fg">{item.actorUsername} · {formatTime(item.occurredAt)}</div>{item.comment && <div className="text-xs">{item.comment}</div>}</li>)}</ol>}
          </div>
        </section>
      </div>
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-card/95 py-3 backdrop-blur">
        {alarm.state === 'RAISED' && can('ALARM_ACKNOWLEDGE') && <Button className="min-h-11" onClick={() => onAction('acknowledge', alarm)}>Xác nhận đã thấy</Button>}
        {['RAISED','ACKNOWLEDGED'].includes(alarm.state) && can('ALARM_START_WORK') && <Button className="min-h-11" variant="outline" onClick={() => onAction('start-work', alarm)}><Wrench className="mr-2 h-4 w-4" />Bắt đầu xử lý</Button>}
        {!['CLEARED','CLOSED'].includes(alarm.state) && alarm.severity !== 'CRITICAL' && can('ALARM_SUPPRESS') && <Button className="min-h-11" variant="outline" onClick={() => onAction('suppress', alarm)}>Tạm ẩn</Button>}
        {!['CLEARED','CLOSED'].includes(alarm.state) && can('ALARM_CLEAR') && <Button className="min-h-11" variant="outline" onClick={() => onAction('clear', alarm)}>Đánh dấu đã khôi phục</Button>}
        {alarm.state === 'CLEARED' && can('ALARM_CLOSE') && <Button className="min-h-11" onClick={() => onAction('close', alarm)}>Đóng cảnh báo</Button>}
      </div>
      {criticalWorkflow && <Button variant="ghost" onClick={onClose} className="min-h-11">Quay lại danh sách</Button>}
    </DialogContent>
  </Dialog>
}

function Info({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <div className="rounded-xl border border-border p-4"><h3 className="mb-3 text-sm font-bold">{title}</h3><dl className="space-y-2">{rows.map(([key, value]) => <div key={key} className="flex justify-between gap-4 border-b border-border/60 pb-2 text-xs last:border-0"><dt className="text-muted-fg">{key}</dt><dd className="text-right font-semibold break-all">{value}</dd></div>)}</dl></div>
}

interface AlarmCenterTabProps {
  stationId: string; signalRAlarm?: unknown; isConnected?: boolean; isStale?: boolean; lastUpdatedAt?: string | null
}

export function AlarmCenterTab({ stationId, signalRAlarm, isConnected = true, isStale = false, lastUpdatedAt }: AlarmCenterTabProps) {
  const { user } = useAuth()
  const [tab, setTab] = useState<AlarmTab>('ACTIVE')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<AlarmView[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [summary, setSummary] = useState<AlarmSummary>(EMPTY_SUMMARY)
  const [selected, setSelected] = useState<AlarmView | null>(null)
  const [timeline, setTimeline] = useState<AlarmTimeline[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingAction, setPendingAction] = useState<{ action: string; alarm: AlarmView } | null>(null)
  const signalRef = useRef<unknown>(null)
  const baseUrl = import.meta.env.VITE_PROJECTION_URL || `${window.location.protocol}//${window.location.host}`
  const can = useCallback((permission: string) => !!user &&
    (user.roles.includes('SUPER_ADMIN') || user.permissions.includes('SYSTEM_ADMIN') || user.permissions.includes(permission)), [user])

  const queryState = tab === 'ACTIVE' ? 'ACTIVE' : tab === 'HISTORY' ? 'HISTORY' : tab
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params: Record<string, string | number | boolean> = { stationId, page, pageSize: PAGE_SIZE, state: queryState }
      const headers = { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` }
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value })
      const [list, summaryResult] = await Promise.all([
        axios.get<{ items: AlarmView[]; totalPages: number }>(`${baseUrl}/api/alarms`, { params, headers }),
        axios.get<AlarmSummary>(`${baseUrl}/api/alarms/summary`, { params: { stationId }, headers }),
      ])
      setItems(list.data.items); setTotalPages(Math.max(1, list.data.totalPages)); setSummary(summaryResult.data)
      setSelected(current => current ? list.data.items.find(x => x.alarmId === current.alarmId) ?? current : null)
    } catch { setError('Không thể tải dữ liệu cảnh báo. Dữ liệu gần nhất vẫn được giữ lại.') }
    finally { setLoading(false) }
  }, [baseUrl, filters, page, queryState, stationId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (signalRAlarm && signalRAlarm !== signalRef.current) { signalRef.current = signalRAlarm; void load() } }, [signalRAlarm, load])
  const selectedAlarmId = selected?.alarmId
  useEffect(() => { if (!selectedAlarmId) return; axios.get<AlarmTimeline[]>(`${baseUrl}/api/alarms/${selectedAlarmId}/timeline`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` } }).then(r => setTimeline(r.data)).catch(() => setTimeline([])) }, [baseUrl, selectedAlarmId])

  const updateFilter = (next: Partial<Filters>) => { setFilters(value => ({ ...value, ...next })); setPage(1) }
  const chooseTab = (next: AlarmTab) => { setTab(next); setPage(1) }
  const executeAction = async () => {
    if (!pendingAction) return
    const { action, alarm } = pendingAction; setPendingAction(null)
    const payload = action === 'clear' ? { resolutionCode: 'MANUAL_RESET', comment: 'Người vận hành xác nhận thiết bị đã khôi phục.' }
      : action === 'suppress' ? { reason: 'Tạm ẩn để kiểm tra bảo trì', until: new Date(Date.now() + 60 * 60 * 1000).toISOString() } : {}
    try { await axios.post(`${baseUrl}/api/alarms/${alarm.alarmId}/${action}`, payload, { headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`, 'Idempotency-Key': crypto.randomUUID() } }); await load(); setSelected(null) }
    catch { setError('Không thể thực hiện hành động. Vui lòng kiểm tra quyền hoặc trạng thái cảnh báo.') }
  }

  const tabs: Array<[AlarmTab, string]> = [['ACTIVE','Đang hoạt động'],['RAISED','Chưa xác nhận'],['IN_PROGRESS','Đang xử lý'],['HISTORY','Lịch sử'],['SUPPRESSED','Đã tạm ẩn']]
  return <div className="mx-auto max-w-7xl space-y-4 overflow-x-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-black">Trung tâm cảnh báo</h1><p className="text-sm text-muted-fg">Theo dõi và xử lý sự cố tại trạm theo thời gian thực</p></div><Button variant="outline" className="min-h-11" onClick={() => void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Làm mới</Button></div>
    {(!isConnected || isStale) && <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200"><div className="flex items-center gap-2 font-bold"><WifiOff className="h-4 w-4" />Mất kết nối dữ liệu thời gian thực</div><div>Dữ liệu có thể đã cũ · Cập nhật lần cuối: {lastUpdatedAt ? formatTime(lastUpdatedAt) : 'chưa xác định'}</div></div>}
    <SummaryCards value={summary} onSelect={chooseTab} />
    <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Danh sách cảnh báo</CardTitle><div className="flex flex-wrap gap-2" role="tablist">{tabs.map(([key,label]) => <button role="tab" aria-selected={tab === key} key={key} onClick={() => chooseTab(key)} className={`min-h-11 rounded-lg px-4 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand ${tab === key ? 'bg-brand text-white' : 'bg-surface-2 text-muted-fg'}`}>{label}</button>)}</div></CardHeader>
      <CardContent className="space-y-4"><div className="rounded-xl border border-border p-3"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-muted-fg"><Filter className="h-4 w-4" />Bộ lọc</div><div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
        <Select value={filters.severity || 'ALL'} onValueChange={v => updateFilter({ severity: v === 'ALL' ? '' : v })}><SelectTrigger className="min-h-11"><SelectValue placeholder="Mức độ" /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả mức độ</SelectItem>{['CRITICAL','HIGH','MEDIUM','LOW','INFO'].map(x => <SelectItem key={x} value={x}>{translateAlarmSeverity(x)}</SelectItem>)}</SelectContent></Select>
        <Select value={filters.category || 'ALL'} onValueChange={v => updateFilter({ category: v === 'ALL' ? '' : v })}><SelectTrigger className="min-h-11"><SelectValue placeholder="Nhóm cảnh báo" /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả nhóm</SelectItem>{['DEVICE','JOB','QUALITY','NETWORK','SYSTEM','SECURITY','MAINTENANCE'].map(x => <SelectItem key={x} value={x}>{translateAlarmCategory(x)}</SelectItem>)}</SelectContent></Select>
        <Input className="min-h-11" aria-label="Mã thiết bị" placeholder="Mã thiết bị" value={filters.deviceId} onChange={e => updateFilter({ deviceId: e.target.value })} />
        <Input className="min-h-11" aria-label="Lệnh sản xuất" placeholder="Lệnh sản xuất" value={filters.workOrderNo} onChange={e => updateFilter({ workOrderNo: e.target.value })} />
        <Input className="min-h-11" aria-label="Người xử lý" placeholder="Người xử lý" value={filters.assignedTo} onChange={e => updateFilter({ assignedTo: e.target.value })} />
        <Input className="min-h-11" aria-label="Từ ngày" type="date" value={filters.from} onChange={e => updateFilter({ from: e.target.value })} />
        <Input className="min-h-11" aria-label="Đến ngày" type="date" value={filters.to} onChange={e => updateFilter({ to: e.target.value })} />
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm"><Checkbox checked={filters.productionImpactOnly} onCheckedChange={v => updateFilter({ productionImpactOnly: v === true })} />Chỉ cảnh báo ảnh hưởng sản xuất</label>
      </div><div className="mt-3 flex flex-wrap gap-2"><Button className="min-h-11" onClick={() => void load()}>Áp dụng</Button><Button variant="ghost" className="min-h-11" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1) }}>Xóa bộ lọc</Button><Button variant="outline" className="min-h-11" onClick={() => updateFilter({ severity: 'CRITICAL' })}>Chỉ xem nghiêm trọng</Button></div></div>
      {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {loading && items.length === 0 ? <div className="flex min-h-40 items-center justify-center text-sm text-muted-fg"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Đang tải cảnh báo...</div> : items.length === 0 ? <div className="min-h-40 py-12 text-center text-sm text-muted-fg"><CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-emerald-400" />Không có cảnh báo phù hợp.</div> : <div className="space-y-2">{items.map(alarm => <button key={alarm.alarmId} onClick={() => setSelected(alarm)} className="grid min-h-20 w-full grid-cols-1 items-center gap-2 rounded-xl border border-border bg-card p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand md:grid-cols-[150px_1fr_150px_140px]">
        <AlarmSeverityBadge severity={alarm.severity} animate={alarm.severity === 'CRITICAL' && alarm.state === 'RAISED'} /><div><div className="font-bold">{translateAlarmTitle(alarm.alarmCode)}</div><div className="text-xs text-muted-fg">{alarm.deviceId ?? alarm.sourceId} · {alarm.workOrderNo ?? 'Không có lệnh SX'} · {duration(alarm.firstSeenAt)}</div><div className="mt-1 text-xs">Ảnh hưởng: {alarm.productionImpact ?? 'Chưa xác định'} · Xuất hiện {alarm.occurrenceCount} lần</div></div><AlarmStateBadge state={alarm.state} /><div className="text-xs text-muted-fg"><UserCheck className="mr-1 inline h-3.5 w-3.5" />{alarm.assignedTo ?? 'Chưa phân công'}<br/><Clock3 className="mr-1 inline h-3.5 w-3.5" />{formatTime(alarm.firstSeenAt)}</div></button>)}</div>}
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm"><span>Trang {page}/{totalPages}</span><div className="flex gap-2"><Button aria-label="Trang trước" variant="outline" className="min-h-11 min-w-11" disabled={page <= 1} onClick={() => setPage(x => x - 1)}><ChevronLeft /></Button><Button aria-label="Trang sau" variant="outline" className="min-h-11 min-w-11" disabled={page >= totalPages} onClick={() => setPage(x => x + 1)}><ChevronRight /></Button></div></div>
      </CardContent></Card>
    <AlarmDetail alarm={selected} timeline={timeline} can={can} onAction={(action, alarm) => setPendingAction({ action, alarm })} onClose={() => setSelected(null)} />
    <ConfirmDialog open={pendingAction !== null} title="Xác nhận hành động cảnh báo" description={`Bạn sắp thực hiện “${pendingAction?.action ?? ''}” cho cảnh báo ${pendingAction?.alarm.alarmCode ?? ''}. Hành động sẽ được ghi vào nhật ký kiểm toán.`} confirmText="Tiếp tục" confirmVariant={pendingAction?.action === 'close' ? 'destructive' : 'primary'} onConfirm={() => void executeAction()} onCancel={() => setPendingAction(null)} />
  </div>
}
