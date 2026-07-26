import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useDashboard, ProductionRecord } from '@/hooks/useDashboard'
import { useProductionRecords } from '@/hooks/useProductionRecords'
import client, { rbacApi, jobsApi, commandsApi } from '@/api/client'
import { DispatchDialog, DispatchTarget } from '@/components/DispatchDialog'
import { useAuth } from '@/context/AuthContext'
import { PROTECTED_ADMIN_USERNAME, CREATABLE_ROLES } from '@/constants/roles'
import { translatePermission, translateRole, translateJobType } from '@/lib/utils'
import { LabelPreview } from '@/components/LabelPreview'
import { LabelTemplatesTab } from '@/components/LabelTemplatesTab'
import { PrinterManagementTab } from '@/components/PrinterManagementTab'
import type { DeviceStatusLive } from '@/components/PrinterManagementTab'
import { StationActivityLog } from '@/components/StationActivityLog'
import { ProductionExecutionDetailModal } from '@/components/ProductionExecutionDetailModal'
import { AlarmCenterTab } from '@/components/AlarmCenterTab'
import { useLastProductionExecution } from '@/stores/lastProductionExecutionStore'
import type { Alarm } from '@/hooks/useDashboard'

// Icons
import {
  Users, LayoutDashboard, Key, Trash2, Plus,
  CheckCircle2, ShieldAlert, LogOut, UserCheck, Wifi, WifiOff,
  Flame, Cpu, Printer as PrinterIcon, Zap, Camera, Clock,
  Filter, RefreshCw, History, Database,
  Shield, User, UserX, MoreVertical,
  Search, Settings, AlertTriangle, LineChart, CheckCircle, Sun, Moon
} from 'lucide-react'

// Common Components
import { StatusBadge } from '@/components/StatusBadge'
import { PermissionBadge } from '@/components/PermissionBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'

// UI primitives
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import {
  Table as TableEl, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

import { FileText, FlaskConical, ChevronDown, ChevronRight } from 'lucide-react'
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

type KioskTab = 'dashboard' | 'history' | 'traceability' | 'orders' | 'alarms' | 'config' | 'diagnostics' | 'connectivity' | 'rbac' | 'templates' | 'printers'

// ── Simulation device collapsible section ──────────────────────────────────
function SimulationDeviceSection({ devices: simDevices, relativeTime }: {
  devices: any[]
  relativeTime: (iso: string) => string
}) {
  const [open, setOpen] = useState(false)
  if (simDevices.length === 0) return null

  const onlineCount = simDevices.filter((d: any) => d.isOnline).length
  const offlineCount = simDevices.length - onlineCount

  return (
    <section className="space-y-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 w-full text-left group cursor-pointer"
      >
        <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
          <FlaskConical size={14} />
        </div>
        <span className="text-sm font-bold text-muted-fg group-hover:text-foreground transition-colors">
          Thiết bị mô phỏng
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/10 text-amber-500">
          {simDevices.length}
        </span>
        {offlineCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-red-500/10 text-red-400">
            {offlineCount} offline
          </span>
        )}
        <span className="ml-auto text-muted-fg group-hover:text-foreground transition-colors">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {!open && (
        <p className="text-xs text-muted-fg ml-9 leading-relaxed">
          {simDevices.length} máy in mô phỏng — {onlineCount} online, {offlineCount} offline. Click để xem chi tiết.
        </p>
      )}
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in duration-200">
          {simDevices.map((d: any) => (
            <div key={d.deviceId}
              className={`rounded-xl p-4 border flex flex-col gap-2 transition-all duration-300 ${
                d.isOnline
                  ? 'border-amber-500/20 bg-amber-500/[0.04]'
                  : 'border-white/5 bg-white/[0.02] opacity-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  d.isOnline ? 'bg-amber-500/10 text-amber-500' : 'bg-white/5 text-muted-fg'
                }`}>
                  <FlaskConical size={15} />
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Online/Offline dot badge */}
                  <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    d.isOnline
                      ? 'text-emerald-400 bg-emerald-400/10'
                      : 'text-red-400 bg-red-400/10'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      d.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                    }`} />
                    {d.isOnline ? 'Online' : 'Offline'}
                  </span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 uppercase tracking-wider">
                    Simulation
                  </span>
                </div>
              </div>
              <p className={`font-extrabold text-sm ${d.isOnline ? 'text-foreground' : 'text-muted-fg'}`}>
                {d.deviceId.toUpperCase()}
              </p>
              <p className="text-[10px] text-muted-fg/60 font-mono">{relativeTime(d.lastSeenAt)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}


export default function DashboardPage() {
  const stationId = 'STATION-01'
  const navigate = useNavigate()
  const { user: currentUser, logout } = useAuth()
  const [signalRAlarm, setSignalRAlarm] = useState<Alarm | null>(null)
  const [alarmBannerCount, setAlarmBannerCount] = useState(0)
  const { isConnected, production, devices, todayRecords } = useDashboard(stationId, (alarm) => {
    setSignalRAlarm(alarm)
    // Bump banner count when a new active alarm arrives via SignalR
    if (alarm.currentState === 'Active') setAlarmBannerCount(prev => prev + 1)
  })
  const lastExecution = useLastProductionExecution()
  void lastExecution
  const gatewayDevice = devices.find((d: any) => d.deviceId === 'gateway-01')
  const isGatewayOnline = gatewayDevice?.isOnline ?? false
  const { historyData, loading: loadingHistory, error: historyError, fetchHistory } = useProductionRecords()

  // Fetch active alarm count for the persistent banner
  const baseProjectionUrl = import.meta.env.VITE_PROJECTION_URL ||
    `${window.location.protocol}//${window.location.host}`
  useEffect(() => {
    const fetchCount = () =>
      fetch(`${baseProjectionUrl}/api/projection/alarms/count`)
        .then(r => r.json())
        .then(d => setAlarmBannerCount(d.active ?? 0))
        .catch(() => {})
    fetchCount()
    const timer = setInterval(fetchCount, 30_000)
    return () => clearInterval(timer)
  }, [baseProjectionUrl])

  const [tab, setTab] = useState<KioskTab>('dashboard')
  const [connectivitySubTab, setConnectivitySubTab] = useState<'devices' | 'printers' | 'plc' | 'camera'>('devices')
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('kiosk-theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('kiosk-theme', theme);
  }, [theme]);

  // RBAC states
  const [users, setUsers] = useState<any[]>([])
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([])
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [userPermDraft, setUserPermDraft] = useState<string[]>([])
  const [userToDelete, setUserToDelete] = useState<any | null>(null)
  const [newUsername, setNewUsername] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('MEMBER')
  const [rbacError, setRbacError] = useState('')
  const [rbacSuccess, setRbacSuccess] = useState('')

  // Traceability states
  const [searchSerial, setSearchSerial] = useState('')
  const [traceResult, setTraceResult] = useState<any>(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [traceError, setTraceError] = useState('')

  // Diagnostics / Health / Metrics states
  const [diagnosticsHealth, setDiagnosticsHealth] = useState<any>(null)
  const [diagnosticsMetrics, setDiagnosticsMetrics] = useState<any>(null)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)

  // Configuration settings states
  const [configParams, setConfigParams] = useState<any[]>([])
  const [configLoading, setConfigLoading] = useState(false)
  const [configEditingKey, setConfigEditingKey] = useState<string | null>(null)
  const [configEditingValue, setConfigEditingValue] = useState('')

  // Production Orders states
  const [orders, setOrders] = useState<any[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [orderItems, setOrderItems] = useState<any[]>([])
  const [orderItemsLoading, setOrderItemsLoading] = useState(false)
  const [orderModalOpen, setOrderModalOpen] = useState(false)

  // Dispatch Dialog states
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false)
  const [dispatchLoading, setDispatchLoading] = useState(false)
  const [dispatchResult, setDispatchResult] = useState<{ success: boolean; dispatched: number; total: number; target: string } | null>(null)

  const fetchOrders = async () => {
    setOrdersLoading(true)
    try {
      const res = await client.get('/projection/orders')
      setOrders(res.data || [])
    } catch (err) {
      console.error('Failed to fetch production orders:', err)
    } finally {
      setOrdersLoading(false)
    }
  }

  const fetchOrderItems = async (orderNo: string) => {
    setOrderItemsLoading(true)
    setDispatchResult(null)
    try {
      const res = await client.get(`/projection/orders/${orderNo}/items`)
      setOrderItems(res.data || [])
    } catch (err) {
      console.error('Failed to fetch order items:', err)
    } finally {
      setOrderItemsLoading(false)
    }
  }

  const handleConfirmDispatch = useCallback(async (target: DispatchTarget, notes: string) => {
    if (!selectedOrder) return
    setDispatchLoading(true)
    setDispatchResult(null)
    try {
      const res = await commandsApi.dispatchOrder({
        orderNo: selectedOrder.orderNo,
        dispatchTarget: target,
        notes
      })
      setDispatchResult({
        success: true,
        dispatched: res.data.dispatched,
        total: res.data.total,
        target
      })
      setDispatchDialogOpen(false)
      // Refresh items to show updated statuses
      await fetchOrderItems(selectedOrder.orderNo)
    } catch (err: any) {
      setDispatchResult({ success: false, dispatched: 0, total: 0, target })
    } finally {
      setDispatchLoading(false)
    }
  }, [selectedOrder])

  const handleOpenOrderDetail = async (order: any) => {
    setSelectedOrder(order)
    setOrderModalOpen(true)
    await fetchOrderItems(order.orderNo)
  }

  const fetchDiagnostics = async () => {
    setDiagnosticsLoading(true)
    try {
      const [hRes, mRes] = await Promise.all([
        client.get('/projection/diagnostics/health'),
        client.get('/projection/diagnostics/metrics')
      ])
      setDiagnosticsHealth(hRes.data)
      setDiagnosticsMetrics(mRes.data)
    } catch (err) {
      console.error('Failed to fetch diagnostics:', err)
    } finally {
      setDiagnosticsLoading(false)
    }
  }

  const fetchConfigParams = async () => {
    setConfigLoading(true)
    try {
      const res = await client.get('/projection/config')
      setConfigParams(res.data || [])
    } catch (err) {
      console.error('Failed to fetch config params:', err)
    } finally {
      setConfigLoading(false)
    }
  }

  const handleSaveConfig = async (key: string, value: string) => {
    try {
      await client.put(`/projection/config/${key}`, { value })
      setConfigParams(prev => prev.map(c => c.key === key ? { ...c, value } : c))
      setConfigEditingKey(null)
    } catch (err) {
      console.error('Failed to update config parameter:', err)
    }
  }


  const handleTraceSearch = async () => {
    if (!searchSerial.trim()) return
    setTraceLoading(true)
    setTraceError('')
    setTraceResult(null)
    try {
      const res = await client.get(`/api/jobs?page=1&pageSize=1&serial=${encodeURIComponent(searchSerial.trim())}`)
      if (res.data && res.data.items && res.data.items.length > 0) {
        const job = res.data.items[0]
        const attemptsRes = await client.get(`/api/jobs/${job.id}/attempts`)
        const attempts = attemptsRes.data || []
        const attemptsWithSteps = await Promise.all(attempts.map(async (att: any) => {
          const stepsRes = await client.get(`/api/jobs/attempts/${att.id}/steps`)
          return { ...att, steps: stepsRes.data || [] }
        }))
        setTraceResult({ job, attempts: attemptsWithSteps })
      } else {
        setTraceError('Không tìm thấy thông tin gia công cho số Serial này.')
      }
    } catch (err: any) {
      setTraceError('Đã xảy ra lỗi khi tìm kiếm thông tin truy xuất.')
    } finally {
      setTraceLoading(false)
    }
  }

  // Action dropdown states
  const [activeDropdownUserId, setActiveDropdownUserId] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null)
  const [userToToggleActive, setUserToToggleActive] = useState<any | null>(null)

  // Audit log timeline states
  const [auditLogUser, setAuditLogUser] = useState<any | null>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [isAuditLogsLoading, setIsAuditLogsLoading] = useState(false)

  // Password reset states
  const [resetPwdUser, setResetPwdUser] = useState<any | null>(null)
  const [newPasswordVal, setNewPasswordVal] = useState('')
  const [resetReason, setResetReason] = useState('')
  const [resetPwdConfirmOpen, setResetPwdConfirmOpen] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')

  // Permission update confirmation state
  const [permConfirmOpen, setPermConfirmOpen] = useState(false)

  // Manual Override confirmation state
  const [overrideConfirmOpen, setOverrideConfirmOpen] = useState(false)
  const [overrideConfirmData, setOverrideConfirmData] = useState<{
    title: string
    description: string
    type: string
  } | null>(null)


  // History states
  const [historyPage, setHistoryPage] = useState(1)
  const historyPageSize = 10
  const [historyFilters, setHistoryFilters] = useState(() => {
    const range = buildLast7DaysRange()
    return {
      status: '',
      productCode: '',
      workOrder: '',
      dateFrom: range.dateFrom,
      dateTo: range.dateTo
    }
  })

  // Detailed Record View State
  const [selectedRecord, setSelectedRecord] = useState<ProductionRecord | null>(null)

  // Reprint / Remark Overwrite Dialog States
  const [isReprintListOpen, setIsReprintListOpen] = useState(false)
  const [selectedReprintRecord, setSelectedReprintRecord] = useState<ProductionRecord | null>(null)
  const [reprintReasonCode, setReprintReasonCode] = useState('PRINT_QUALITY')
  const [reprintComment, setReprintComment] = useState('')
  const [reprintConfirmed, setReprintConfirmed] = useState(false)
  const [latestAttemptId, setLatestAttemptId] = useState<string>('none')
  const [reprintError, setReprintError] = useState('')
  const [reprintSuccess, setReprintSuccess] = useState('')
  const [submittingReprint, setSubmittingReprint] = useState(false)

  // History Detail Dialog States
  const [activeJobDetails, setActiveJobDetails] = useState<any>(null)
  const [_activeJobSteps, setActiveJobSteps] = useState<any[]>([])
  const [activeTemplate, setActiveTemplate] = useState<any>(null)

  // Helper to resolve variables from the active job
  const getResolvedData = (): Record<string, string> => {
    if (!activeJobDetails) return {
      production_order: '—',
      work_order: '—',
      workflow: '—',
      operation: '—',
      station: 'STATION-01',
      team: 'Team A',
      operator: currentUser?.username || 'admin.operator',
      product_name: '—',
      product_code: '—',
      revision: '—',
      customer: '—',
      material: '—',
      rubber_type: '—',
      lot_number: '—',
      batch_number: '—',
      manufacture_date: '—',
      expiry_date: '—',
      country: '—',
      serial_number: '—',
      trace_id: '—',
      planned_quantity: '0',
      completed_quantity: '0',
      remaining_quantity: '0',
      current_step: '—'
    }

    const parsedTags: Record<string, string> = {}
    try {
      const payload = JSON.parse(activeJobDetails.payloadJson)
      if (payload.data && Array.isArray(payload.data)) {
        payload.data.forEach((item: any) => {
          if (item.tag) {
            parsedTags[item.tag] = String(item.value ?? '')
            const simpleKey = item.tag.split('.').pop()
            if (simpleKey && !parsedTags[simpleKey]) {
              parsedTags[simpleKey] = String(item.value ?? '')
            }
          }
        })
      }
      if (payload.event_id) {
        parsedTags['trace_id'] = payload.event_id
      }
    } catch (e) {
      console.warn("Failed to parse active job payloadJson", e)
    }

    const resolvedData: Record<string, string> = {
      production_order: activeJobDetails.jobNo,
      work_order: activeJobDetails.productSerial || 'N/A',
      workflow: 'Default Workflow',
      operation: activeJobDetails.jobType,
      station: 'STATION-01',
      team: 'Team A',
      operator: currentUser?.username || 'admin.operator',
      product_name: activeJobDetails.productCode + ' Industrial Part',
      product_code: activeJobDetails.productCode,
      revision: 'Rev A',
      customer: 'Won Seal Tech',
      material: 'NBR-70',
      rubber_type: 'Synthetic Rubber',
      lot_number: 'LOT-2026-07-A',
      batch_number: 'BATCH-01',
      manufacture_date: new Date(activeJobDetails.createdAt).toISOString().split('T')[0],
      expiry_date: new Date(new Date(activeJobDetails.createdAt).getTime() + 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      country: 'Vietnam',
      serial_number: activeJobDetails.productSerial || 'N/A',
      trace_id: activeJobDetails.id,
      planned_quantity: '100',
      completed_quantity: '0',
      remaining_quantity: '100',
      current_step: 'Step 1',
      ...parsedTags
    }

    // Apply explicit variables
    if (parsedTags['production.order_number']) resolvedData['production_order'] = parsedTags['production.order_number']
    if (parsedTags['production.workflow']) resolvedData['workflow'] = parsedTags['production.workflow']
    if (parsedTags['product.name']) resolvedData['product_name'] = parsedTags['product.name']
    if (parsedTags['product.revision']) resolvedData['revision'] = parsedTags['product.revision']
    if (parsedTags['customer.name']) resolvedData['customer'] = parsedTags['customer.name']
    if (parsedTags['product.material']) resolvedData['material'] = parsedTags['product.material']
    if (parsedTags['product.rubber_type']) resolvedData['rubber_type'] = parsedTags['product.rubber_type']
    if (parsedTags['product.lot']) resolvedData['lot_number'] = parsedTags['product.lot']
    if (parsedTags['product.batch']) resolvedData['batch_number'] = parsedTags['product.batch']
    if (parsedTags['product.mfg_date']) resolvedData['manufacture_date'] = parsedTags['product.mfg_date']
    if (parsedTags['product.exp_date']) resolvedData['expiry_date'] = parsedTags['product.exp_date']
    if (parsedTags['product.country']) resolvedData['country'] = parsedTags['product.country']
    if (parsedTags['marking.serial']) resolvedData['serial_number'] = parsedTags['marking.serial']
    if (parsedTags['production.planned_qty']) resolvedData['planned_quantity'] = parsedTags['production.planned_qty']
    if (parsedTags['production.completed_qty']) resolvedData['completed_quantity'] = parsedTags['production.completed_qty']
    if (parsedTags['production.remaining_qty']) resolvedData['remaining_quantity'] = parsedTags['production.remaining_qty']

    return resolvedData
  }

  // getVisionResult removed — Panel 6 (Camera Verification) moved out of Dashboard tab

  const fetchActiveTemplate = useCallback(() => {
    client.get('/label-templates/active')
      .then((res: any) => {
        setActiveTemplate(res.data)
      })
      .catch((err: any) => console.error("Error fetching active template:", err))
  }, [])

  // Fetch active template on mount
  useEffect(() => {
    fetchActiveTemplate()
  }, [fetchActiveTemplate])

  // Retry fetching active template every 10s if it's null
  useEffect(() => {
    if (activeTemplate) return
    const timer = setInterval(() => {
      if (!activeTemplate) {
        fetchActiveTemplate()
      }
    }, 10000)
    return () => clearInterval(timer)
  }, [activeTemplate, fetchActiveTemplate])

  // Fetch active job details, attempts & steps reactively
  useEffect(() => {
    let active = true;
    if (production?.jobId) {
      jobsApi.getById(production.jobId)
        .then((res: any) => {
          if (active) {
            setActiveJobDetails(res.data)
          }
        })
        .catch((err: any) => console.error("Error fetching active job details:", err))

      jobsApi.getAttempts(production.jobId)
        .then((res: any) => {
          if (!active) return;
          if (res.data && res.data.length > 0) {
            const latest = [...res.data].sort((a: any, b: any) => b.attemptNo - a.attemptNo)[0]
            jobsApi.getAttemptSteps(latest.id)
              .then((stepsRes: any) => {
                if (active) {
                  setActiveJobSteps(stepsRes.data)
                }
              })
              .catch((err: any) => console.error("Error fetching active job steps:", err))
          } else {
            if (active) {
              setActiveJobSteps([])
            }
          }
        })
        .catch((err: any) => {
          console.error("Error fetching active job attempts:", err)
          if (active) {
            setActiveJobSteps([])
          }
        })
    } else {
      if (active) {
        setActiveJobDetails(null)
        setActiveJobSteps([])
      }
    }
    return () => {
      active = false;
    };
  }, [production?.jobId, production?.jobStatus])


  // Note: label preview is now rendered client-side by <LabelPreview> from template JSON.
  // The Labelary HTTP pipeline (render → preview) has been removed — no state or effects needed.

  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [selectedDetailRecord, setSelectedDetailRecord] = useState<ProductionRecord | null>(null)
  // Note: detail dialog state (detailAttempts, detailPieces, etc.) has been moved
  // into ProductionExecutionDetailModal which manages its own loading state.

  const isSuperAdmin =
    currentUser?.roles?.includes('SUPER_ADMIN') ||
    currentUser?.permissions?.includes('SYSTEM_ADMIN')

  const canViewJobs =
    currentUser?.permissions?.includes('JOB_VIEW') || isSuperAdmin

  const canReprocess =
    currentUser?.permissions?.includes('JOB_REPROCESS') || isSuperAdmin

  const fetchRbacData = () => {
    if (!isSuperAdmin) return
    rbacApi.getUsers().then((res) => setUsers(res.data)).catch(console.error)
    rbacApi.getPermissions().then((res) => setAvailablePermissions(res.data)).catch(console.error)
  }

  useEffect(() => {
    if (!canViewJobs && (tab === 'dashboard' || tab === 'history')) {
      setTab('connectivity')
    }
  }, [currentUser, canViewJobs, tab])

  useEffect(() => {
    if (tab === 'rbac') fetchRbacData()
    if (tab === 'history' && canViewJobs) fetchHistory(historyPage, historyPageSize, historyFilters)
    if (tab === 'diagnostics') fetchDiagnostics()
    if (tab === 'config') fetchConfigParams()
    if (tab === 'orders') fetchOrders()
  }, [tab, currentUser, historyPage, historyFilters])

  // Click outside handler for actions dropdown
  useEffect(() => {
    if (!activeDropdownUserId) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.user-actions-dropdown') && !target.closest('.portal-dropdown-content')) {
        setActiveDropdownUserId(null);
        setDropdownPosition(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [activeDropdownUserId]);

  // Close actions dropdown on page scroll or viewport resize
  useEffect(() => {
    if (!activeDropdownUserId) return;
    const handleScrollOrResize = () => {
      setActiveDropdownUserId(null);
      setDropdownPosition(null);
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [activeDropdownUserId]);

  const showAuditLogs = async (user: any) => {
    setAuditLogUser(user)
    setIsAuditLogsLoading(true)
    try {
      const res = await rbacApi.getUserAuditLogs(user.id)
      setAuditLogs(res.data || [])
    } catch (err) {
      console.error('Failed to load audit logs', err)
      setRbacError('Không thể tải nhật ký kiểm toán cho người dùng này.')
    } finally {
      setIsAuditLogsLoading(false)
    }
  }

  const handleConfirmToggleActive = async () => {
    if (!userToToggleActive) return
    const { id: userId, username, isActive } = userToToggleActive
    setUserToToggleActive(null); setRbacError(''); setRbacSuccess('')
    try {
      await rbacApi.toggleActive(userId)
      setRbacSuccess(`${isActive ? 'Vô hiệu hóa' : 'Kích hoạt'} tài khoản "${username}" thành công.`)
      fetchRbacData()
    } catch (err: any) {
      setRbacError(err.response?.data?.error || 'Cập nhật trạng thái tài khoản thất bại.')
    }
  }

  /* ── handlers ─────────────────────────────────────────── */
  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setRbacError(''); setRbacSuccess('')
    try {
      await rbacApi.createUser({ username: newUsername, fullName: newFullName, password: newPassword, roleCode: newRole })
      setRbacSuccess(`Người dùng "${newUsername}" đã được tạo thành công.`)
      setNewUsername(''); setNewFullName(''); setNewPassword(''); setNewRole('MEMBER')
      fetchRbacData()
    } catch (err: any) {
      setRbacError(err.response?.data?.error || 'Tạo người dùng thất bại.')
    }
  }

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return
    const { id: userId, username } = userToDelete
    setUserToDelete(null); setRbacError(''); setRbacSuccess('')
    try {
      await rbacApi.deleteUser(userId)
      setRbacSuccess(`Xóa người dùng "${username}" thành công.`)
      if (editingUser?.id === userId) setEditingUser(null)
      fetchRbacData()
    } catch (err: any) {
      setRbacError(err.response?.data?.error || 'Xóa người dùng thất bại.')
    }
  }

  const startEditPermissions = (user: any) => {
    setEditingUser(user)
    setUserPermDraft(user.directPermissions ?? [])
  }

  const handleTogglePermDraft = (code: string) =>
    setUserPermDraft((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code])

  const handleSavePermissions = () => {
    if (!editingUser) return
    setPermConfirmOpen(true)
  }

  const handleConfirmSavePermissions = async () => {
    setPermConfirmOpen(false)
    if (!editingUser) return
    setRbacError(''); setRbacSuccess('')
    try {
      await rbacApi.updateUserPermissions(editingUser.id, userPermDraft)
      setRbacSuccess(`Quyền trực tiếp cho "${editingUser.username}" đã được cập nhật.`)
      setEditingUser(null); fetchRbacData()
    } catch (err: any) {
      setRbacError(err.response?.data?.error || 'Lưu phân quyền thất bại.')
    }
  }

  const startResetPassword = (user: any) => {
    setResetPwdUser(user)
    setNewPasswordVal('')
    setResetReason('')
    setResetError('')
    setResetSuccess('')
  }

  const handleResetPasswordSubmit = () => {
    if (!resetPwdUser || !newPasswordVal || newPasswordVal.length < 6 || !resetReason.trim()) return
    setResetPwdConfirmOpen(true)
  }

  const handleConfirmResetPassword = async () => {
    setResetPwdConfirmOpen(false)
    if (!resetPwdUser) return
    setResetError('')
    setResetSuccess('')
    try {
      await rbacApi.resetPassword(resetPwdUser.id, {
        password: newPasswordVal,
        reason: resetReason
      })
      setResetSuccess('Đặt lại mật khẩu thành công.')
      setNewPasswordVal('')
      setResetReason('')
      fetchRbacData()
      setTimeout(() => {
        setResetPwdUser(null)
        setResetSuccess('')
      }, 1500)
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Đặt lại mật khẩu thất bại.')
    }
  }

  const getOverrideType = (jobType: string) => {
    const jt = jobType.toUpperCase();
    if (jt === 'PRINT_ONLY' || jt === 'PRINT_LABEL') return 'REPRINT';
    if (jt === 'MARK_ONLY' || jt === 'LASER_MARK') return 'RELASER';
    return 'REPROCESS';
  };

  // translateTriggerType moved to ProductionExecutionDetailModal

  // Fetch attempts ofselected reprint record to populate parentAttemptId
  useEffect(() => {
    if (selectedReprintRecord) {
      jobsApi.getAttempts(selectedReprintRecord.jobId)
        .then(res => {
          const attempts = res.data;
          if (attempts && attempts.length > 0) {
            const sorted = [...attempts].sort((a: any, b: any) => b.attemptNo - a.attemptNo);
            setLatestAttemptId(sorted[0].id);
          } else {
            setLatestAttemptId('none');
          }
        })
        .catch(() => setLatestAttemptId('none'));
    } else {
      setLatestAttemptId('none');
    }
  }, [selectedReprintRecord]);

  // Note: piece / attempt / step fetching has moved into ProductionExecutionDetailModal.

  const handleTriggerReprint = () => {
    if (!selectedReprintRecord) return
    const type = getOverrideType(selectedReprintRecord.jobType)
    if (type === 'REPRINT' || type === 'RELASER') {
      setOverrideConfirmData({
        title: 'Xử lý lại sản phẩm',
        description: 'Hành động này sẽ tạo ra một lượt gia công mới và lưu giữ toàn bộ dữ liệu lịch sử.\n\nBạn có muốn tiếp tục?',
        type
      })
    } else {
      setOverrideConfirmData({
        title: 'Thử lại lệnh thất bại',
        description: 'Một lượt thử lại mới sẽ được tạo ra.\n\nDữ liệu lịch sử sẽ không bị sửa đổi.\n\nBạn có muốn tiếp tục?',
        type
      })
    }
    setOverrideConfirmOpen(true)
  }

  const handleConfirmTriggerReprint = async () => {
    setOverrideConfirmOpen(false)
    if (!selectedReprintRecord || !overrideConfirmData) return
    setReprintError('')
    setReprintSuccess('')
    setSubmittingReprint(true)
    try {
      const type = overrideConfirmData.type
      await commandsApi.manualOverride({
        jobId: selectedReprintRecord.jobId,
        jobNo: selectedReprintRecord.jobNo,
        productCode: selectedReprintRecord.productCode,
        parentAttemptId: latestAttemptId,
        reasonCode: reprintReasonCode,
        reasonDescription: reprintComment,
        overrideType: type
      });
      setReprintSuccess('Yêu cầu in/khắc lại đã được gửi thành công.');
      setReprintComment('');
      setReprintConfirmed(false);
      setSelectedReprintRecord(null);
      setTimeout(() => {
        setIsReprintListOpen(false)
        setReprintSuccess('')
      }, 1500)
    } catch (err: any) {
      setReprintError(err.response?.data?.error || 'Không thể gửi yêu cầu in/khắc lại.');
    } finally {
      setSubmittingReprint(false)
      setOverrideConfirmData(null)
    }
  }


  /* ── tab config ───────────────────────────────────────── */
  const tabs = [
    { key: 'dashboard' as KioskTab, label: 'Bảng điều khiển', icon: LayoutDashboard, show: canViewJobs },
    { key: 'orders' as KioskTab, label: 'Lệnh sản xuất', icon: Database, show: canViewJobs },
    { key: 'history' as KioskTab, label: 'Lịch sử sản xuất', icon: History, show: canViewJobs },
    { key: 'traceability' as KioskTab, label: 'Truy xuất nguồn gốc', icon: Search, show: canViewJobs },
    { key: 'alarms' as KioskTab, label: 'Trung tâm cảnh báo', icon: AlertTriangle, show: true },
    { key: 'config' as KioskTab, label: 'Cấu hình thiết bị', icon: Settings, show: isSuperAdmin },
    { key: 'diagnostics' as KioskTab, label: 'Chẩn đoán hệ thống', icon: LineChart, show: true },
    { key: 'connectivity' as KioskTab, label: 'Kết nối mạng', icon: Cpu, show: true },
    { key: 'rbac' as KioskTab, label: 'Quản lý phân quyền', icon: Users, show: isSuperAdmin },
    { key: 'templates' as KioskTab, label: 'Mẫu nhãn in', icon: FileText, show: true },
  ]

  /* ═══════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">

      {/* ── TOP HEADER BAR ──────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-card [box-shadow:var(--shadow-sm)]">
        <div className="flex h-16 items-center justify-between gap-4 px-6 lg:px-8 max-w-7xl mx-auto w-full">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-dark to-brand">
              <Flame className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-base leading-tight truncate">ND Station Kiosk</p>
              <p className="text-sm text-muted-fg leading-tight">{stationId}</p>
            </div>
          </div>

          {/* Center: current user & clock */}
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-fg">
            {currentUser && (
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 shrink-0 text-brand" />
                <span>
                  <span className="font-bold text-foreground text-base">{currentUser.username}</span>
                  <span className="ml-1.5 opacity-70">({currentUser.roles?.map(translateRole).join(', ')})</span>
                </span>
              </div>
            )}
            <div className="h-4 w-px bg-border"></div>
            <div className="flex items-center gap-2 font-mono text-base font-bold text-brand-light bg-brand/5 px-3 py-1 rounded-full border border-brand/10">
              <Clock className="h-4 w-4 text-brand animate-pulse" />
              <span>{currentTime.toLocaleTimeString('vi-VN')}</span>
              <span className="text-xs text-muted-fg font-normal ml-1">
                {currentTime.toLocaleDateString('vi-VN')}
              </span>
            </div>
          </div>

          {/* Right: status + logout */}
          <div className="flex items-center gap-3 shrink-0">
            <Badge variant={isConnected ? 'connected' : 'disconnected'} className="gap-1.5 hidden sm:flex text-sm">
              {isConnected
                ? <><Wifi className="h-3 w-3" /> SignalR</>
                : <><WifiOff className="h-3 w-3" /> Offline</>
              }
            </Badge>

            {/* Theme Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className="h-9 w-9 text-muted-fg hover:text-foreground hover:bg-surface-2 rounded-lg cursor-pointer flex items-center justify-center shrink-0"
              title={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5 text-brand animate-pulse" />
              ) : (
                <Moon className="h-5 w-5 text-brand" />
              )}
            </Button>

            <Button variant="ghost" size="sm" onClick={handleLogout}
              className="gap-1.5 text-muted-fg hover:text-red-400 hover:bg-red-500/10 text-base"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── PERSISTENT ALARM ALERT BAR ──────────────────── */}
      {alarmBannerCount > 0 && (
        <div
          onClick={() => setTab('alarms')}
          className="w-full bg-red-500/10 hover:bg-red-500/15 border-b border-red-500/30 text-red-400 py-3.5 px-6 lg:px-8 text-center text-base font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors duration-150 animate-pulse select-none"
        >
          <AlertTriangle className="h-5 w-5 animate-bounce shrink-0" />
          <span>HỆ THỐNG PHÁT HIỆN CÓ KHÓA BÁO ĐỘNG CHƯA XÁC NHẬN ({alarmBannerCount} CẢNH BÁO) — NHẤN ĐỂ VÀO TRUNG TÂM XỬ LÝ</span>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── LEFT SIDEBAR NAVIGATION ────────────────── */}
        <aside className="w-76 border-r border-border bg-card flex flex-col shrink-0 select-none">
          {/* Sidebar header label */}
          <div className="px-5 py-3 border-b border-border">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-fg">Điều hướng</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {tabs.filter((t) => t.show).map(({ key, label, icon: Icon }) => {
              const active = tab === key
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={[
                    'w-full flex items-center gap-3 px-4 py-3.5 text-[15px] font-semibold rounded-xl border transition-all duration-150 cursor-pointer touch-manipulation text-left',
                    active
                      ? 'border-brand/30 text-brand bg-brand-glow font-bold'
                      : 'border-transparent text-muted-fg hover:text-foreground hover:bg-surface-2 hover:border-border',
                  ].join(' ')}
                >
                  <div className={[
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150',
                    active ? 'bg-brand/15 text-brand' : 'text-muted-fg',
                  ].join(' ')}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ── MAIN CONTENT ────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-background">

          {/* ════ TAB: DASHBOARD ════════════════════════════ */}
          {tab === 'dashboard' && (() => {
            const isCurrentJob = activeJobDetails && (production?.jobStatus === 'PROCESSING' || production?.jobStatus === 'QUEUED' || production?.jobStatus === 'PENDING' || production?.jobStatus === 'PREPARING');

            const resolved = isCurrentJob ? getResolvedData() : {
              production_order: '—',
              work_order: '—',
              workflow: '—',
              operation: '—',
              station: 'STATION-01',
              team: '—',
              operator: currentUser?.username || '—',
              product_name: '—',
              product_code: '—',
              revision: '—',
              customer: '—',
              material: '—',
              rubber_type: '—',
              lot_number: '—',
              batch_number: '—',
              manufacture_date: '—',
              expiry_date: '—',
              country: '—',
              serial_number: '—',
              trace_id: '—',
              planned_quantity: '0',
              completed_quantity: '0',
              remaining_quantity: '0',
              current_step: '—'
            };

            // visionResult removed — Panel 6 (Camera Verification) moved out of Dashboard tab



            const planned = parseInt(resolved.planned_quantity || '0', 10);
            const completed = parseInt(resolved.completed_quantity || '0', 10);
            const pct = planned > 0 ? Math.round((completed / planned) * 100) : 0;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">

                {/* LEFT COLUMN: Panels 1 & 2 */}
                <div className="lg:col-span-2 space-y-6">

                  {/* PANEL 1: Production Information */}
                  <Card className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="py-4 px-6 border-b border-border bg-brand/5 dark:bg-brand-dark/10">
                      <CardTitle className="text-sm font-bold tracking-wider text-brand uppercase flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        1. Thông tin lệnh sản xuất (Production Info)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Mã Lệnh (Production Order)</span>
                          <div className="text-lg font-bold font-mono tracking-tight text-foreground">{resolved.production_order}</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Work Order / SKU</span>
                          <div className="text-lg font-bold font-mono tracking-tight text-foreground">{resolved.work_order}</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Quy trình (Workflow)</span>
                          <div className="text-sm font-medium text-foreground">{resolved.workflow}</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Công đoạn (Operation)</span>
                          <div className="text-sm font-medium text-foreground flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-xs bg-brand/10 text-brand-light border border-brand/20 font-mono">
                              {resolved.operation}
                            </span>
                            <span className="text-muted-fg font-mono text-xs">({resolved.current_step || 'Step 1'})</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Trạm vận hành (Station)</span>
                          <div className="text-sm font-semibold font-mono text-foreground">{resolved.station}</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Đội sản xuất (Assigned Team)</span>
                          <div className="text-sm font-medium text-foreground">{resolved.team}</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Người vận hành (Operator)</span>
                          <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                            {currentUser?.username || resolved.operator}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Tiến độ sản lượng (Quantity / Progress)</span>
                          <div className="text-sm font-semibold font-mono text-foreground">
                            {completed} / {planned} pcs <span className="text-xs text-muted-fg font-normal">(Còn lại: {resolved.remaining_quantity})</span>
                          </div>
                        </div>
                      </div>
                      {/* Progress Bar */}
                      <div className="mt-4 pt-2 border-t border-border/50">
                        {production?.jobStatus === 'PREPARING' ? (
                          <>
                            <div className="flex justify-between items-center mb-1 text-xs font-semibold text-muted-fg">
                              <span className="flex items-center gap-1.5 text-violet-400">
                                <span className="inline-block h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
                                ĐANG CHUẨN BỊ NHÃN IN...
                              </span>
                              <span className="text-violet-400">{planned} nhãn</span>
                            </div>
                            {/* Indeterminate progress bar */}
                            <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden border border-border/50">
                              <div
                                className="h-full rounded-full bg-violet-500"
                                style={{
                                  width: '40%',
                                  animation: 'preparing-slide 1.4s ease-in-out infinite'
                                }}
                              />
                            </div>
                            <style>{`
                              @keyframes preparing-slide {
                                0% { transform: translateX(-100%); }
                                100% { transform: translateX(350%); }
                              }
                            `}</style>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between items-center mb-1 text-xs font-semibold text-muted-fg">
                              <span>TIẾN ĐỘ HOÀN THÀNH</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden border border-border/50">
                              <div className="bg-brand-dark h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* PANEL 2: Product Information */}
                  <Card className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="py-4 px-6 border-b border-border bg-teal-900/5 dark:bg-teal-950/20">
                      <CardTitle className="text-sm font-bold tracking-wider text-teal-500 uppercase flex items-center gap-2">
                        <Cpu className="h-4 w-4" />
                        2. Thông tin sản phẩm (Product Detail)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid grid-grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Tên sản phẩm (Product Name)</span>
                          <div className="text-sm font-bold text-foreground">{resolved.product_name}</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Mã SKU (Product Code)</span>
                          <div className="text-sm font-bold font-mono text-foreground">{resolved.product_code}</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Phiên bản (Revision)</span>
                          <div className="text-sm font-semibold font-mono text-foreground">{resolved.revision}</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Nhóm vật liệu (Material / Rubber)</span>
                          <div className="text-sm font-medium text-foreground">{resolved.material} ({resolved.rubber_type})</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Độ cứng & Màu sắc (Hardness / Color)</span>
                          <div className="text-sm font-medium text-foreground">70 Shore A / Đen (Black)</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Số Lô sản xuất (Lot / Batch)</span>
                          <div className="text-sm font-bold font-mono text-foreground">{resolved.lot_number} <span className="text-xs text-muted-fg font-normal">({resolved.batch_number})</span></div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Ngày sản xuất / Hết hạn</span>
                          <div className="text-sm font-semibold font-mono text-foreground">{resolved.manufacture_date} / {resolved.expiry_date}</div>
                        </div>
                        <div>
                          <span className="text-xs uppercase text-muted-fg font-semibold">Xuất xứ / Khách hàng (OEM)</span>
                          <div className="text-sm font-medium text-foreground">{resolved.country} / {resolved.customer}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Panel 3 (Traceability) and Panel 6 (Camera Verification) have been
                      removed from the Dashboard per refactor-kiosk-ui.md §7.
                      Both are available in their dedicated tabs. */}

                </div>

                {/* RIGHT COLUMN: Station Activity Log (last 10 production orders) */}
                <div className="space-y-6">

                  {/* Station Activity Log — last 10 production orders, compact operator view */}
                  <Card className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="py-4 px-5 border-b border-border">
                      <CardTitle className="text-sm font-bold tracking-wider text-muted-fg uppercase flex items-center gap-2">
                        <Clock className="h-4 w-4 text-brand" />
                        Nhật ký trạm — 10 lệnh gần nhất
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <StationActivityLog
                        records={todayRecords}
                        onRowClick={(record) => {
                          setSelectedDetailRecord(record)
                          setIsDetailDialogOpen(true)
                        }}
                      />
                    </CardContent>
                  </Card>

                </div>

                {/* Bottom action bar */}
                <div className="lg:col-span-3 flex justify-between items-center pt-4 border-t border-border/50">
                  <div className="text-sm font-semibold flex items-center gap-1.5 text-muted-fg">
                    <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                    {isConnected ? 'Kiosk Agent connected to SignalR' : 'Kiosk Agent disconnected'}
                  </div>
                  <Button
                    onClick={() => {
                      setIsReprintListOpen(true)
                      setSelectedReprintRecord(null)
                      setReprintReasonCode('PRINT_QUALITY')
                      setReprintError('')
                      setReprintSuccess('')
                    }}
                    disabled={!canReprocess}
                    className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-extrabold px-6 py-3 rounded-lg shadow-md transition-all duration-300 gap-2 uppercase tracking-wider text-sm"
                  >
                    <PrinterIcon className="h-4 w-4" />
                    Xử lý lại sản phẩm (Reprocess)
                  </Button>
                </div>

              </div>
            );
          })()}


          {/* ════ TAB: HISTORY ═══════════════════════════════ */}
          {tab === 'history' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Filter Panel */}
              <Card className="border border-border bg-card">
                <CardHeader className="py-4 px-6 border-b border-border">
                  <CardTitle className="text-base font-bold uppercase tracking-wider flex items-center gap-2">
                    <Filter className="h-4 w-4 text-brand" />
                    Bộ lọc tìm kiếm lịch sử
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="filter-wo" className="text-sm">Lệnh sản xuất</Label>
                      <Input
                        id="filter-wo"
                        placeholder="Tìm WO..."
                        value={historyFilters.workOrder}
                        onChange={(e) => setHistoryFilters(prev => ({ ...prev, workOrder: e.target.value }))}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="filter-sku" className="text-sm">Mã sản phẩm</Label>
                      <Input
                        id="filter-sku"
                        placeholder="Tìm SKU..."
                        value={historyFilters.productCode}
                        onChange={(e) => setHistoryFilters(prev => ({ ...prev, productCode: e.target.value }))}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Trạng thái</Label>
                      <Select
                        value={historyFilters.status}
                        onValueChange={(val) => setHistoryFilters(prev => ({ ...prev, status: val }))}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Tất cả trạng thái" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">Tất cả</SelectItem>
                          <SelectItem value="RECEIVED">Đã nhận yêu cầu</SelectItem>
                          <SelectItem value="QUEUED">Đang trong hàng chờ</SelectItem>
                          <SelectItem value="PROCESSING">Đang xử lý</SelectItem>
                          <SelectItem value="PRINTING">Đang in/khắc</SelectItem>
                          <SelectItem value="VERIFYING">Đang kiểm tra</SelectItem>
                          <SelectItem value="COMPLETED">Hoàn thành</SelectItem>
                          <SelectItem value="FAILED">Thất bại</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Khoảng thời gian</Label>
                      <Select
                        value=""
                        onValueChange={(v) => {
                          if (v === 'today') setHistoryFilters(prev => ({ ...prev, ...buildTodayRange() }))
                          else if (v === 'yesterday') setHistoryFilters(prev => ({ ...prev, ...buildYesterdayRange() }))
                          else if (v === '3d') setHistoryFilters(prev => ({ ...prev, ...buildLast3DaysRange() }))
                          else if (v === '7d') setHistoryFilters(prev => ({ ...prev, ...buildLast7DaysRange() }))
                        }}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Chọn nhanh..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="today">Hôm nay</SelectItem>
                          <SelectItem value="yesterday">Hôm qua</SelectItem>
                          <SelectItem value="3d">3 ngày qua</SelectItem>
                          <SelectItem value="7d">7 ngày qua</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="filter-from" className="text-sm">Từ ngày</Label>
                      <Input
                        id="filter-from"
                        type="date"
                        min={getRetentionLimitStr()}
                        max={getTodayStr()}
                        value={historyFilters.dateFrom ? historyFilters.dateFrom.split('T')[0] : ''}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val) {
                            const clamped = clampToRetentionWindow(val, getRetentionLimitStr())
                            setHistoryFilters(prev => ({ ...prev, dateFrom: normalizeStartOfDay(clamped) }))
                          }
                        }}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="filter-to" className="text-sm">Đến ngày</Label>
                      <Input
                        id="filter-to"
                        type="date"
                        min={getRetentionLimitStr()}
                        max={getTodayStr()}
                        value={historyFilters.dateTo ? historyFilters.dateTo.split('T')[0] : ''}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val) {
                            const clamped = clampToRetentionWindow(val, getTodayStr())
                            setHistoryFilters(prev => ({ ...prev, dateTo: normalizeEndOfDay(clamped) }))
                          }
                        }}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-between items-center gap-4 mt-4 pt-4 border-t border-border">
                    <div className="text-xs text-brand-light font-bold px-3 py-1.5 rounded-lg bg-brand/5 border border-brand/10">
                      📅 Khoảng thời gian: {formatRangeDisplay(historyFilters.dateFrom, historyFilters.dateTo)}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const range = buildLast7DaysRange()
                          setHistoryFilters({ status: '', productCode: '', workOrder: '', dateFrom: range.dateFrom, dateTo: range.dateTo })
                          setHistoryPage(1)
                        }}
                        className="h-9 text-sm"
                      >
                        Xóa bộ lọc
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setHistoryPage(1)
                          fetchHistory(1, historyPageSize, historyFilters)
                        }}
                        className="h-9 text-sm"
                      >
                        Tìm kiếm
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* History Table */}
              <Card className="border border-border bg-card">
                <CardHeader className="py-4 px-6 border-b border-border flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold uppercase tracking-wider flex items-center gap-2">
                      <Database className="h-4 w-4 text-brand" />
                      Lịch sử lưu trữ hệ thống
                    </CardTitle>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchHistory(historyPage, historyPageSize, historyFilters)}
                    disabled={loadingHistory}
                    className="text-sm"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${loadingHistory ? 'animate-spin' : ''}`} />
                    Làm mới
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {historyError && (
                    <div className="p-6 text-center text-red-500 text-base">{historyError}</div>
                  )}

                  <div className="w-full overflow-x-auto">
                    <TableEl>
                      <TableHeader className="bg-surface-2">
                        <TableRow>
                          <TableHead className="pl-6 text-sm">Thời gian</TableHead>
                          <TableHead className="text-sm">Lệnh sản xuất</TableHead>
                          <TableHead className="text-sm">Mã sản phẩm</TableHead>
                          <TableHead className="text-sm">Sản lượng hoàn thành</TableHead>
                          <TableHead className="text-sm">Trạng thái</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingHistory ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-muted-fg text-base">
                              Đang tải lịch sử...
                            </TableCell>
                          </TableRow>
                        ) : historyData?.items && historyData.items.length > 0 ? (
                          historyData.items.map((record) => (
                            <TableRow
                              key={record.id}
                              className="hover:bg-surface-1 cursor-pointer"
                              onClick={() => {
                                setSelectedDetailRecord(record);
                                setIsDetailDialogOpen(true);
                              }}
                            >
                              <TableCell className="pl-6 font-mono text-sm">
                                {new Date(record.updatedAt).toLocaleString('vi-VN')}
                              </TableCell>
                              <TableCell className="font-bold text-sm">{record.jobNo}</TableCell>
                              <TableCell className="text-muted-fg text-sm">{record.productCode}</TableCell>
                              <TableCell className="font-mono text-sm text-muted-fg">{record.productSerial || '—'}</TableCell>
                              <TableCell>
                                <StatusBadge status={record.currentStatus} jobType={record.jobType} />
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-muted-fg text-base">
                              Không tìm thấy lịch sử phù hợp.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </TableEl>
                  </div>

                  {/* Server Pagination */}
                  {historyData && historyData.totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border px-6 py-4 bg-surface-2">
                      <span className="text-sm text-muted-fg">
                        Hiển thị trang <strong className="text-foreground">{historyPage}</strong> / <strong className="text-foreground">{historyData.totalPages}</strong> ({historyData.totalCount} kết quả)
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage === 1 || loadingHistory}
                          onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                          className="text-sm"
                        >
                          Trang trước
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage === historyData.totalPages || loadingHistory}
                          onClick={() => setHistoryPage(prev => Math.min(historyData.totalPages, prev + 1))}
                        >
                          Trang sau
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ════ TAB: CONNECTIVITY ══════════════════════════ */}
          {tab === 'connectivity' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Sub-tabs navigation */}
              <div className="flex gap-2 border-b border-border mb-4">
                {[
                  { key: 'devices', label: 'Mạng lưới thiết bị' },
                  { key: 'printers', label: 'Thiết bị in' },
                  { key: 'plc', label: 'Thiết bị PLC' },
                  { key: 'camera', label: 'Thiết bị Camera' }
                ].map(sub => (
                  <button
                    key={sub.key}
                    onClick={() => setConnectivitySubTab(sub.key as 'devices' | 'printers' | 'plc' | 'camera')}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
                      connectivitySubTab === sub.key
                        ? 'border-brand text-brand font-bold'
                        : 'border-transparent text-muted-fg hover:text-foreground'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>

              {connectivitySubTab === 'devices' && (() => {
                // ── Device display helpers ──────────────────────────────────────────
                const deviceLabel: Record<string, string> = {
                  PLC:           'Bộ điều khiển PLC',
                  PRINTER:       'Máy in nhãn',
                  LASER:         'Máy khắc Laser',
                  VISION_CAMERA: 'Camera kiểm tra',
                  FactoryGateway:'Cổng Factory Gateway',
                  Printer:       'Máy in nhãn',
                }
                const getLabel  = (d: any) => deviceLabel[d.deviceType] ?? d.deviceType
                const getIcon   = (d: any) => {
                  switch (d.deviceType) {
                    case 'PLC':           return <Cpu className="h-5 w-5" />
                    case 'PRINTER':
                    case 'Printer':       return <PrinterIcon className="h-5 w-5" />
                    case 'LASER':         return <Zap className="h-5 w-5" />
                    case 'VISION_CAMERA': return <Camera className="h-5 w-5" />
                    default:              return <Cpu className="h-5 w-5" />
                  }
                }

                const relativeTime = (iso: string) => {
                  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
                  if (diff < 10)  return 'vừa xong'
                  if (diff < 60)  return `${diff}s trước`
                  if (diff < 3600) return `${Math.round(diff / 60)}ph trước`
                  return new Date(iso).toLocaleTimeString('vi-VN')
                }

                const lifecycleBadge = (d: any) => {
                  const s = (d.lifecycleState ?? '').toLowerCase()
                  if (s === 'printing')   return { label: 'In ấn',     cls: 'bg-indigo-500/10 text-indigo-400' }
                  if (s === 'busy')       return { label: 'Bận',       cls: 'bg-blue-500/10 text-blue-400' }
                  if (s === 'waiting')    return { label: 'Chờ hàng',  cls: 'bg-amber-500/10 text-amber-400' }
                  if (s === 'warning')    return { label: 'Cảnh báo',  cls: 'bg-yellow-500/10 text-yellow-400' }
                  if (s === 'error')      return { label: 'Lỗi',       cls: 'bg-red-500/10 text-red-400' }
                  if (s === 'connecting') return { label: 'Đang kết nối', cls: 'bg-slate-500/10 text-slate-400' }
                  if (s === 'online')     return { label: 'Chờ',       cls: 'bg-emerald-500/10 text-emerald-400' }
                  if (s === 'idle')       return { label: 'Chờ',       cls: 'bg-emerald-500/10 text-emerald-400' }
                  if (s === 'offline')    return { label: 'Offline',   cls: 'bg-red-500/10 text-red-400' }
                  if (s === 'unknown')    return { label: '?',         cls: 'bg-gray-500/10 text-gray-400' }
                  return null
                }

                // Helper: map lifecycleState to card accent color classes
                const deviceCardAccent = (d: any) => {
                  if (!d.isOnline) return 'border-red-500/15 bg-red-500/[0.02] opacity-75'
                  const s = (d.lifecycleState ?? '').toLowerCase()
                  if (s === 'printing' || s === 'busy')  return 'border-indigo-500/20 bg-indigo-500/[0.03] hover:border-indigo-500/40'
                  if (s === 'waiting')  return 'border-amber-500/20 bg-amber-500/[0.03] hover:border-amber-500/40'
                  if (s === 'warning')  return 'border-yellow-500/20 bg-yellow-500/[0.03] hover:border-yellow-500/40'
                  if (s === 'error')    return 'border-red-500/20 bg-red-500/[0.03] hover:border-red-500/40'
                  if (s === 'connecting') return 'border-slate-500/20 bg-slate-500/[0.02] hover:border-slate-500/30'
                  return 'border-emerald-500/20 bg-emerald-500/[0.03] hover:border-emerald-500/40'
                }

                // Helper: map lifecycleState to top-bar gradient
                const deviceCardBar = (d: any) => {
                  if (!d.isOnline) return 'from-red-500/40 to-red-400/10'
                  const s = (d.lifecycleState ?? '').toLowerCase()
                  if (s === 'printing' || s === 'busy')  return 'from-indigo-500/50 to-indigo-400/20'
                  if (s === 'waiting')  return 'from-amber-500/50 to-amber-400/20'
                  if (s === 'warning')  return 'from-yellow-500/50 to-yellow-400/20'
                  if (s === 'error')    return 'from-red-500/50 to-red-400/20'
                  return 'from-emerald-500/50 to-emerald-400/20'
                }

                // Helper: status dot color + animation
                const statusDot = (d: any) => {
                  const s = (d.lifecycleState ?? '').toLowerCase()
                  if (!d.isOnline)      return 'bg-red-400'
                  if (s === 'printing' || s === 'busy') return 'bg-indigo-400 animate-pulse'
                  if (s === 'waiting')  return 'bg-amber-400 animate-pulse'
                  if (s === 'warning')  return 'bg-yellow-400 animate-pulse'
                  if (s === 'error')    return 'bg-red-400'
                  if (s === 'connecting') return 'bg-slate-400 animate-pulse'
                  return 'bg-emerald-400 animate-pulse'
                }

                const statusLabel = (d: any) => {
                  const s = (d.lifecycleState ?? '').toLowerCase()
                  if (!d.isOnline)      return 'Offline'
                  if (s === 'printing') return 'Printing'
                  if (s === 'busy')     return 'Busy'
                  if (s === 'waiting')  return 'Waiting'
                  if (s === 'warning')  return 'Warning'
                  if (s === 'error')    return 'Error'
                  if (s === 'connecting') return 'Connecting'
                  return 'Online'
                }

                const statusLabelCls = (d: any) => {
                  const s = (d.lifecycleState ?? '').toLowerCase()
                  if (!d.isOnline)      return 'bg-red-500/10 text-red-400'
                  if (s === 'printing' || s === 'busy') return 'bg-indigo-500/10 text-indigo-400'
                  if (s === 'waiting')  return 'bg-amber-500/10 text-amber-400'
                  if (s === 'warning')  return 'bg-yellow-500/10 text-yellow-400'
                  if (s === 'error')    return 'bg-red-500/10 text-red-400'
                  if (s === 'connecting') return 'bg-slate-500/10 text-slate-400'
                  return 'bg-emerald-500/10 text-emerald-400'
                }

                // Separate: real production devices vs simulation printers
                const nonGateway   = devices.filter((d: any) => d.deviceType !== 'GATEWAY' && d.deviceType !== 'FactoryGateway')
                // Simulation printers are PRINTER / Printer type with IDs like Printer-01, Printer-02, printer-01, Printer-03
                const simIds       = new Set(['printer-01','Printer-01','Printer-02','Printer-03'])
                const isSimDevice  = (d: any) =>
                  (d.deviceType === 'PRINTER' || d.deviceType === 'Printer') &&
                  (simIds.has(d.deviceId) || /^Printer-\d+$/i.test(d.deviceId))
                const realDevices  = nonGateway.filter((d: any) => !isSimDevice(d))
                const simDevices   = nonGateway.filter((d: any) => isSimDevice(d))
                const onlineCount  = realDevices.filter((d: any) => d.isOnline).length
                const offlineCount = realDevices.filter((d: any) => !d.isOnline).length

                return (
                  <div className="space-y-5 animate-in fade-in duration-200">

                    {/* ── Gateway banner ── */}
                    <div className={`rounded-xl border-2 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
                      isGatewayOnline
                        ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                        : 'border-red-500/30 bg-red-500/[0.04]'
                    }`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                          isGatewayOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          <Flame className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-extrabold text-sm text-foreground flex items-center gap-2">
                            Cổng truyền thông Factory Gateway
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isGatewayOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${isGatewayOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                              {isGatewayOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-fg mt-0.5">
                            {isGatewayOnline
                              ? 'Kết nối MQTT an toàn — nhận lệnh từ ERP nhà máy'
                              : 'Mất kết nối — không nhận được tín hiệu từ nhà máy'}
                          </p>
                          {gatewayDevice?.lastSeenAt && (
                            <p className="text-[11px] text-muted-fg/70 mt-0.5 font-mono">
                              Lần cuối: {relativeTime(gatewayDevice.lastSeenAt)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3 text-center shrink-0">
                        <div className="px-4 py-2 rounded-lg bg-surface-2 border border-border text-xs">
                          <div className="font-extrabold text-emerald-400 text-lg">{onlineCount}</div>
                          <div className="text-muted-fg">Online</div>
                        </div>
                        <div className="px-4 py-2 rounded-lg bg-surface-2 border border-border text-xs">
                          <div className="font-extrabold text-red-400 text-lg">{offlineCount}</div>
                          <div className="text-muted-fg">Offline</div>
                        </div>
                        <div className="px-4 py-2 rounded-lg bg-surface-2 border border-border text-xs">
                          <div className="font-extrabold text-foreground text-lg">{realDevices.length}</div>
                          <div className="text-muted-fg">Tổng cộng</div>
                        </div>
                      </div>
                    </div>

                    {/* ── Device grid ── */}
                    <Card className="border border-border bg-card">
                      <CardHeader className="border-b border-border py-4 px-6">
                        <CardTitle className="text-base font-bold uppercase tracking-wider flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-brand" />
                          Mạng lưới thiết bị đầu cuối
                        </CardTitle>
                        <CardDescription className="text-sm">Theo dõi thời gian thực — cập nhật qua SignalR mỗi 3 giây</CardDescription>
                      </CardHeader>
                      <CardContent className="p-6">
                        {realDevices.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 text-muted-fg gap-3">
                            <Cpu className="h-10 w-10 text-muted-fg/20" />
                            <div className="text-center">
                              <p className="font-medium text-foreground text-sm">Chưa phát hiện thiết bị nào</p>
                              <p className="text-xs mt-1">Đảm bảo các adapter (printer-adapter, plc-adapter, laser-adapter) đang chạy và gửi heartbeat.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                            {realDevices.map((device: any) => {
                              const badge = lifecycleBadge(device)
                              return (
                                <div
                                  key={device.deviceId}
                                  className={`rounded-xl p-4 flex flex-col justify-between gap-3 border transition-all duration-300 relative overflow-hidden ${deviceCardAccent(device)}`}
                                >
                                  {/* State accent bar */}
                                  <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${deviceCardBar(device)}`} />

                                  <div className="flex items-start justify-between gap-2">
                                    <div className={`p-2.5 rounded-lg border shrink-0 ${
                                      device.isOnline
                                        ? 'border-emerald-500/10 bg-emerald-500/5 text-emerald-400'
                                        : 'border-red-500/10 bg-red-500/5 text-red-400'
                                    }`}>
                                      {getIcon(device)}
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                      {/* Primary online/state badge */}
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusLabelCls(device)}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${statusDot(device)}`} />
                                        {statusLabel(device)}
                                      </span>
                                      {/* Secondary lifecycle detail badge */}
                                      {badge && badge.label !== statusLabel(device) && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${badge.cls}`}>
                                          {badge.label}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="font-extrabold text-sm text-foreground leading-tight">{device.deviceId.toUpperCase()}</p>
                                    <p className="text-[11px] text-muted-fg mt-0.5">{getLabel(device)}</p>
                                    <p className="text-[10px] text-muted-fg/60 mt-1.5 font-mono">
                                      {device.isOnline ? '↻ ' : '✕ '}{relativeTime(device.lastSeenAt)}
                                    </p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <SimulationDeviceSection devices={simDevices} relativeTime={relativeTime} />
                  </div>
                )
              })()}


              {connectivitySubTab === 'printers' && (
                <div className="animate-in fade-in duration-200">
                  <PrinterManagementTab deviceStatuses={devices as DeviceStatusLive[]} />
                </div>
              )}

              {connectivitySubTab === 'plc' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <Card className="border border-border bg-card">
                    <CardHeader className="border-b border-border py-4 px-6">
                      <CardTitle className="text-base font-bold uppercase tracking-wider flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-brand" />
                        Trạng thái thiết bị PLC
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="text-muted-fg text-sm">
                        Kết nối trực tiếp tới máy PLC qua giao thức Modbus TCP/IP (Port: 502). Trạng thái hiện tại hoạt động ổn định.
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {connectivitySubTab === 'camera' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <Card className="border border-border bg-card">
                    <CardHeader className="border-b border-border py-4 px-6">
                      <CardTitle className="text-base font-bold uppercase tracking-wider flex items-center gap-2">
                        <Camera className="h-4 w-4 text-brand" />
                        Trạng thái thiết bị Camera ngoại quan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="text-muted-fg text-sm">
                        Kết nối camera kiểm tra ngoại quan (Cognex / Keyence). Giao thức TCP/IP. Trạng thái hiện tại sẵn sàng.
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* ════ TAB: TRACEABILITY ══════════════════════════ */}
          {tab === 'traceability' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <Card className="border border-border bg-card">
                <CardHeader className="py-4 px-6 border-b border-border bg-brand/5">
                  <CardTitle className="text-base font-bold tracking-wider text-brand uppercase flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Truy xuất nguồn gốc sản phẩm (Traceability)
                  </CardTitle>
                  <CardDescription className="text-sm">Tìm kiếm lịch sử gia công chi tiết theo Số Serial sản phẩm</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="flex gap-3 max-w-md">
                    <Input
                      placeholder="Nhập mã Serial sản phẩm (Ví dụ: SN-0001234)..."
                      value={searchSerial}
                      onChange={(e) => setSearchSerial(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleTraceSearch()}
                    />
                    <Button onClick={handleTraceSearch} disabled={traceLoading}>
                      {traceLoading ? 'Đang tìm...' : 'Tìm kiếm'}
                    </Button>
                  </div>

                  {traceError && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      {traceError}
                    </div>
                  )}

                  {traceResult && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-surface-1 p-4 rounded-lg border border-border">
                        <div>
                          <div className="text-xs text-muted-fg uppercase font-semibold">Mã Serial</div>
                          <div className="text-base font-bold font-mono text-foreground">{traceResult.job.productSerial || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-fg uppercase font-semibold">Mã Lệnh / SKU</div>
                          <div className="text-base font-bold text-foreground">{traceResult.job.productCode}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-fg uppercase font-semibold">Trạng thái hiện tại</div>
                          <div className="text-base font-bold"><StatusBadge status={traceResult.job.currentStatus} /></div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-bold text-sm text-foreground uppercase tracking-wider">Cây tiến trình gia công (Execution Timeline Tree)</h4>
                        <div className="relative border-l border-brand/20 ml-4 pl-6 space-y-6">
                          {traceResult.attempts.map((att: any, attIdx: number) => (
                            <div key={att.id} className="relative">
                              <div className="absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                                {attIdx + 1}
                              </div>
                              <div className="bg-surface-2 border border-border p-4 rounded-xl space-y-3">
                                <div className="flex justify-between items-center flex-wrap gap-2">
                                  <span className="font-bold text-sm text-foreground">
                                    Lượt gia công #{att.retrySequence + 1}
                                  </span>
                                  <span className="text-xs text-muted-fg font-mono">
                                    ID: {att.id}
                                  </span>
                                </div>

                                <div className="space-y-2">
                                  {att.steps.map((st: any) => (
                                    <div key={st.id} className="bg-card border border-border/80 p-3 rounded-lg flex flex-col sm:flex-row justify-between gap-3 text-xs">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-foreground">{st.stepName}</span>
                                          <span className="text-[10px] text-muted-fg">(Bước {st.stepOrder})</span>
                                        </div>
                                        {st.assignedDeviceId && (
                                          <div className="text-muted-fg">Thiết bị: <code className="bg-surface-3 px-1 rounded font-mono">{st.assignedDeviceId}</code></div>
                                        )}
                                        {st.payloadJsonStep && (
                                          <div className="text-[10px] text-muted-fg truncate max-w-md">Payload: <code className="font-mono">{st.payloadJsonStep}</code></div>
                                        )}
                                      </div>
                                      <div className="sm:text-right space-y-1 shrink-0">
                                        <div className="flex items-center sm:justify-end gap-1.5 font-semibold text-foreground">
                                          <span>{st.status}</span>
                                          {st.executionDurationMs > 0 && (
                                            <span className="text-muted-fg font-mono text-[10px]">({st.executionDurationMs}ms)</span>
                                          )}
                                        </div>
                                        <div className="text-[10px] text-muted-fg font-mono">{st.finishedAt ? new Date(st.finishedAt).toLocaleTimeString('vi-VN') : ''}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ════ TAB: QUEUE MONITOR ══════════════════════════ */}
          {/* ════ TAB: ORDERS ════════════════════════════════ */}
          {tab === 'orders' && (
            <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
              {/* Dispatch Dialog */}
              <DispatchDialog
                open={dispatchDialogOpen}
                onClose={() => setDispatchDialogOpen(false)}
                onConfirm={handleConfirmDispatch}
                itemCount={orderItems.filter(i => i.currentStatus === 'QUEUED' || !i.currentStatus).length || selectedOrder?.remainingQty || 0}
                jobType={selectedOrder?.jobType || 'PRINT_LABEL'}
                isSubmitting={dispatchLoading}
              />

              {/* Order Detail Modal */}
              <Dialog open={orderModalOpen} onOpenChange={setOrderModalOpen}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-card border border-border">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold text-brand flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Chi tiết lệnh sản xuất: {selectedOrder?.orderNo}
                    </DialogTitle>
                    <DialogDescription>
                      <div className="flex flex-wrap gap-4 mt-2 text-sm">
                        <span>Mã SP: <strong className="text-foreground">{selectedOrder?.productCode}</strong></span>
                        <span>Kế hoạch: <strong className="text-foreground">{selectedOrder?.plannedQty} sản phẩm</strong></span>
                        <span>Hoàn thành: <strong className="text-emerald-400">{selectedOrder?.completedQty}</strong></span>
                        <span>Còn lại: <strong className="text-orange-400">{selectedOrder?.remainingQty}</strong></span>
                        <span>Tiến độ: <strong className="text-brand">{selectedOrder?.progressPercent}%</strong></span>
                      </div>
                      {selectedOrder && (
                        <div className="mt-3 w-full bg-surface-2 rounded-full h-2">
                          <div
                            className="bg-brand h-2 rounded-full transition-all duration-700"
                            style={{ width: `${selectedOrder.progressPercent}%` }}
                          />
                        </div>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  {orderItemsLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-fg text-sm">
                      <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Đang tải danh sách sản phẩm...
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-border rounded-xl mt-4">
                      <TableEl>
                        <TableHeader className="bg-muted/40">
                          <TableRow>
                            <TableHead className="pl-4 font-bold text-xs uppercase tracking-wider">#</TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider">Serial</TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider">Trạng thái</TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider">Máy in</TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider">Bắt đầu</TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider">Kết thúc</TableHead>
                            <TableHead className="font-bold text-xs uppercase tracking-wider">Thử lại</TableHead>
                            <TableHead className="pr-4 font-bold text-xs uppercase tracking-wider">Lỗi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderItems.map((item, idx) => (
                            <TableRow key={item.id || idx} className="hover:bg-muted/10 transition-colors">
                              <TableCell className="pl-4 text-muted-fg text-xs font-mono">{idx + 1}</TableCell>
                              <TableCell className="font-mono text-xs text-foreground font-semibold">{item.productSerial || '—'}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  item.currentStatus === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                                  item.currentStatus === 'PROCESSING' ? 'bg-blue-500/10 text-blue-400' :
                                  item.currentStatus === 'FAILED' ? 'bg-red-500/10 text-red-400' :
                                  item.currentStatus === 'QUEUED' ? 'bg-amber-500/10 text-amber-400' :
                                  'bg-muted text-muted-fg'
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${
                                    item.currentStatus === 'COMPLETED' ? 'bg-emerald-400' :
                                    item.currentStatus === 'PROCESSING' ? 'bg-blue-400 animate-pulse' :
                                    item.currentStatus === 'FAILED' ? 'bg-red-400' :
                                    'bg-amber-400'
                                  }`} />
                                  {item.currentStatus || 'QUEUED'}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-brand">{item.assignedPrinter || '—'}</TableCell>
                              <TableCell className="text-xs text-muted-fg">{item.startTime ? new Date(item.startTime).toLocaleTimeString('vi-VN') : '—'}</TableCell>
                              <TableCell className="text-xs text-muted-fg">{item.endTime ? new Date(item.endTime).toLocaleTimeString('vi-VN') : '—'}</TableCell>
                              <TableCell className="text-xs text-center">
                                {(item.retryCount || 0) > 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 font-mono text-[10px] font-bold">{item.retryCount}</span>
                                ) : <span className="text-muted-fg">0</span>}
                              </TableCell>
                              <TableCell className="pr-4 text-xs text-red-400 max-w-[160px] truncate">{item.errorMessage || '—'}</TableCell>
                            </TableRow>
                          ))}
                          {orderItems.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-10 text-muted-fg text-sm">
                                Chưa có sản phẩm nào trong lệnh này.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </TableEl>
                    </div>
                  )}
                  <DialogFooter className="mt-4 flex-col items-stretch gap-2">
                    {/* Dispatch result banner */}
                    {dispatchResult && (
                      <div className={`rounded-lg px-3 py-2 text-sm flex items-center gap-2 ${
                        dispatchResult.success
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {dispatchResult.success
                          ? `✓ Đã dispatch ${dispatchResult.dispatched}/${dispatchResult.total} jobs → ${
                              dispatchResult.target === 'production-printer' ? 'Máy in vật lý (CUPS)' : 'Máy mô phỏng'
                            }`
                          : '✗ Dispatch thất bại. Vui lòng thử lại.'}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setOrderModalOpen(false)}>Đóng</Button>
                      <Button onClick={() => fetchOrderItems(selectedOrder?.orderNo)} disabled={orderItemsLoading}>
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${orderItemsLoading ? 'animate-spin' : ''}`} /> Làm mới
                      </Button>
                      <Button
                        id="btn-dispatch-order"
                        className="bg-brand hover:bg-brand/90 text-white ml-auto"
                        onClick={() => { setDispatchResult(null); setDispatchDialogOpen(true) }}
                        disabled={dispatchLoading}
                      >
                        <Zap className="h-3.5 w-3.5 mr-1.5" /> Dispatch...
                      </Button>
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Orders List */}
              <Card className="border border-border bg-card">
                <CardHeader className="py-4 px-6 border-b border-border bg-brand/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold tracking-wider text-brand uppercase flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        Danh sách lệnh sản xuất (Production Orders)
                      </CardTitle>
                      <CardDescription className="text-sm mt-1">Theo dõi tiến độ từng lệnh — nhấn vào để xem chi tiết từng sản phẩm</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={fetchOrders} disabled={ordersLoading}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${ordersLoading ? 'animate-spin' : ''}`} />
                      Làm mới
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {ordersLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-fg text-sm">
                      <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Đang tải...
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="text-center py-16 text-muted-fg text-sm">
                      <Database className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      Chưa có lệnh sản xuất nào. Gửi lệnh từ hệ thống nhà máy để bắt đầu.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {orders.map((order) => (
                        <div
                          key={order.id || order.orderNo}
                          onClick={() => handleOpenOrderDetail(order)}
                          className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface-1 hover:border-brand/40 hover:bg-brand/5 cursor-pointer transition-all duration-200 group"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              order.status === 'COMPLETED' ? 'bg-emerald-500/10' :
                              order.status === 'IN_PROGRESS' ? 'bg-blue-500/10' :
                              'bg-muted'
                            }`}>
                              <Database className={`h-5 w-5 ${
                                order.status === 'COMPLETED' ? 'text-emerald-400' :
                                order.status === 'IN_PROGRESS' ? 'text-blue-400' :
                                'text-muted-fg'
                              }`} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-foreground font-mono">{order.orderNo}</div>
                              <div className="text-xs text-muted-fg">{order.productCode}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-6 flex-shrink-0">
                            <div className="text-center hidden sm:block">
                              <div className="text-xs text-muted-fg">Kế hoạch</div>
                              <div className="font-bold text-sm text-foreground">{order.plannedQty}</div>
                            </div>
                            <div className="text-center hidden sm:block">
                              <div className="text-xs text-muted-fg">Hoàn thành</div>
                              <div className="font-bold text-sm text-emerald-400">{order.completedQty}</div>
                            </div>
                            <div className="text-center hidden sm:block">
                              <div className="text-xs text-muted-fg">Còn lại</div>
                              <div className="font-bold text-sm text-orange-400">{order.remainingQty}</div>
                            </div>
                            <div className="w-28">
                              <div className="flex justify-between text-[10px] text-muted-fg mb-1">
                                <span>Tiến độ</span>
                                <span className="font-bold text-brand">{order.progressPercent}%</span>
                              </div>
                              <div className="w-full bg-surface-2 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all duration-700 ${
                                    order.status === 'COMPLETED' ? 'bg-emerald-400' :
                                    order.status === 'IN_PROGRESS' ? 'bg-brand' :
                                    'bg-muted-fg'
                                  }`}
                                  style={{ width: `${order.progressPercent}%` }}
                                />
                              </div>
                            </div>
                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${
                              order.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                              order.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 animate-pulse' :
                              'bg-muted text-muted-fg'
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${
                                order.status === 'COMPLETED' ? 'bg-emerald-400' :
                                order.status === 'IN_PROGRESS' ? 'bg-blue-400' :
                                'bg-muted-fg'
                              }`} />
                              {order.status === 'COMPLETED' ? 'Hoàn thành' : order.status === 'IN_PROGRESS' ? 'Đang xử lý' : 'Đã tạo'}
                            </span>
                            <span className="text-muted-fg text-xs group-hover:text-brand transition-colors">→</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}



          {tab === 'alarms' && (
            <AlarmCenterTab stationId={stationId} signalRAlarm={signalRAlarm} />
          )}

          {/* ════ TAB: CONFIG ════════════════════════════════ */}
          {tab === 'config' && isSuperAdmin && (
            <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
              <Card className="border border-border bg-card">
                <CardHeader className="py-4 px-6 border-b border-border bg-brand/5">
                  <CardTitle className="text-base font-bold tracking-wider text-brand uppercase flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Cấu hình tham số trung tâm (Central Configuration Management)
                  </CardTitle>
                  <CardDescription className="text-sm">Quản lý các tham số thiết bị và ngưỡng mô phỏng lưu trong SQLite Store</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  {configLoading ? (
                    <div className="text-center py-10 text-muted-fg text-sm">Đang tải danh sách tham số cấu hình...</div>
                  ) : (
                    <div className="overflow-x-auto border border-border rounded-xl">
                      <TableEl>
                        <TableHeader className="bg-muted/40">
                          <TableRow>
                            <TableHead className="pl-4 font-bold text-foreground text-xs uppercase tracking-wider">Từ khóa (Key)</TableHead>
                            <TableHead className="font-bold text-foreground text-xs uppercase tracking-wider">Giá trị</TableHead>
                            <TableHead className="font-bold text-foreground text-xs uppercase tracking-wider">Mô tả</TableHead>
                            <TableHead className="pr-4 text-right font-bold text-xs uppercase tracking-wider">Hành động</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {configParams.map((param) => (
                            <TableRow key={param.key}>
                              <TableCell className="pl-4 font-mono font-bold text-foreground text-xs">{param.key}</TableCell>
                              <TableCell>
                                {configEditingKey === param.key ? (
                                  <Input
                                    value={configEditingValue}
                                    onChange={(e) => setConfigEditingValue(e.target.value)}
                                    className="h-8 max-w-xs text-xs font-mono font-bold"
                                  />
                                ) : (
                                  <code className="text-brand-light font-mono font-bold bg-brand/5 px-2 py-0.5 rounded border border-brand/10 text-xs">
                                    {param.value}
                                  </code>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-fg text-xs">{param.description || '—'}</TableCell>
                              <TableCell className="pr-4 text-right">
                                {configEditingKey === param.key ? (
                                  <div className="flex justify-end gap-1">
                                    <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveConfig(param.key, configEditingValue)}>
                                      Lưu
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfigEditingKey(null)}>
                                      Hủy
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      setConfigEditingKey(param.key)
                                      setConfigEditingValue(param.value)
                                    }}
                                  >
                                    Chỉnh sửa
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          {configParams.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-10 text-muted-fg text-sm">
                                Không tìm thấy tham số cấu hình nào.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </TableEl>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ════ TAB: DIAGNOSTICS ═══════════════════════════ */}
          {tab === 'diagnostics' && (
            <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
              {diagnosticsLoading && (
                <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-xs font-semibold text-brand-light animate-pulse">
                  Đang quét kết nối và tổng hợp số liệu hiệu năng hệ thống...
                </div>
              )}
              {/* KPI Cards */}
              {diagnosticsMetrics && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <Card>
                    <CardContent className="p-6 flex flex-col justify-between h-28">
                      <span className="text-xs uppercase text-muted-fg font-semibold">Tốc độ chạy máy (Throughput)</span>
                      <div className="text-3xl font-extrabold text-brand font-mono tracking-tight">
                        {diagnosticsMetrics.throughput} <span className="text-sm font-semibold text-muted-fg">sản phẩm/ngày</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6 flex flex-col justify-between h-28">
                      <span className="text-xs uppercase text-muted-fg font-semibold">Tỷ lệ đạt (Yield Rate)</span>
                      <div className="text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
                        {diagnosticsMetrics.passRate}%
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6 flex flex-col justify-between h-28">
                      <span className="text-xs uppercase text-muted-fg font-semibold">Tỷ lệ lỗi (Defect Rate)</span>
                      <div className="text-3xl font-extrabold text-red-400 font-mono tracking-tight">
                        {diagnosticsMetrics.failureRate}%
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Health checklist */}
                <Card className="lg:col-span-2">
                  <CardHeader className="py-4 px-6 border-b border-border bg-brand/5">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-brand flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Danh sách kiểm tra kết nối (Connection Checklist)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {diagnosticsHealth ? (
                      <div className="space-y-3">
                        {Object.entries(diagnosticsHealth).map(([key, val]: [string, any]) => (
                          <div key={key} className="flex justify-between items-center border-b border-border pb-2.5">
                            <span className="font-bold text-xs uppercase text-foreground font-mono">{key}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-fg font-mono">{val.latencyMs}ms</span>
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold ${val.status === 'Healthy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${val.status === 'Healthy' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                                {val.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-muted-fg text-sm">Đang quét cổng kết nối phần cứng...</div>
                    )}
                  </CardContent>
                </Card>

                {/* Latency Averages */}
                <Card>
                  <CardHeader className="py-4 px-6 border-b border-border bg-brand/5">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-brand flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Độ trễ trung bình (Average Step Latency)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {diagnosticsMetrics && diagnosticsMetrics.stepAverages ? (
                      <div className="space-y-4">
                        {Object.entries(diagnosticsMetrics.stepAverages).map(([step, time]: [string, any]) => (
                          <div key={step} className="space-y-1">
                            <div className="flex justify-between text-xs font-bold text-foreground">
                              <span>{step}</span>
                              <span className="font-mono text-brand-light">{Math.round(time)} ms</span>
                            </div>
                            <div className="w-full bg-surface-2 rounded-full h-2">
                              <div className="bg-brand h-2 rounded-full" style={{ width: `${Math.min((time / 3000) * 100, 100)}%` }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-muted-fg text-sm">Đang biên dịch số liệu độ trễ...</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ════ TAB: LABEL TEMPLATES ═══════════════════════════ */}
          {tab === 'templates' && (
            <div className="max-w-7xl mx-auto w-full">
              <LabelTemplatesTab />
            </div>
          )}



          {/* ════ TAB: RBAC ══════════════════════════════════ */}
          {tab === 'rbac' && isSuperAdmin && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">

              {/* Users list — spans 2 cols on xl */}
              <Card className="xl:col-span-2 overflow-hidden">
                <CardHeader className="border-b border-border px-6 py-4">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Users className="h-5 w-5 text-brand" />
                    Danh sách người dùng Kiosk
                  </CardTitle>
                  <CardDescription className="text-sm">Quản lý vai trò và quyền hạn của người vận hành trạm</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">

                  {/* Alerts */}
                  {rbacSuccess && (
                    <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-base text-emerald-400">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      {rbacSuccess}
                    </div>
                  )}
                  {rbacError && (
                    <div className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-base text-red-400">
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      {rbacError}
                    </div>
                  )}

                  {/* Table */}
                  <div className="rounded-lg border border-border overflow-x-auto">
                    <TableEl>
                      <TableHeader className="bg-surface-2">
                        <TableRow>
                          <TableHead className="pl-4 text-sm">Tên đăng nhập</TableHead>
                          <TableHead className="text-sm">Họ và tên</TableHead>
                          <TableHead className="text-sm">Vai trò</TableHead>
                          <TableHead className="text-sm">Quyền hạn</TableHead>
                          <TableHead className="text-sm">Cập nhật lần cuối</TableHead>
                          <TableHead className="pr-4 text-right text-sm">Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => {
                          const dateStr = u.updatedAt
                            ? new Date(u.updatedAt).toLocaleString('vi-VN', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                            : '-'

                          return (
                            <TableRow key={u.id} className={!u.isActive ? 'opacity-60 bg-surface-2/10' : ''}>
                              <TableCell className="pl-4 font-bold text-sm">
                                <div className="flex items-center gap-2">
                                  <span>{u.username}</span>
                                  {!u.isActive && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider">
                                      Tạm khóa
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-fg text-sm">{u.fullName}</TableCell>
                              <TableCell>
                                {u.roles.includes('SUPER_ADMIN') ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20 uppercase tracking-wide">
                                    <Shield className="h-3.5 w-3.5" />
                                    Admin hệ thống
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-muted text-muted-foreground border border-border uppercase tracking-wide">
                                    <User className="h-3.5 w-3.5" />
                                    Nhân viên
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-[220px]">
                                  {u.roles.includes('SUPER_ADMIN') ? (
                                    <span className="text-xs font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                                      Toàn quyền hệ thống
                                    </span>
                                  ) : (
                                    <>
                                      {u.directPermissions.length === 0 && (
                                        <span className="text-xs italic text-subtle-fg">Xem công việc (Mặc định)</span>
                                      )}
                                      {u.directPermissions.map((p: string) => (
                                        <PermissionBadge key={p} permission={p} className="text-xs" />
                                      ))}
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-fg text-sm">{dateStr}</TableCell>
                              <TableCell className="pr-4 text-right">
                                <div className="relative inline-block text-left user-actions-dropdown">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (activeDropdownUserId === u.id) {
                                        setActiveDropdownUserId(null);
                                        setDropdownPosition(null);
                                      } else {
                                        setActiveDropdownUserId(u.id);
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setDropdownPosition({
                                          top: rect.bottom + window.scrollY + 6,
                                          left: rect.right + window.scrollX - 208,
                                        });
                                      }
                                    }}
                                    className="inline-flex items-center justify-center h-10 w-10 rounded-lg hover:bg-surface-3 text-muted-fg hover:text-foreground transition-colors cursor-pointer border border-border-strong focus:outline-none focus:ring-2 focus:ring-primary"
                                    aria-label={`Actions for ${u.username}`}
                                  >
                                    <MoreVertical className="h-5 w-5" />
                                  </button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </TableEl>
                  </div>
                </CardContent>
              </Card>

              {/* Create user form */}
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border px-6 py-4">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Plus className="h-5 w-5 text-brand" />
                    Đăng ký người dùng mới
                  </CardTitle>
                  <CardDescription className="text-sm">Tạo tài khoản cho nhân viên vận hành trạm</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="newUsername" className="text-sm">Tên đăng nhập</Label>
                      <Input id="newUsername" type="text" required placeholder="Ví dụ: operator_nam"
                        className="text-sm" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="newFullName" className="text-sm">Họ và tên</Label>
                      <Input id="newFullName" type="text" required placeholder="Ví dụ: Nguyễn Văn Nam"
                        className="text-sm" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="newPassword" className="text-sm">Mật khẩu</Label>
                      <Input id="newPassword" type="password" required placeholder="Tối thiểu 6 ký tự"
                        className="text-sm" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Vai trò hệ thống</Label>
                      <Select value={newRole} onValueChange={setNewRole}>
                        <SelectTrigger className="w-full text-sm">
                          <SelectValue placeholder="Chọn vai trò" />
                        </SelectTrigger>
                        <SelectContent>
                          {CREATABLE_ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full mt-2 text-sm">
                      <Plus className="h-4 w-4" /> Tạo người dùng
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      {/* ── DIALOG: Record Details ───────────────────────── */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => { if (!open) setSelectedRecord(null) }}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-brand font-bold text-xl">
              <Clock className="h-5 w-5" />
              Chi tiết bản ghi sản xuất
            </DialogTitle>
            <DialogDescription className="text-muted-fg text-sm">
              Thông tin chi tiết của sản phẩm đã qua xử lý tại trạm.
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <span className="text-muted-fg font-medium">Lệnh sản xuất:</span>
                <span className="col-span-2 font-bold text-foreground">{selectedRecord.jobNo}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <span className="text-muted-fg font-medium">Mã sản phẩm:</span>
                <span className="col-span-2 font-semibold text-foreground">{selectedRecord.productCode}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <span className="text-muted-fg font-medium">Số Serial / UID:</span>
                <span className="col-span-2 font-mono text-foreground">{selectedRecord.productSerial || '—'}</span>
              </div>

              {/* Label preview — client-side rendering from active template */}
              {selectedRecord.productSerial && (
                <div className="border border-border/50 rounded-lg bg-slate-50/50 overflow-hidden flex flex-col items-center p-3">
                  <div className="w-full px-1 pb-2 text-xs font-semibold text-muted-fg uppercase tracking-wider border-b border-border/30 mb-3 text-left">
                    Xem trước nhãn in thực tế (QR 50x30)
                  </div>
                  <LabelPreview
                    template={activeTemplate}
                    data={{
                      production_order: selectedRecord.jobNo || '—',
                      work_order: selectedRecord.productSerial || 'N/A',
                      product_name: (selectedRecord.productCode || '—') + ' Bearing Seal',
                      product_code: selectedRecord.productCode || '—',
                      revision: 'Rev A',
                      lot_number: 'LOT-2026-07-A',
                      batch_number: 'BATCH-01',
                      serial_number: selectedRecord.productSerial || 'N/A',
                    }}
                    width={320}
                    className="rounded-md border border-border shadow-md"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <span className="text-muted-fg font-medium">Loại công việc:</span>
                <span className="col-span-2 font-semibold text-foreground">{translateJobType(selectedRecord.jobType)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <span className="text-muted-fg font-medium">Trạng thái:</span>
                <span className="col-span-2">
                  <StatusBadge status={selectedRecord.currentStatus} jobType={selectedRecord.jobType} />
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <span className="text-muted-fg font-medium">Mã trạm:</span>
                <span className="col-span-2 font-mono text-foreground">{selectedRecord.stationId}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <span className="text-muted-fg font-medium">Thời gian bắt đầu:</span>
                <span className="col-span-2 text-foreground">
                  {new Date(selectedRecord.createdAt).toLocaleString('vi-VN')}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                <span className="text-muted-fg font-medium">Thời gian cập nhật:</span>
                <span className="col-span-2 text-foreground">
                  {new Date(selectedRecord.updatedAt).toLocaleString('vi-VN')}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pb-1">
                <span className="text-muted-fg font-medium">Job ID:</span>
                <span className="col-span-2 font-mono text-sm text-muted-fg break-all">{selectedRecord.jobId}</span>
              </div>
            </div>
          )}


          <DialogFooter className="pt-2">
            <Button variant="outline" className="w-full text-sm" onClick={() => setSelectedRecord(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Reprint / Remark Overwrite ───────────── */}
      <Dialog open={isReprintListOpen} onOpenChange={setIsReprintListOpen}>
        <DialogContent
          className="w-[95vw] md:max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-500 font-bold text-xl">
              <PrinterIcon className="h-5 w-5" />
              Yêu cầu In / Khắc lại tem sản phẩm
            </DialogTitle>
            <DialogDescription className="text-muted-fg text-sm">
              Chọn một bản ghi sản xuất trong ngày hôm nay để gửi yêu cầu in hoặc khắc lại.
            </DialogDescription>
          </DialogHeader>

          {reprintSuccess && (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-base text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {reprintSuccess}
            </div>
          )}
          {reprintError && (
            <div className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-base text-red-400">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {reprintError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
            {/* Left Column: Today's list */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase text-muted-fg tracking-wider">Danh sách sản xuất hôm nay</h3>
              <div className="max-h-[300px] overflow-y-auto border border-border rounded-lg bg-surface-2 p-1 space-y-1">
                {todayRecords.map((rec) => {
                  const isSelected = selectedReprintRecord?.id === rec.id;
                  return (
                    <div
                      key={rec.id}
                      onClick={() => {
                        setSelectedReprintRecord(rec);
                        setReprintError('');
                        setReprintSuccess('');
                      }}
                      className={[
                        'p-2.5 rounded-md cursor-pointer transition-colors text-sm border space-y-1',
                        isSelected
                          ? 'bg-orange-500/10 border-orange-500/50 text-foreground'
                          : 'border-transparent hover:bg-surface-1 text-muted-fg hover:text-foreground'
                      ].join(' ')}
                    >
                      <div className="flex justify-between items-center font-bold">
                        <span className={isSelected ? 'text-orange-400' : 'text-foreground'}>{rec.jobNo}</span>
                        <span className="font-mono text-xs text-muted-fg">
                          {new Date(rec.updatedAt).toLocaleTimeString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>SKU: {rec.productCode}</span>
                        <span className="font-mono">SN: {rec.productSerial || '—'}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-muted-fg">{translateJobType(rec.jobType)}</span>
                        <StatusBadge status={rec.currentStatus} jobType={rec.jobType} className="px-1.5 py-0 text-[10px]" />
                      </div>
                    </div>
                  );
                })}
                {todayRecords.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-fg">
                    Không có bản ghi sản xuất nào hôm nay.
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Execution Form */}
            <div className="space-y-4 flex flex-col justify-between">
              {selectedReprintRecord ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border p-3 space-y-2 bg-surface-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-fg font-medium">Bản ghi chọn:</span>
                      <span className="font-bold text-orange-400">{selectedReprintRecord.jobNo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-fg font-medium">SKU:</span>
                      <span className="font-semibold text-foreground">{selectedReprintRecord.productCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-fg font-medium">Serial/UID:</span>
                      <span className="font-mono text-foreground">{selectedReprintRecord.productSerial || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-fg font-medium">Loại công việc:</span>
                      <span className="font-semibold text-foreground">{translateJobType(selectedReprintRecord.jobType)}</span>
                    </div>
                  </div>


                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-fg font-medium">Hành động thực hiện:</span>
                      <span className="font-bold text-brand-light bg-brand/10 px-2 py-0.5 rounded border border-brand/30">
                        {selectedReprintRecord.jobType.toUpperCase() === 'PRINT_ONLY' || selectedReprintRecord.jobType.toUpperCase() === 'PRINT_LABEL' ? 'IN LẠI NHÃN (REPRINT)' :
                          selectedReprintRecord.jobType.toUpperCase() === 'MARK_ONLY' || selectedReprintRecord.jobType.toUpperCase() === 'LASER_MARK' ? 'KHẮC LẠI LASER (RELASER)' :
                            'LÀM LẠI QUY TRÌNH (REPROCESS)'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-foreground">Lý do in/khắc lại *</Label>
                    <Select
                      value={reprintReasonCode}
                      onValueChange={setReprintReasonCode}
                    >
                      <SelectTrigger className="h-10 text-sm bg-transparent">
                        <SelectValue placeholder="Chọn lý do" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRINT_QUALITY">Lỗi chất lượng in (Print quality issue)</SelectItem>
                        <SelectItem value="LASER_UNREADABLE">Mã khắc không đọc được (Laser unreadable)</SelectItem>
                        <SelectItem value="WRONG_LABEL">Sai nhãn sản phẩm (Wrong label)</SelectItem>
                        <SelectItem value="VERIFICATION_FAILED">Lỗi xác thực vision (Verification failed)</SelectItem>
                        <SelectItem value="CUSTOMER_COMPLAINT">Khiếu nại từ khách hàng (Customer complaint)</SelectItem>
                        <SelectItem value="OPERATOR_MISTAKE">Thao tác viên nhầm lẫn (Operator mistake)</SelectItem>
                        <SelectItem value="MAINTENANCE_TEST">Kiểm tra & Bảo trì (Maintenance test)</SelectItem>
                        <SelectItem value="OTHER">Lý do khác (Cần ghi rõ bên dưới)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reprint-comment" className="text-sm font-bold text-foreground">Ghi chú chi tiết *</Label>
                    <textarea
                      id="reprint-comment"
                      required
                      rows={3}
                      placeholder="Nhập mô tả chi tiết lý do..."
                      value={reprintComment}
                      onChange={(e) => setReprintComment(e.target.value)}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <input
                      id="reprint-confirm"
                      type="checkbox"
                      checked={reprintConfirmed}
                      onChange={(e) => setReprintConfirmed(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-dark focus:ring-brand bg-transparent cursor-pointer"
                    />
                    <label htmlFor="reprint-confirm" className="text-xs font-medium text-foreground cursor-pointer select-none">
                      Tôi xác nhận chịu trách nhiệm thực hiện hành động in/khắc lại này.
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-fg bg-surface-2/40">
                  <PrinterIcon className="h-8 w-8 text-muted-fg/40 mb-2" />
                  Vui lòng chọn một bản ghi từ danh sách hôm nay bên trái để tiến hành in/khắc lại.
                </div>
              )}

              <DialogFooter className="border-t border-border pt-4 mt-auto">
                <Button
                  variant="outline"
                  disabled={submittingReprint}
                  onClick={() => setIsReprintListOpen(false)}
                  className="text-sm animate-duration-100"
                >
                  Hủy bỏ
                </Button>
                <Button
                  disabled={submittingReprint || !selectedReprintRecord || !reprintComment.trim() || !reprintConfirmed}
                  onClick={handleTriggerReprint}
                  className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold text-sm"
                >
                  {submittingReprint ? 'Đang gửi...' : 'Gửi yêu cầu'}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* ── DIALOG: History Details & Audit Trail ────────── */}
      {/* Replaced with reusable ProductionExecutionDetailModal component */}
      <ProductionExecutionDetailModal
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        record={selectedDetailRecord}
        activeTemplate={activeTemplate}
      />
      {/* ── MODAL: Edit permissions ──────────────────────── */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null) }}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5 text-primary" />
              Phân quyền trực tiếp
            </DialogTitle>
            <DialogDescription className="text-sm">
              Cấp hoặc thu hồi quyền cho tài khoản{' '}
              <strong className="text-foreground">{editingUser?.username}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[55vh] overflow-y-auto pr-1">
            {[
              {
                title: 'Vận hành sản xuất',
                codes: ['JOB_VIEW', 'JOB_REPROCESS']
              },
              {
                title: 'Quản trị',
                codes: ['USER_MANAGE']
              },
              {
                title: 'Hệ thống',
                codes: ['SYSTEM_ADMIN']
              }
            ].map((group) => {
              const groupPerms = availablePermissions.filter(p => group.codes.includes(p.code));
              if (groupPerms.length === 0) return null;

              return (
                <div key={group.title} className="space-y-2 border-b border-border pb-3 last:border-0 last:pb-0">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider">{group.title}</h4>
                  <div className="space-y-2">
                    {groupPerms.map((p) => {
                      const isChecked = userPermDraft.includes(p.code);
                      return (
                        <div
                          key={p.code}
                          onClick={() => handleTogglePermDraft(p.code)}
                          className={[
                            'flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer',
                            isChecked
                              ? 'border-primary/50 bg-primary/5'
                              : 'border-border hover:bg-surface-2',
                          ].join(' ')}
                        >
                          <Checkbox
                            id={`perm-${p.code}`}
                            checked={isChecked}
                            onCheckedChange={() => { }}
                            className="mt-0.5"
                          />
                          <div className="space-y-0.5">
                            <p className="text-base font-semibold leading-none">{translatePermission(p.code)}</p>
                            <p className="text-sm text-muted-fg">{p.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="border-t border-border pt-4">
            <Button variant="outline" className="text-sm" onClick={() => setEditingUser(null)}>Hủy bỏ</Button>
            <Button variant="success" className="text-sm" onClick={handleSavePermissions}>
              <CheckCircle2 className="h-4 w-4" /> Lưu phân quyền
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM: Delete user ─────────────────────────── */}
      <ConfirmDialog
        open={!!userToDelete}
        title="Xác nhận xóa người dùng"
        description={`Bạn có chắc chắn muốn xóa tài khoản "${userToDelete?.username}"? Hành động này không thể hoàn tác.`}
        confirmText="Xóa tài khoản"
        confirmVariant="destructive"
        onConfirm={handleConfirmDeleteUser}
        onCancel={() => setUserToDelete(null)}
      />

      {/* ── CONFIRM: Toggle user active state ────────────── */}
      <ConfirmDialog
        open={!!userToToggleActive}
        title={userToToggleActive?.isActive ? "Xác nhận vô hiệu hóa tài khoản" : "Xác nhận kích hoạt tài khoản"}
        description={
          userToToggleActive?.isActive
            ? `Bạn có chắc chắn muốn vô hiệu hóa tài khoản "${userToToggleActive?.username}"? Người dùng này sẽ không thể đăng nhập vào kiosk.`
            : `Bạn có chắc chắn muốn kích hoạt lại tài khoản "${userToToggleActive?.username}"?`
        }
        confirmText={userToToggleActive?.isActive ? "Vô hiệu hóa" : "Kích hoạt"}
        confirmVariant={userToToggleActive?.isActive ? "destructive" : "success"}
        onConfirm={handleConfirmToggleActive}
        onCancel={() => setUserToToggleActive(null)}
      />

      {/* ── DIALOG: Reset Operator Password ────────── */}
      <Dialog open={!!resetPwdUser} onOpenChange={(open) => { if (!open) setResetPwdUser(null) }}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5 text-amber-500" />
              Đặt lại mật khẩu operator
            </DialogTitle>
            <DialogDescription className="text-sm">
              Đổi mật khẩu cho tài khoản <strong className="text-foreground">{resetPwdUser?.username}</strong>. Hành động này sẽ được ghi vào nhật ký kiểm toán.
            </DialogDescription>
          </DialogHeader>

          {resetError && (
            <div className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-base text-red-400">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {resetError}
            </div>
          )}
          {resetSuccess && (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-base text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {resetSuccess}
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="new-pwd-val">Mật khẩu mới * (Tối thiểu 6 ký tự)</Label>
              <Input
                id="new-pwd-val"
                type="password"
                placeholder="Nhập mật khẩu mới..."
                value={newPasswordVal}
                onChange={(e) => setNewPasswordVal(e.target.value)}
                className="h-10 text-sm bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reset-reason">Lý do đặt lại mật khẩu *</Label>
              <Input
                id="reset-reason"
                type="text"
                placeholder="Ví dụ: Operator quên mật khẩu..."
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                className="h-10 text-sm bg-transparent"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-4 mt-2">
            <Button variant="outline" className="text-sm" onClick={() => setResetPwdUser(null)}>Hủy bỏ</Button>
            <Button
              variant="success"
              className="text-sm"
              disabled={!newPasswordVal || newPasswordVal.length < 6 || !resetReason.trim()}
              onClick={handleResetPasswordSubmit}
            >
              Đặt lại mật khẩu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM: Reset password ──────────────────────── */}
      <ConfirmDialog
        open={resetPwdConfirmOpen}
        title="Xác nhận đặt lại mật khẩu"
        description="Bạn sắp thay đổi mật khẩu của tài khoản này. Hành động này sẽ được ghi nhận vào nhật ký hệ thống. Bạn có muốn tiếp tục?"
        confirmText="Đặt lại"
        confirmVariant="success"
        onConfirm={handleConfirmResetPassword}
        onCancel={() => setResetPwdConfirmOpen(false)}
      />

      {/* ── CONFIRM: Update permissions ──────────────────── */}
      <ConfirmDialog
        open={permConfirmOpen}
        title="Xác nhận cập nhật phân quyền"
        description="Bạn sắp thay đổi quyền trực tiếp của người dùng này. Hành động này sẽ được ghi nhận vào nhật ký hệ thống. Bạn có muốn tiếp tục?"
        confirmText="Cập nhật"
        confirmVariant="primary"
        onConfirm={handleConfirmSavePermissions}
        onCancel={() => setPermConfirmOpen(false)}
      />

      {/* ── CONFIRM: Manual Reprocess / Retry ────────────── */}
      <ConfirmDialog
        open={overrideConfirmOpen}
        title={overrideConfirmData?.title || 'Xác nhận hành động'}
        description={overrideConfirmData?.description || ''}
        confirmText="Xác nhận"
        confirmVariant="primary"
        onConfirm={handleConfirmTriggerReprint}
        onCancel={() => setOverrideConfirmOpen(false)}
      />

      {/* ── DIALOG: Audit History Timeline ──────────────── */}
      <Dialog open={!!auditLogUser} onOpenChange={(open) => { if (!open) setAuditLogUser(null) }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-primary" />
              Lịch sử kiểm toán của {auditLogUser?.username}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Nhật ký các hoạt động bảo mật, đăng nhập, phân quyền, và các thao tác ghi đè thủ công của tài khoản này.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 max-h-[60vh] overflow-y-auto pr-1">
            {isAuditLogsLoading ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-fg animate-pulse">
                Đang tải nhật ký kiểm toán...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-10 text-muted-fg">
                Không tìm thấy nhật ký kiểm toán nào cho người dùng này.
              </div>
            ) : (
              <div className="relative pl-6 border-l-2 border-border-strong space-y-6 ml-3">
                {auditLogs.map((log) => {
                  const date = new Date(log.performedAt);
                  const dateStr = date.toLocaleDateString('vi-VN');
                  const timeStr = date.toLocaleTimeString('vi-VN');

                  const isSuccess = log.result?.toUpperCase() === 'SUCCESS';
                  const isFailed = log.result?.toUpperCase() === 'FAILED' || log.result?.toUpperCase() === 'DENIED';

                  const detail = log.detail || {};
                  const reasonText = detail.Reason || detail.reason || log.actionName || '';
                  const oldValue = detail.OldValue || detail.oldValue;
                  const newValue = detail.NewValue || detail.newValue;

                  // Style based on action type
                  let badgeColor = 'bg-primary/10 text-primary border-primary/20';
                  if (log.actionName?.includes('DENIED') || log.actionName?.includes('FAILED')) {
                    badgeColor = 'bg-red-500/10 text-red-400 border-red-500/20';
                  } else if (log.actionName?.includes('SUCCESS') || log.actionName?.includes('ENABLED') || log.actionName?.includes('CREATED')) {
                    badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                  }

                  return (
                    <div key={log.id} className="relative group">
                      {/* Timeline dot */}
                      <span className={[
                        'absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border bg-background transition-colors',
                        isSuccess ? 'border-emerald-500 text-emerald-500' : isFailed ? 'border-red-500 text-red-500' : 'border-border'
                      ].join(' ')}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isSuccess ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-muted-fg'}`} />
                      </span>

                      <div className="bg-surface-2 hover:bg-surface-3 border border-border rounded-lg p-4 transition-colors space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeColor}`}>
                            {log.actionName}
                          </span>
                          <span className="text-xs text-muted-fg font-medium">
                            {timeStr} - {dateStr}
                          </span>
                        </div>

                        <p className="text-sm font-semibold text-foreground leading-relaxed">
                          {reasonText}
                        </p>

                        {(oldValue !== undefined || newValue !== undefined) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border/50 text-xs">
                            {oldValue !== undefined && oldValue !== '' && (
                              <div>
                                <span className="text-muted-fg font-medium block">Giá trị cũ:</span>
                                <span className="font-mono bg-surface-3 px-1.5 py-0.5 rounded border border-border inline-block mt-0.5 max-w-full truncate">
                                  {oldValue}
                                </span>
                              </div>
                            )}
                            {newValue !== undefined && newValue !== '' && (
                              <div>
                                <span className="text-muted-fg font-medium block">Giá trị mới:</span>
                                <span className="font-mono bg-surface-3 px-1.5 py-0.5 rounded border border-border inline-block mt-0.5 max-w-full truncate text-primary font-bold">
                                  {newValue}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t border-border">
            <Button variant="outline" className="w-full text-sm font-bold" onClick={() => setAuditLogUser(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PORTAL: User Actions Menu ───────────────────── */}
      {activeDropdownUserId && dropdownPosition && (() => {
        const u = users.find(user => user.id === activeDropdownUserId);
        if (!u) return null;
        return createPortal(
          <div
            className="absolute w-52 rounded-lg bg-surface-2 border border-border shadow-xl z-9999 p-1 divide-y divide-border text-left portal-dropdown-content"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
            }}
          >
            <div className="py-1">
              <button
                onClick={() => {
                  setActiveDropdownUserId(null);
                  setDropdownPosition(null);
                  startEditPermissions(u);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-surface-3 hover:text-primary rounded-md transition-colors cursor-pointer text-left font-medium"
              >
                <ShieldAlert className="h-4 w-4 text-primary" />
                <span>Phân quyền</span>
              </button>

              <button
                onClick={() => {
                  setActiveDropdownUserId(null);
                  setDropdownPosition(null);
                  startResetPassword(u);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-surface-3 hover:text-primary rounded-md transition-colors cursor-pointer text-left font-medium"
              >
                <Key className="h-4 w-4 text-amber-500" />
                <span>Đặt lại mật khẩu</span>
              </button>

              <button
                onClick={() => {
                  setActiveDropdownUserId(null);
                  setDropdownPosition(null);
                  showAuditLogs(u);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-surface-3 hover:text-primary rounded-md transition-colors cursor-pointer text-left font-medium"
              >
                <History className="h-4 w-4 text-primary" />
                <span>Lịch sử kiểm toán</span>
              </button>
            </div>

            {u.username !== PROTECTED_ADMIN_USERNAME && (
              <div className="py-1">
                <button
                  onClick={() => {
                    setActiveDropdownUserId(null);
                    setDropdownPosition(null);
                    setUserToToggleActive(u);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-surface-3 rounded-md transition-colors cursor-pointer text-left font-medium"
                >
                  {u.isActive ? (
                    <>
                      <UserX className="h-4 w-4 text-red-400" />
                      <span className="text-red-400">Vô hiệu hóa</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400">Kích hoạt</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setActiveDropdownUserId(null);
                    setDropdownPosition(null);
                    setUserToDelete(u);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10 font-bold rounded-md transition-colors cursor-pointer text-left"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                  <span>Xóa tài khoản</span>
                </button>
              </div>
            )}
          </div>,
          document.body
        );
      })()}
    </div>
  )
}
