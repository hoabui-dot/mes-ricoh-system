import { useEffect, useState, useCallback } from 'react'
import { templateApi, printerApi } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Printer, PlusCircle, XCircle, RefreshCw, CheckCircle2, WifiOff,
  Layers, Tag, Zap, FlaskConical, ChevronDown, ChevronRight
} from 'lucide-react'

interface ReadyPrinter {
  id: string
  printerCode: string
  displayName: string
  ipAddress: string
  port: number
  protocol: string
  vendor: string
  status: string
  driverType: string
  lastHeartbeatAt?: string
  isActiveForWork: boolean
  activeTemplateId?: string
  activeTemplateName?: string
}

interface LabelTemplate {
  id: string
  name: string
  description?: string
  status: string
  dpi: number
  labelWidth: number
  labelHeight: number
  version: number
}

/** Subset of DeviceStatus from useDashboard — passed in as a real-time override */
export interface DeviceStatusLive {
  deviceId: string
  deviceType: string
  isOnline: boolean
  lastSeenAt: string
  lifecycleState?: string
  serialNumber?: string
  lifetimePrintCounter?: number
  thermalTemp?: number
  connectionDetails?: string
}

// ─── Lifecycle helpers (match the DashboardPage color table) ─────────────────

/** Resolve effective lifecycle state: prefer live SignalR data, fall back to REST poll status */
function resolveLifecycle(printer: ReadyPrinter, live?: DeviceStatusLive): { isOnline: boolean; lifecycle: string } {
  if (live) return { isOnline: live.isOnline, lifecycle: (live.lifecycleState ?? (live.isOnline ? 'Online' : 'Offline')) }
  const s = (printer.status || '').toUpperCase()
  const isOnline = s === 'ONLINE' || s === 'IDLE'
  return { isOnline, lifecycle: isOnline ? 'Online' : 'Offline' }
}

function lifecycleDot(lifecycle: string, isOnline: boolean): string {
  if (!isOnline) return 'bg-red-400 opacity-50'
  const s = lifecycle.toLowerCase()
  if (s === 'printing' || s === 'busy') return 'bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]'
  if (s === 'waiting' || s === 'reconnecting' || s === 'connecting') return 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.5)]'
  if (s === 'warning' || s === 'thermal warning') return 'bg-yellow-400 animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.5)]'
  if (s === 'error' || s === 'paper out' || s === 'ribbon out' || s === 'head open' || s === 'buffer full') return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
  return 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]'
}

function lifecycleLabel(lifecycle: string, isOnline: boolean): string {
  if (!isOnline) return 'Offline'
  return lifecycle
}

function lifecycleLabelCls(lifecycle: string, isOnline: boolean): string {
  if (!isOnline) return 'text-red-400 opacity-60'
  const s = lifecycle.toLowerCase()
  if (s === 'printing' || s === 'busy') return 'text-indigo-400'
  if (s === 'waiting' || s === 'reconnecting' || s === 'connecting') return 'text-amber-400'
  if (s === 'warning' || s === 'thermal warning') return 'text-yellow-400'
  if (s === 'error' || s === 'paper out' || s === 'ribbon out' || s === 'head open' || s === 'buffer full') return 'text-red-500 font-bold'
  return 'text-emerald-400'
}

function cardBorderCls(lifecycle: string, isOnline: boolean, active: boolean): string {
  if (!isOnline) return 'border-red-500/10 bg-red-500/[0.01] opacity-60'
  const s = lifecycle.toLowerCase()
  const isFault = s === 'error' || s === 'paper out' || s === 'ribbon out' || s === 'head open' || s === 'buffer full'
  
  if (isFault) return 'border-red-500/40 bg-red-500/[0.04]'
  if (s === 'warning' || s === 'thermal warning') return 'border-yellow-500/30 bg-yellow-500/[0.03]'
  if (s === 'printing' || s === 'busy') return 'border-indigo-500/40 bg-indigo-500/[0.04]'
  if (s === 'waiting' || s === 'reconnecting' || s === 'connecting') return 'border-amber-500/30 bg-amber-500/[0.03]'
  
  if (active) return 'bg-emerald-500/[0.03] dark:bg-emerald-500/[0.06] border-emerald-500/30 dark:border-emerald-500/40'
  return 'bg-card border-border hover:border-border-strong'
}

function cardTopBar(lifecycle: string, isOnline: boolean): string {
  if (!isOnline) return 'from-red-500/30 to-red-400/5'
  const s = lifecycle.toLowerCase()
  if (s === 'printing' || s === 'busy') return 'from-indigo-500/50 to-indigo-400/10'
  if (s === 'waiting' || s === 'reconnecting' || s === 'connecting') return 'from-amber-500/40 to-amber-400/10'
  if (s === 'warning' || s === 'thermal warning') return 'from-yellow-500/40 to-yellow-400/10'
  if (s === 'error' || s === 'paper out' || s === 'ribbon out' || s === 'head open' || s === 'buffer full') return 'from-red-500/60 to-red-400/20'
  return 'from-emerald-500/50 to-emerald-400/10'
}

function PrinterCard({
  printer,
  liveStatus,
  onActivate,
  onDeactivate,
  onShowDetails,
  onRefresh,
}: {
  printer: ReadyPrinter
  liveStatus?: DeviceStatusLive
  onActivate: (p: ReadyPrinter) => void
  onDeactivate: (p: ReadyPrinter) => void
  onShowDetails: (p: ReadyPrinter) => void
  onRefresh?: () => void
}) {
  const active = printer.isActiveForWork
  const { isOnline, lifecycle } = resolveLifecycle(printer, liveStatus)
  const dotCls   = lifecycleDot(lifecycle, isOnline)
  const label    = lifecycleLabel(lifecycle, isOnline)
  const labelCls = lifecycleLabelCls(lifecycle, isOnline)
  const border   = cardBorderCls(lifecycle, isOnline, active)
  const topBar   = cardTopBar(lifecycle, isOnline)

  const [retryCountdown, setRetryCountdown] = useState(10)
  const [retrying, setRetrying] = useState(false)

  const handleRetrySilent = useCallback(async () => {
    try {
      await printerApi.testConnection(printer.printerCode)
      onRefresh?.()
    } catch {
      // ignore
    }
  }, [printer.printerCode, onRefresh])

  // Automatic retry countdown when offline
  useEffect(() => {
    if (isOnline) {
      setRetryCountdown(10)
      return
    }
    const timer = setInterval(() => {
      setRetryCountdown(prev => {
        if (prev <= 1) {
          handleRetrySilent()
          return 10
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [isOnline, handleRetrySilent])

  const handleRetryClick = async () => {
    setRetrying(true)
    try {
      await printerApi.testConnection(printer.printerCode)
      onRefresh?.()
      setRetryCountdown(10)
    } catch (err) {
      console.error("Manual retry failed:", err)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className={`rounded-xl p-5 flex flex-col gap-3.5 transition-all relative overflow-hidden border shadow-sm ${border}`}>
      {/* top accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${topBar}`} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9.5 h-9.5 rounded-lg flex items-center justify-center shrink-0 ${
            !isOnline ? 'bg-red-500/10 text-red-400'
            : lifecycle.toLowerCase() === 'printing' || lifecycle.toLowerCase() === 'busy'
              ? 'bg-indigo-500/10 text-indigo-400'
              : active ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400'
              : 'bg-brand/10 text-brand-light'
          }`}>
            <Printer size={18} />
          </div>
          <div>
            <div className="font-bold text-sm text-foreground">{printer.displayName}</div>
            <div className="text-[11px] text-muted-fg font-mono tracking-tight mt-0.5">{printer.printerCode}</div>
          </div>
        </div>
        {/* Live status badge */}
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`} />
          <span className={`text-[10px] font-extrabold uppercase tracking-wider ${labelCls}`}>
            {label}
          </span>
        </div>
      </div>

      {!active && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-[11px] px-2.5 py-0.5 rounded-md font-mono bg-brand/5 border border-brand/10 text-brand-light font-medium">
            {printer.ipAddress}:{printer.port}
          </span>
          <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-muted text-muted-fg border border-border font-medium">
            {printer.protocol} · {printer.driverType}
          </span>
        </div>
      )}

      {/* Fault Banners */}
      {isOnline && lifecycle === 'Paper Out' && (
        <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs flex flex-col gap-0.5">
          <div className="font-bold flex items-center gap-1">
            <span>🟠 Hết giấy (Paper Roll Empty)</span>
          </div>
          <div className="text-[10px] text-muted-fg leading-normal">Thay giấy mới vào máy in để tiếp tục.</div>
        </div>
      )}

      {isOnline && lifecycle === 'Head Open' && (
        <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs flex flex-col gap-0.5">
          <div className="font-bold flex items-center gap-1">
            <span>🟠 Đầu in đang mở (Print Head Open)</span>
          </div>
          <div className="text-[10px] text-muted-fg leading-normal">Đóng khay đầu in của máy in lại.</div>
        </div>
      )}

      {isOnline && lifecycle === 'Ribbon Out' && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex flex-col gap-0.5">
          <div className="font-bold flex items-center gap-1">
            <span>🔴 Hết mực (Ribbon Empty)</span>
          </div>
          <div className="text-[10px] text-muted-fg leading-normal">Thay cuộn ruy-băng mực mới.</div>
        </div>
      )}

      {isOnline && lifecycle === 'Buffer Full' && (
        <div className="px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/25 text-yellow-600 dark:text-yellow-400 text-xs flex flex-col gap-0.5">
          <div className="font-bold flex items-center gap-1">
            <span>🟡 Bộ nhớ đầy (Buffer Full)</span>
          </div>
          <div className="text-[10px] text-muted-fg leading-normal">Đang tự động thử lại sau vài giây...</div>
        </div>
      )}

      {isOnline && lifecycle === 'Thermal Warning' && (
        <div className="px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/25 text-yellow-600 dark:text-yellow-400 text-xs flex flex-col gap-0.5">
          <div className="font-bold flex items-center gap-1">
            <span>🟡 Cảnh báo quá nhiệt (Thermal Warning)</span>
          </div>
          <div className="text-[10px] text-muted-fg leading-normal">Đầu in quá nóng, tiến trình in tạm dừng để hạ nhiệt.</div>
        </div>
      )}

      {!isOnline && (
        <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex flex-col gap-2">
          <div className="font-bold flex items-center justify-between">
            <span>🔴 Mất kết nối (Printer Offline)</span>
            <span className="font-mono text-[9px] bg-red-500/15 px-1.5 py-0.5 rounded">Thử lại sau {retryCountdown}s</span>
          </div>
          <button
            disabled={retrying}
            onClick={handleRetryClick}
            className="w-full py-1.5 rounded bg-red-500 hover:bg-red-600 text-white font-bold text-xs disabled:opacity-50 transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            {retrying ? 'Đang kết nối...' : 'Thử lại ngay'}
          </button>
        </div>
      )}

      <div className="flex gap-2.5 mt-2">
        <button
          onClick={() => onShowDetails(printer)}
          className="flex-1 py-2 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 text-foreground text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          Chi tiết
        </button>
        {active ? (
          <button
            onClick={() => onDeactivate(printer)}
            className="flex-1 py-2 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <XCircle size={13} /> Gỡ sản xuất
          </button>
        ) : (
          <button
            disabled={!isOnline}
            onClick={() => onActivate(printer)}
            className="flex-1 py-2 rounded-lg border border-brand/20 bg-brand/5 hover:bg-brand/10 text-brand-light text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircle size={13} /> Thêm sản xuất
          </button>
        )}
      </div>
    </div>
  )
}

export function PrinterManagementTab({ deviceStatuses = [] }: { deviceStatuses?: DeviceStatusLive[] }) {
  /** Build a lookup map from printerCode (case-insensitive) → live status */
  const liveMap = new Map<string, DeviceStatusLive>()
  for (const d of deviceStatuses) liveMap.set(d.deviceId.toLowerCase(), d)
  const [printers, setPrinters] = useState<ReadyPrinter[]>([])
  const [simulationPrinters, setSimulationPrinters] = useState<ReadyPrinter[]>([])
  const [showSimulation, setShowSimulation] = useState(false)
  const [templates, setTemplates] = useState<LabelTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [activating, setActivating] = useState<ReadyPrinter | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [activateLoading, setActivateLoading] = useState(false)
  const [activateError, setActivateError] = useState<string | null>(null)

  // Confirm / Details states
  const [deactivatingPrinter, setDeactivatingPrinter] = useState<ReadyPrinter | null>(null)
  const [activatingPrinterConfirm, setActivatingPrinterConfirm] = useState<{ printer: ReadyPrinter, templateId: string } | null>(null)
  const [detailedPrinter, setDetailedPrinter] = useState<ReadyPrinter | null>(null)
  const [maintenanceInfo, setMaintenanceInfo] = useState<any | null>(null)

  useEffect(() => {
    if (!detailedPrinter) {
      setMaintenanceInfo(null)
      return
    }
    let active = true
    const loadMaintenance = async () => {
      try {
        const res = await templateApi.getPrinterMaintenance(detailedPrinter.printerCode)
        if (active) {
          setMaintenanceInfo(res.data)
        }
      } catch (err) {
        console.error("Failed to load maintenance info:", err)
      }
    }
    loadMaintenance()
    return () => { active = false }
  }, [detailedPrinter])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [readyRes, activeRes, simRes] = await Promise.all([
        templateApi.getPrintersReady(),        // production printers only
        templateApi.getPrintersActive(),
        templateApi.getPrintersSimulation(),   // includes simulation for separate section
      ])
      const readyArr = Array.isArray(readyRes.data) ? readyRes.data : []
      const activeArr = Array.isArray(activeRes.data) ? activeRes.data : []
      const simArr = Array.isArray(simRes.data) ? simRes.data : []

      // Merge ready + active for production printers
      const activeMap = new Map<string, ReadyPrinter>()
      for (const p of activeArr) activeMap.set(p.printerCode, p)
      const merged: ReadyPrinter[] = readyArr.map((p: ReadyPrinter) =>
        activeMap.has(p.printerCode) ? activeMap.get(p.printerCode)! : p,
      )
      for (const [code, p] of activeMap.entries()) {
        if (!merged.find(r => r.printerCode === code)) merged.push(p)
      }
      setPrinters(merged)

      // Simulation printers = all (with simulation) minus production printers
      const allCodes = new Set(merged.map(p => p.printerCode))
      const simOnly = simArr.filter((p: ReadyPrinter) =>
        p.driverType === 'simulation' && !allCodes.has(p.printerCode)
      )
      setSimulationPrinters(simOnly)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err?.response?.data?.error ?? err?.message ?? 'Không thể tải danh sách máy in')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await templateApi.list({ status: 'published' })
      setTemplates(res.data ?? [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchData()
    fetchTemplates()
    const id = setInterval(fetchData, 15_000)
    return () => clearInterval(id)
  }, [fetchData, fetchTemplates])

  const openActivate = (printer: ReadyPrinter) => {
    setActivating(printer)
    setSelectedTemplateId('')
    setActivateError(null)
  }

  const handleTemplateSelected = () => {
    if (!activating || !selectedTemplateId) {
      setActivateError('Vui lòng chọn mẫu nhãn trước')
      return
    }
    setActivatingPrinterConfirm({ printer: activating, templateId: selectedTemplateId })
    setActivating(null)
  }

  const deactivate = async (code: string) => {
    try {
      await templateApi.deactivatePrinter(code)
      await fetchData()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err?.response?.data?.error ?? err?.message ?? 'Gỡ máy in thất bại')
    }
  }

  const activePrinters  = printers.filter(p => p.isActiveForWork)
  const readyPrinters   = printers.filter(p => !p.isActiveForWork)

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <style>{"@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"}</style>

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-dark to-brand flex items-center justify-center text-white shrink-0">
              <Printer size={18} />
            </div>
            Quản lý thiết bị in
          </h2>
          <p className="text-xs text-muted-fg mt-1 ml-11 leading-relaxed">
            Thiết bị sẵn sàng kết nối từ printer-adapter — kích hoạt và gán mẫu nhãn in để đưa vào hoạt động sản xuất.
          </p>
        </div>
        <button
          onClick={fetchData} disabled={loading}
          className="px-4 py-2 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 text-muted-fg hover:text-foreground text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium">
          {error}
        </div>
      )}

      {/* ── Active printers ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Zap size={14} />
          </div>
          <h3 className="text-sm font-bold text-foreground">Máy in đang sản xuất</h3>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
            activePrinters.length > 0 ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' : 'bg-muted text-muted-fg'
          }`}>
            {activePrinters.length}
          </span>
        </div>
        {activePrinters.length === 0 ? (
          <div className="py-12 text-center rounded-xl border border-dashed border-border text-muted-fg text-sm flex flex-col items-center justify-center gap-2 bg-surface-2/20">
            <Printer size={32} className="text-muted-fg/30" />
            <div>
              <p className="font-medium text-foreground">Chưa có máy in nào được kích hoạt</p>
              <p className="text-xs mt-1">Kích hoạt thiết bị từ danh sách sẵn sàng bên dưới để bắt đầu nhận lệnh in.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {activePrinters.map(p => (
              <PrinterCard key={p.printerCode} printer={p} liveStatus={liveMap.get(p.printerCode.toLowerCase())} onActivate={openActivate} onDeactivate={setDeactivatingPrinter} onShowDetails={setDetailedPrinter} onRefresh={fetchData} />
            ))}
          </div>
        )}
      </section>

      {/* ── Ready printers ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand/10 text-brand-light flex items-center justify-center shrink-0">
            <Layers size={14} />
          </div>
          <h3 className="text-sm font-bold text-foreground">Thiết bị sẵn sàng (online)</h3>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-brand/15 text-brand-light">
            {readyPrinters.length}
          </span>
        </div>
        {loading && printers.length === 0 ? (
          <div className="py-12 text-center text-muted-fg text-sm flex flex-col items-center justify-center gap-3">
            <RefreshCw size={24} className="animate-spin text-brand" />
            <p className="text-xs">Đang quét tìm thiết bị kết nối...</p>
          </div>
        ) : readyPrinters.length === 0 ? (
          <div className="py-12 text-center rounded-xl border border-dashed border-border text-muted-fg text-sm flex flex-col items-center justify-center gap-2 bg-surface-2/20">
            <WifiOff size={32} className="text-muted-fg/30" />
            <div>
              <p className="font-medium text-foreground">Không có thiết bị sẵn sàng</p>
              <p className="text-xs mt-1">Đảm bảo rằng printer-adapter đang chạy và máy in được kết nối mạng.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {readyPrinters.map(p => (
              <PrinterCard key={p.printerCode} printer={p} liveStatus={liveMap.get(p.printerCode.toLowerCase())} onActivate={openActivate} onDeactivate={setDeactivatingPrinter} onShowDetails={setDetailedPrinter} onRefresh={fetchData} />
            ))}
          </div>
        )}
      </section>

      {/* ── Simulation devices (collapsed by default) ── */}
      {simulationPrinters.length > 0 && (
        <section className="space-y-3">
          <button
            onClick={() => setShowSimulation(s => !s)}
            className="flex items-center gap-2.5 w-full text-left group cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <FlaskConical size={14} />
            </div>
            <h3 className="text-sm font-bold text-muted-fg group-hover:text-foreground transition-colors">
              Thiết bị mô phỏng
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/10 text-amber-500">
              {simulationPrinters.length}
            </span>
            <span className="ml-auto text-muted-fg group-hover:text-foreground transition-colors">
              {showSimulation ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </button>

          {!showSimulation && (
            <p className="text-xs text-muted-fg ml-9 leading-relaxed">
              {simulationPrinters.length} thiết bị mô phỏng đang chạy từ device-simulator — click để xem.
              Các thiết bị này không dùng cho sản xuất thực tế.
            </p>
          )}

          {showSimulation && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-in fade-in duration-200">
              {simulationPrinters.map(p => (
                <div
                  key={p.printerCode}
                  className="rounded-xl p-5 flex flex-col gap-3 border border-amber-500/15 bg-amber-500/[0.03] opacity-80"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-500">
                        <FlaskConical size={16} />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-foreground">{p.displayName}</div>
                        <div className="text-[11px] text-muted-fg font-mono tracking-tight mt-0.5">{p.printerCode}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
                      Simulation
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-[11px] px-2.5 py-0.5 rounded-md font-mono bg-muted border border-border text-muted-fg">
                      {p.ipAddress}:{p.port}
                    </span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-muted border border-border text-muted-fg">
                      {p.protocol} · {p.driverType}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-fg leading-relaxed">
                    Thiết bị mô phỏng — dùng trong môi trường phát triển / kiểm thử.
                    Không thể kích hoạt cho sản xuất.
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Activate modal ── */}
      <Dialog open={activating !== null} onOpenChange={open => { if (!open) setActivating(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground font-bold flex items-center gap-2.5">
              <Printer size={18} className="text-brand-light" />
              Chọn mẫu nhãn cho {activating?.displayName}
            </DialogTitle>
            <DialogDescription className="text-muted-fg text-xs mt-1">
              Bắt buộc gán mẫu thiết kế tem nhãn (ZPL Template) trước khi kích hoạt thiết bị đưa vào sản xuất.
            </DialogDescription>
          </DialogHeader>

          {activateError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium">
              {activateError}
            </div>
          )}

          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto py-1 pr-1">
            {templates.length === 0 ? (
              <div className="text-muted-fg text-xs text-center py-6">
                Không tìm thấy mẫu nhãn thiết kế nào khả dụng.
              </div>
            ) : templates.map(t => {
              const sel = t.id === selectedTemplateId
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`p-3.5 rounded-lg border text-left flex items-center justify-between w-full transition-all cursor-pointer ${
                    sel
                      ? 'border-brand bg-brand/5 text-brand-light'
                      : 'border-border bg-surface-2/50 hover:bg-surface-3 text-muted-fg hover:text-foreground'
                  }`}
                >
                  <div>
                    <div className={`text-xs font-bold ${sel ? 'text-brand-light' : 'text-foreground'}`}>{t.name}</div>
                    <div className="text-[10px] text-muted-fg mt-1">
                      {t.labelWidth}x{t.labelHeight} mm · {t.dpi} DPI · Phiên bản v{t.version}
                    </div>
                  </div>
                  {sel && <CheckCircle2 size={16} className="text-brand-light" />}
                </button>
              )
            })}
          </div>

          <DialogFooter className="gap-2.5">
            <Button variant="outline" onClick={() => setActivating(null)}>
              Hủy
            </Button>
            <Button
              onClick={handleTemplateSelected}
              disabled={!selectedTemplateId}
              className="bg-brand hover:bg-brand-dark text-white font-bold"
            >
              Tiếp tục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Activate modal ── */}
      <Dialog open={activatingPrinterConfirm !== null} onOpenChange={open => { if (!open) setActivatingPrinterConfirm(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground font-bold flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-500" />
              Xác nhận thêm vào sản xuất
            </DialogTitle>
            <DialogDescription className="text-muted-fg text-xs leading-relaxed mt-1">
              Bạn có chắc chắn muốn kích hoạt thiết bị <strong className="text-foreground font-bold">{activatingPrinterConfirm?.printer.displayName}</strong> với mẫu nhãn <strong className="text-brand-light font-bold">{templates.find(t => t.id === activatingPrinterConfirm?.templateId)?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => {
              if (activatingPrinterConfirm) {
                setActivating(activatingPrinterConfirm.printer)
                setSelectedTemplateId(activatingPrinterConfirm.templateId)
              }
              setActivatingPrinterConfirm(null)
            }}>
              Quay lại
            </Button>
            <Button
              onClick={async () => {
                if (activatingPrinterConfirm) {
                  setActivateLoading(true)
                  setActivateError(null)
                  try {
                    await templateApi.activatePrinter(activatingPrinterConfirm.printer.printerCode, activatingPrinterConfirm.templateId)
                    setActivatingPrinterConfirm(null)
                    await fetchData()
                  } catch (e: unknown) {
                    const err = e as { response?: { data?: { error?: string } }; message?: string }
                    setActivateError(err?.response?.data?.error ?? err?.message ?? 'Kích hoạt máy in thất bại')
                    setActivating(activatingPrinterConfirm.printer)
                    setActivatingPrinterConfirm(null)
                  } finally {
                    setActivateLoading(false)
                  }
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-none"
            >
              {activateLoading ? 'Đang kích hoạt...' : 'Xác nhận & Thêm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Deactivate modal ── */}
      <Dialog open={deactivatingPrinter !== null} onOpenChange={open => { if (!open) setDeactivatingPrinter(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground font-bold flex items-center gap-2">
              <XCircle size={18} className="text-red-500" />
              Xác nhận gỡ khỏi sản xuất
            </DialogTitle>
            <DialogDescription className="text-muted-fg text-xs leading-relaxed mt-1">
              Bạn có chắc chắn muốn ngắt kết nối và gỡ thiết bị <strong className="text-foreground font-bold">{deactivatingPrinter?.displayName}</strong> khỏi danh sách in sản xuất hiện tại không?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeactivatingPrinter(null)}>
              Hủy
            </Button>
            <Button
              onClick={async () => {
                if (deactivatingPrinter) {
                  await deactivate(deactivatingPrinter.printerCode)
                  setDeactivatingPrinter(null)
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold border-none"
            >
              Xác nhận gỡ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Details modal ── */}
      <Dialog open={detailedPrinter !== null} onOpenChange={open => { if (!open) setDetailedPrinter(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground font-bold flex items-center gap-2.5">
              <Printer size={18} className="text-brand-light" />
              Bảng bảo trì thiết bị (Maintenance & Diagnostics)
            </DialogTitle>
            <DialogDescription className="text-muted-fg text-xs mt-1">
              Thông tin chi tiết về phần cứng, mã số seri, số lượng in tích lũy và kiểm soát nhiệt độ từ driver của máy {detailedPrinter?.displayName}.
            </DialogDescription>
          </DialogHeader>

          {detailedPrinter && (() => {
            const detailedPrinterLiveStatus = liveMap.get(detailedPrinter.printerCode.toLowerCase());
            const { isOnline: isDetailedOnline } = resolveLifecycle(detailedPrinter, detailedPrinterLiveStatus);
            return (
              <div className="flex flex-col gap-5 mt-3 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-fg font-extrabold">Trạng thái kết nối</span>
                    <div className="text-sm font-semibold flex items-center gap-2 text-foreground">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        isDetailedOnline
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-red-500'
                      }`} />
                      {isDetailedOnline ? 'ONLINE (TCP/IP)' : 'OFFLINE'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-fg font-extrabold">Mã máy in (Code)</span>
                    <div className="text-sm font-bold text-foreground">
                      {detailedPrinter.printerCode}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-fg font-extrabold">Số Seri (Serial Number)</span>
                    <div className="text-sm font-bold font-mono text-brand-light">
                      {isDetailedOnline 
                        ? (maintenanceInfo?.serialNumber || 'Đang đọc...') 
                        : (maintenanceInfo?.serialNumber ? `${maintenanceInfo.serialNumber} (Lưu trữ)` : 'N/A')}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-fg font-extrabold">Kết nối vật lý</span>
                    <div className="text-sm font-medium text-foreground">
                      {detailedPrinter.ipAddress}:{detailedPrinter.port} ({detailedPrinter.protocol.toUpperCase()} · {detailedPrinter.driverType})
                    </div>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-4 pt-3.5 border-t border-border mt-1">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-fg font-extrabold">Đã in trọn đời (Lifetime Count)</span>
                      <div className="text-base font-extrabold text-foreground font-mono">
                        {isDetailedOnline 
                          ? (maintenanceInfo?.lifetimePrintLength !== undefined ? `${maintenanceInfo.lifetimePrintLength} nhãn` : 'Đang đọc...') 
                          : 'N/A (Ngoại tuyến)'}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-fg font-extrabold">Nhiệt độ đầu in (Thermal Temp)</span>
                      <div className={`text-base font-extrabold font-mono flex items-center gap-1.5 ${
                        isDetailedOnline && maintenanceInfo?.thermalWarning ? 'text-red-500' : 'text-emerald-500'
                      }`}>
                        {isDetailedOnline 
                          ? (maintenanceInfo?.currentTemperature !== undefined ? `${maintenanceInfo.currentTemperature}°C` : 'Đang đọc...') 
                          : 'N/A (Ngoại tuyến)'}
                        {isDetailedOnline && maintenanceInfo?.thermalWarning && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 animate-pulse">Quá nhiệt</span>}
                      </div>
                    </div>
                  </div>

                  {detailedPrinter.isActiveForWork && detailedPrinter.activeTemplateName && (
                    <div className="col-span-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                      <Tag size={12} className="shrink-0" />
                      <span>Mẫu nhãn hoạt động: {detailedPrinter.activeTemplateName}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <DialogFooter className="mt-3">
            <Button onClick={() => setDetailedPrinter(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
