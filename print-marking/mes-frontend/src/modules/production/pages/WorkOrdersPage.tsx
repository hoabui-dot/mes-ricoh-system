import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { 
  Play, 
  Search, 
  ChevronRight, 
  RefreshCw, 
  Activity,
  Server,
  ArrowUpRight,
  Clock,
  Eye,
  Settings,
  CheckCircle,
  XCircle,
  Pause,
  Layers,
  ChevronDown,
  Trash2,
  Cpu,
  Database
} from 'lucide-react'
import { PageHeader, Spinner, EmptyState } from '@/components/common'
import { apiGet, apiPost } from '@/services/api-client'
import { toast } from '@/stores/toast.store'
import { cn } from '@/utils/cn'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'

interface WorkOrderDTO {
  id: string
  production_order_id: string
  routing_id: string
  sequence: number
  status: string
  started_at?: string
  completed_at?: string
  dispatch_plan_id?: string
  serial_number: string
  barcode: string
  qr_code: string
  current_step: string
  current_attempt: number
  assigned_station: string
  assigned_team: string
  trace_id: string
  retry_history: string // JSON string
  gateway_job_id?: string
  current_operation: string
  workflow_progress: number
  timelines?: {
    id: string
    work_order_id: string
    stage: string
    status: string
    detail: string
    occurred_at: string
  }[]
  simulator_details?: any
  operations?: any[]
  created_at: string
  updated_at: string
}

export function WorkOrdersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Parent selection and search states
  const [parentSearch, setParentSearch] = React.useState('')
  const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false)

  // Inner filter states (for individual work orders in modal)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [stationFilter, setStationFilter] = React.useState('')
  const [teamFilter, setTeamFilter] = React.useState('')
  
  // Modal detail states
  const [selectedWoId, setSelectedWoId] = React.useState<string | null>(null)
  const [isWoDetailOpen, setIsWoDetailOpen] = React.useState(false)
  const [selectedOpIdx, setSelectedOpIdx] = React.useState<number>(0)

  // Dispatch Panel States
  const [configStation, setConfigStation] = React.useState('Station-Combined-01')
  const [configTeam, setConfigTeam] = React.useState('')
  const [configOperation, setConfigOperation] = React.useState('')
  const [dispatchQty, setDispatchQty] = React.useState(10)
  const [dispatchStrategy, setDispatchStrategy] = React.useState('FIFO') // FIFO, SELECTED, REMAINING, FAILED

  // Failed Recovery states
  const [editingFailedWoId, setEditingFailedWoId] = React.useState<string | null>(null)
  const [recoveryStation, setRecoveryStation] = React.useState('Station-Combined-01')
  const [recoveryTeam, setRecoveryTeam] = React.useState('')

  // Selection for strategy execution
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  // Pagination for inner work orders
  const [page, setPage] = React.useState(1)
  const pageSize = 8

  // ─── Queries ───
  
  // Fetch parent Production Orders
  const { data: parentOrdersRes, isLoading: isParentLoading } = useQuery({
    queryKey: ['production-orders-work-list', parentSearch],
    queryFn: () => {
      let url = '/production-orders?page_size=100'
      if (parentSearch) url += `&search=${encodeURIComponent(parentSearch)}`
      return apiGet<any>(url)
    }
  })
  const parentOrders = (parentOrdersRes?.data as any) ?? []
  const selectedOrder = parentOrders.find((o: any) => o.id === selectedOrderId)

  // Fetch Teams dynamically from Workforce Module
  const { data: teamsRes } = useQuery({
    queryKey: ['teams-list'],
    queryFn: () => apiGet<any[]>('/teams')
  })
  const teams = (teamsRes?.data as any[]) || []

  // Fetch all workflow templates to lookup operations
  const { data: workflowsRes } = useQuery({
    queryKey: ['workflows-templates'],
    queryFn: () => apiGet<any[]>('/workflows'),
  })
  const workflows = workflowsRes?.data ?? []

  // Initialize configTeam when teams are loaded
  React.useEffect(() => {
    if (teams.length > 0 && !configTeam) {
      setConfigTeam(teams[0].code || teams[0].name)
    }
  }, [teams, configTeam])

  // Get active workflow operations for selected order
  const selectedOrderWorkflow = workflows.find((w: any) => w.id === selectedOrder?.workflow_id)
  const workflowOperations = selectedOrderWorkflow?.operations || [
    { operation_type: 'PRINT_LABEL', station_type: 'PRINT_STATION' },
    { operation_type: 'LASER_MARK', station_type: 'LASER_STATION' },
    { operation_type: 'OCR_VERIFY', station_type: 'VISION_STATION' },
    { operation_type: 'VISION_INSPECTION', station_type: 'VISION_STATION' }
  ]

  // Initialize configOperation when workflow operations are loaded
  React.useEffect(() => {
    if (workflowOperations.length > 0 && !configOperation) {
      setConfigOperation(workflowOperations[0].operation_type)
    }
  }, [workflowOperations, configOperation])

  // Fetch ALL individual Work Orders for selected order (for metrics and strategies calculation)
  const { data: allWoRes } = useQuery({
    queryKey: ['all-work-orders', selectedOrderId],
    queryFn: () => {
      if (!selectedOrderId) return null
      return apiGet<any>(`/work-orders?production_order_id=${selectedOrderId}&page_size=10000`)
    },
    enabled: !!selectedOrderId,
  })
  const allWorkOrders = (allWoRes?.data as any[]) || []

  // Fetch paginated individual Work Orders for selected order
  const { data: res, isLoading: isWoLoading, refetch } = useQuery({
    queryKey: ['work-orders', selectedOrderId, page, statusFilter, stationFilter, teamFilter, searchTerm],
    queryFn: () => {
      if (!selectedOrderId) return null
      let url = `/work-orders?production_order_id=${selectedOrderId}&page=${page}&page_size=${pageSize}`
      if (statusFilter) url += `&status=${statusFilter}`
      if (stationFilter) url += `&station=${stationFilter}`
      if (teamFilter) url += `&team=${teamFilter}`
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`
      return apiGet<any>(url)
    },
    enabled: !!selectedOrderId,
  })

  const workOrders = (res?.data as any) || []
  const totalCount = res?.pagination?.total_items || 0
  const totalPages = Math.ceil(totalCount / pageSize)

  // Fetch Single Work Order Detail for telemetry view
  const { data: detailRes, isLoading: isDetailLoading } = useQuery({
    queryKey: ['work-order-detail', selectedWoId],
    queryFn: () => {
      if (!selectedWoId) return null
      return apiGet<WorkOrderDTO>(`/work-orders/${selectedWoId}`)
    },
    enabled: !!selectedWoId,
  })
  const selectedWo = detailRes?.data

  // ─── Mutations ───

  // Single Work Order dispatch trigger
  const { mutate: dispatchWorkOrder } = useMutation({
    mutationFn: ({ id, station, team, operation }: { id: string; station: string; team?: string; operation?: string }) => 
      apiPost(`/work-orders/${id}/dispatch`, { station, team, operation }),
    onSuccess: () => {
      toast.success(t('orders_module.dispatchedSuccess', { defaultValue: 'Đã gửi lệnh sản xuất thành công!' }))
      queryClient.invalidateQueries({ queryKey: ['work-orders'] })
      queryClient.invalidateQueries({ queryKey: ['all-work-orders'] })
      queryClient.invalidateQueries({ queryKey: ['work-order-detail'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Dispatch failed')
    }
  })

  // Bulk dispatch trigger
  const { mutate: bulkDispatch } = useMutation({
    mutationFn: (variables: { work_order_ids: string[]; station: string; team?: string; operation?: string }) =>
      apiPost('/work-orders/bulk-dispatch', variables),
    onSuccess: () => {
      toast.success(t('orders_module.bulkDispatchedSuccess', { defaultValue: 'Đã gửi lệnh sản xuất hàng loạt thành công!' }))
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['work-orders'] })
      queryClient.invalidateQueries({ queryKey: ['all-work-orders'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Bulk dispatch failed')
    }
  })

  // Cancel Work Order trigger
  const { mutate: cancelWorkOrder } = useMutation({
    mutationFn: (id: string) => apiPost(`/work-orders/${id}/cancel`, {}),
    onSuccess: () => {
      toast.success('Đã hủy đơn làm việc thành công!')
      queryClient.invalidateQueries({ queryKey: ['work-orders'] })
      queryClient.invalidateQueries({ queryKey: ['all-work-orders'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Cancel failed')
    }
  })

  // Real-time SSE listener setup for Work Orders state changes
  React.useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL || '/api/v1'
    const eventSource = new EventSource(`${baseUrl.trimEnd('/')}/work-orders/stream`)

    eventSource.addEventListener('work_order_update', () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] })
      queryClient.invalidateQueries({ queryKey: ['all-work-orders'] })
      queryClient.invalidateQueries({ queryKey: ['work-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['production-orders-work-list'] })
    })

    return () => {
      eventSource.close()
    }
  }, [queryClient])

  // Calculation of Summary Metrics dynamically
  const targetQty = selectedOrder?.quantity || allWorkOrders.length || 0
  const completedCount = allWorkOrders.filter(w => w.status === 'completed').length
  const pendingCount = allWorkOrders.filter(w => w.status === 'pending').length
  const runningCount = allWorkOrders.filter(w => [
    'in_progress', 'queued', 'dispatched', 'accepted', 'printing', 
    'print_completed', 'laser_running', 'laser_completed', 'vision_running', 'vision_passed', 'retry'
  ].includes(w.status)).length
  const failedCount = allWorkOrders.filter(w => [
    'vision_failed', 'rejected'
  ].includes(w.status)).length
  const remainingCount = Math.max(0, targetQty - completedCount)
  const progressPercentage = targetQty > 0 ? Math.round((completedCount / targetQty) * 100) : 0

  // Selection handlers
  const handleSelectRow = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const handleSelectAll = () => {
    if (selectedIds.size === workOrders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(workOrders.map((w: any) => w.id)))
    }
  }

  // Execute Batch Dispatch operation
  const handleBatchDispatchSubmit = () => {
    let targetIds: string[] = []

    if (dispatchStrategy === 'FIFO') {
      const pendingWo = allWorkOrders.filter(w => w.status === 'pending')
      targetIds = pendingWo.slice(0, dispatchQty).map(w => w.id)
    } else if (dispatchStrategy === 'SELECTED') {
      targetIds = Array.from(selectedIds)
    } else if (dispatchStrategy === 'REMAINING') {
      const pendingWo = allWorkOrders.filter(w => w.status === 'pending')
      targetIds = pendingWo.map(w => w.id)
    } else if (dispatchStrategy === 'FAILED') {
      const failedWo = allWorkOrders.filter(w => ['vision_failed', 'rejected'].includes(w.status))
      targetIds = failedWo.map(w => w.id)
    }

    if (targetIds.length === 0) {
      toast.info('Không tìm thấy đơn làm việc nào phù hợp với chiến lược đã chọn.')
      return
    }

    bulkDispatch({
      work_order_ids: targetIds,
      station: configStation,
      team: configTeam,
      operation: configOperation
    })
  }

  // Row recovery triggers
  const handleStartRecoveryEdit = (wo: any) => {
    setEditingFailedWoId(wo.id)
    setRecoveryStation(wo.assigned_station || 'Station-Combined-01')
    setRecoveryTeam(wo.assigned_team || (teams.length > 0 ? teams[0].code : ''))
  }

  const handleSaveRecovery = (id: string) => {
    dispatchWorkOrder({
      id,
      station: recoveryStation,
      team: recoveryTeam,
      operation: workOrders.find((w: any) => w.id === id)?.current_operation
    })
    setEditingFailedWoId(null)
  }

  const getStatusStyle = (status: string) => {
    const s = status ? status.toLowerCase() : ''
    if (s === 'completed') return { bg: 'bg-emerald-50 text-emerald-600 border border-emerald-200', label: 'Completed' }
    if (s.includes('fail') || s === 'rejected') return { bg: 'bg-rose-50 text-rose-600 border border-rose-200', label: 'Failed' }
    if (s === 'pending') return { bg: 'bg-orange-50 text-orange-600 border border-orange-200', label: 'Pending' }
    if (s === 'paused') return { bg: 'bg-slate-100 text-slate-650 border border-slate-300', label: 'Paused' }
    return { bg: 'bg-blue-50 text-blue-600 border border-blue-200', label: status ? status.toUpperCase() : 'PENDING' }
  }

  return (
    <div className="fade-in flex flex-col gap-6">
      {/* Visual Animation Keyframes */}
      <style>{`
        @keyframes scanLine {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>

      <PageHeader
        title={t('work_orders_module.title', { defaultValue: 'Trung tâm Vận hành & Phân phát (Work Orders)' })}
        description={t('work_orders_module.subtitle', { defaultValue: 'Quản lý, phân phát trạm và theo dõi tiến trình sản xuất theo đơn hàng và từng sản phẩm' })}
      />

      {/* Execution Dashboard Header (Online Stations / Status Overview) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500">
            <Cpu size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Trạm kết nối (Online Stations)</div>
            <div className="text-md font-bold text-slate-700">Station-Combined-01, STATION-01</div>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center text-sky-500">
            <Database size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Gateway Status</div>
            <div className="text-md font-bold text-slate-700">Connected (Active Listener)</div>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500">
            <Activity size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Thiết bị ngoại vi</div>
            <div className="text-md font-bold text-slate-750">Printers, Laser Engravers, OCR Camera</div>
          </div>
        </div>
      </div>

      {/* Parent Search Panel */}
      <div className="card p-4 flex gap-4 items-center bg-white border border-slate-200 shadow-sm rounded-xl">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9 w-full bg-slate-50 border-slate-200 hover:border-slate-350 focus:bg-white rounded-lg text-xs"
            placeholder="Tìm kiếm đơn sản xuất theo số đơn hàng, tên sản phẩm..."
            value={parentSearch}
            onChange={(e) => setParentSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Parent Orders Table */}
      <div className="card overflow-hidden bg-white border border-slate-200 shadow-sm rounded-xl">
        <div style={{ overflowX: 'auto' }}>
          <table className="mes-table w-full">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-left text-slate-550 text-[10px] font-bold uppercase tracking-wider">
                <th className="p-3">Mã đơn hàng</th>
                <th className="p-3">Sản phẩm</th>
                <th className="p-3 text-center">Số lượng</th>
                <th className="p-3">Tiến độ gia công</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Hạn giao hàng</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isParentLoading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center">
                    <Spinner size={24} />
                  </td>
                </tr>
              ) : parentOrders.length > 0 ? (
                parentOrders.map((order: any) => {
                  const progressPct = order.quantity > 0 ? Math.round((order.quantity_completed / order.quantity) * 100) : 0
                  return (
                    <tr 
                      key={order.id} 
                      onClick={() => {
                        setSelectedOrderId(order.id)
                        setIsDetailModalOpen(true)
                      }}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    >
                      <td className="p-3 font-mono font-bold text-slate-900">{order.order_number}</td>
                      <td className="p-3 text-slate-700">{order.product}</td>
                      <td className="p-3 text-center font-bold text-slate-800">{order.quantity} pcs</td>
                      <td className="p-3 min-w-[160px]">
                        <div className="flex justify-between text-[11px] mb-1 font-medium text-slate-500">
                          <span>{order.quantity_completed} / {order.quantity}</span>
                          <span>{progressPct}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={cn(
                          "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide",
                          order.production_status === 'completed' ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-orange-50 text-orange-600 border border-orange-200"
                        )}>
                          {order.production_status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">{order.due_date ? new Date(order.due_date).toLocaleDateString() : 'N/A'}</td>
                      <td className="p-3 text-right">
                        <button 
                          className="btn btn-outline btn-xs flex items-center justify-end gap-1.5 border-slate-200 hover:bg-slate-50 rounded-lg text-slate-750 ml-auto h-7 px-2.5" 
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedOrderId(order.id)
                            setIsDetailModalOpen(true)
                          }}
                        >
                          <Eye size={12} /> Dispatch & Vận hành
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center">
                    <EmptyState title="Không tìm thấy đơn sản xuất" description="Vui lòng tạo hoặc giải phóng đơn hàng để bắt đầu sản xuất." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Wide Details & Dispatch Dialog Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="sm:max-w-[1280px] w-[95vw] max-h-[92vh] overflow-y-auto p-6 bg-white border border-slate-200 shadow-2xl rounded-2xl flex flex-col gap-5">
          <DialogHeader className="border-b border-slate-100 pb-4 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <Activity size={20} className="text-orange-500" />
              Điều hành chi tiết Đơn làm việc: <strong className="font-mono text-orange-500">{selectedOrder?.order_number}</strong>
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="flex flex-col gap-5 flex-1">
              
              {/* Production Summary Cards Dashboard */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5">
                <div className="p-3.5 bg-slate-50 border border-slate-200/60 rounded-xl flex flex-col gap-1 shadow-sm">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider font-semibold">Quy mô</span>
                  <span className="text-xl font-bold text-slate-800">{targetQty}</span>
                </div>
                <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl flex flex-col gap-1 shadow-sm">
                  <span className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider flex items-center gap-1 font-semibold">
                    <CheckCircle size={10} /> Completed
                  </span>
                  <span className="text-xl font-bold text-emerald-600">{completedCount}</span>
                </div>
                <div className="p-3.5 bg-blue-50/50 border border-blue-200 rounded-xl flex flex-col gap-1 shadow-sm">
                  <span className="text-[10px] text-blue-600 uppercase font-bold tracking-wider flex items-center gap-1 font-semibold">
                    <RefreshCw size={10} className="animate-spin" style={{ animationDuration: '3s' }} /> Running
                  </span>
                  <span className="text-xl font-bold text-blue-600">{runningCount}</span>
                </div>
                <div className="p-3.5 bg-rose-50/50 border border-rose-200 rounded-xl flex flex-col gap-1 shadow-sm">
                  <span className="text-[10px] text-rose-600 uppercase font-bold tracking-wider flex items-center gap-1 font-semibold">
                    <XCircle size={10} /> Failed
                  </span>
                  <span className="text-xl font-bold text-rose-600">{failedCount}</span>
                </div>
                <div className="p-3.5 bg-orange-50/50 border border-orange-200 rounded-xl flex flex-col gap-1 shadow-sm">
                  <span className="text-[10px] text-orange-600 uppercase font-bold tracking-wider flex items-center gap-1 font-semibold">
                    <Pause size={10} /> Pending
                  </span>
                  <span className="text-xl font-bold text-orange-600">{pendingCount}</span>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200/60 rounded-xl flex flex-col gap-1 shadow-sm">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider font-semibold">Scrap Quantity</span>
                  <span className="text-xl font-bold text-rose-500">{selectedOrder.scrap_quantity || 0}</span>
                </div>
              </div>

              {/* General Progress Bar */}
              <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-650">
                  <span>Tiến độ hoàn thành tổng thể</span>
                  <span>{progressPercentage}% ({completedCount} / {targetQty} pcs)</span>
                </div>
                <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${progressPercentage}%` }} 
                  />
                </div>
              </div>

              {/* Centralized Dispatch Configuration Panel */}
              <div className="p-4 bg-slate-50/50 border border-slate-200 rounded-xl flex flex-col gap-4 shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2.5">
                  <Layers size={14} className="text-orange-500" />
                  <h3 className="text-xs font-bold uppercase text-slate-700 tracking-wider">Cấu hình phân phát lô sản xuất (Batch Dispatch Control)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Manufacturing Operation Selection */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-550 uppercase">Công đoạn gia công (Operation)</label>
                    <select 
                      className="select w-full bg-white border-slate-200 hover:border-slate-350 text-xs rounded-lg h-9 px-3"
                      value={configOperation}
                      onChange={(e) => setConfigOperation(e.target.value)}
                    >
                      {workflowOperations.map((op: any, index: number) => (
                        <option key={index} value={op.operation_type}>
                          {op.operation_type} ({op.station_type})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Integration Station Selection */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-550 uppercase">Trạm phân phát (Station)</label>
                    <select 
                      className="select w-full bg-white border-slate-200 hover:border-slate-350 text-xs rounded-lg h-9 px-3"
                      value={configStation}
                      onChange={(e) => setConfigStation(e.target.value)}
                    >
                      <option value="Station-Combined-01">Station-Combined-01 (Tự động)</option>
                      <option value="STATION-01">STATION-01 (Dự phòng)</option>
                    </select>
                  </div>

                  {/* Execution Team Selection */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-550 uppercase">Nhóm thực thi (Workforce Team)</label>
                    <select 
                      className="select w-full bg-white border-slate-200 hover:border-slate-350 text-xs rounded-lg h-9 px-3"
                      value={configTeam}
                      onChange={(e) => setConfigTeam(e.target.value)}
                    >
                      {teams.map((t: any) => (
                        <option key={t.id} value={t.code || t.name}>
                          {t.name} ({t.code})
                        </option>
                      ))}
                      {teams.length === 0 && (
                        <option value="">Không có nhóm khả dụng</option>
                      )}
                    </select>
                  </div>

                  {/* Strategy Selection */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-550 uppercase">Chiến lược phân phát (Strategy)</label>
                    <select 
                      className="select w-full bg-white border-slate-200 hover:border-slate-350 text-xs rounded-lg h-9 px-3"
                      value={dispatchStrategy}
                      onChange={(e) => setDispatchStrategy(e.target.value)}
                    >
                      <option value="FIFO">First N Work Orders (FIFO)</option>
                      <option value="SELECTED">Selected Work Orders (Đã chọn)</option>
                      <option value="REMAINING">Remaining Work Orders (Còn lại)</option>
                      <option value="FAILED">Failed Work Orders Only (Lỗi)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2.5 border-t border-slate-200/60">
                  {/* Dispatch Quantity selection if FIFO */}
                  {dispatchStrategy === 'FIFO' ? (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Số lượng lô:</label>
                      <input 
                        type="number"
                        min={1}
                        max={1000}
                        className="input w-20 bg-white border border-slate-200 hover:border-slate-350 text-xs rounded-lg h-8 px-2 font-semibold text-slate-700"
                        value={dispatchQty}
                        onChange={(e) => setDispatchQty(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                    </div>
                  ) : <div />}

                  <button 
                    className="btn btn-primary rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 px-5 h-9 shadow-sm"
                    onClick={handleBatchDispatchSubmit}
                  >
                    Bắt đầu Sản xuất lô (Dispatch Strategy)
                  </button>
                </div>
              </div>

              {/* Sub Search & Pagination Filters */}
              <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200/60 rounded-xl">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input pl-9 h-9 text-xs bg-white border border-slate-200 hover:border-slate-350 focus:border-orange-500 rounded-lg w-full"
                    placeholder="Lọc nhanh theo mã số Serial..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="select w-[140px] h-9 flex justify-between items-center text-xs bg-white border border-slate-200 rounded-lg px-3 hover:bg-slate-50 transition-colors">
                      <span>{statusFilter ? t(`order_status.${statusFilter.toLowerCase()}`, { defaultValue: statusFilter }) : 'Trạng thái'}</span>
                      <ChevronRight size={12} className="rotate-90 text-slate-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48 bg-white shadow-md border border-slate-150 rounded-lg p-1 z-[60]">
                    <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
                      <DropdownMenuRadioItem value="" className="text-xs cursor-pointer">Tất cả trạng thái</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="pending" className="text-xs cursor-pointer">Chờ thực hiện (Pending)</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dispatched" className="text-xs cursor-pointer">Đã phân phát (Dispatched)</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="completed" className="text-xs cursor-pointer">Đã hoàn thành (Completed)</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="vision_failed" className="text-xs cursor-pointer">Lỗi camera (Vision Failed)</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="select w-[150px] h-9 flex justify-between items-center text-xs bg-white border border-slate-200 rounded-lg px-3 hover:bg-slate-50 transition-colors">
                      <span>{stationFilter || 'Trạm'}</span>
                      <ChevronRight size={12} className="rotate-90 text-slate-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48 bg-white shadow-md border border-slate-150 rounded-lg p-1 z-[60]">
                    <DropdownMenuRadioGroup value={stationFilter} onValueChange={setStationFilter}>
                      <DropdownMenuRadioItem value="" className="text-xs cursor-pointer">Tất cả trạm</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="Station-Combined-01" className="text-xs cursor-pointer">Station-Combined-01</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="STATION-01" className="text-xs cursor-pointer">STATION-01</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button 
                  className="btn btn-outline h-9 w-9 flex items-center justify-center border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50" 
                  onClick={() => refetch()}
                >
                  <RefreshCw size={12} />
                </button>
              </div>

              {/* Work Orders Table (Read-only) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div style={{ overflowX: 'auto' }}>
                  <table className="mes-table w-full">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100 text-left text-slate-550 text-[10px] font-bold uppercase tracking-wider">
                        {dispatchStrategy === 'SELECTED' && (
                          <th style={{ width: 40, textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={workOrders.length > 0 && selectedIds.size === workOrders.length}
                              onChange={handleSelectAll} 
                            />
                          </th>
                        )}
                        <th className="p-3">Số Serial</th>
                        <th className="p-3">Công đoạn hiện tại</th>
                        <th className="p-3">Mã Barcode</th>
                        <th className="p-3">Trạm Phân Phát</th>
                        <th className="p-3">Nhóm Thực Thi</th>
                        <th className="p-3">Trạng Thái</th>
                        <th className="p-3 text-center">Lần thử</th>
                        <th className="p-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {isWoLoading ? (
                        <tr>
                          <td colSpan={9} style={{ padding: 30, textAlign: 'center' }}>
                            <Spinner size={20} />
                          </td>
                        </tr>
                      ) : workOrders.length > 0 ? (
                        workOrders.map((wo: any) => {
                          const sStyle = getStatusStyle(wo.status)
                          const isSelected = selectedIds.has(wo.id)
                          const isFailed = ['vision_failed', 'rejected'].includes(wo.status ? wo.status.toLowerCase() : '')
                          const isEditingThisRow = editingFailedWoId === wo.id

                          return (
                            <tr 
                              key={wo.id} 
                              className={cn(
                                "transition-colors",
                                selectedWoId === wo.id && "bg-orange-50/30",
                                isFailed && "bg-rose-50/10 hover:bg-rose-50/20"
                              )}
                            >
                              {dispatchStrategy === 'SELECTED' && (
                                <td style={{ textAlign: 'center' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={isSelected} 
                                    onChange={() => handleSelectRow(wo.id)} 
                                  />
                                </td>
                              )}
                              <td className="p-3 font-semibold font-mono text-slate-800">
                                <span 
                                  className="cursor-pointer text-orange-500 hover:underline inline-flex gap-1 items-center" 
                                  onClick={() => {
                                    setSelectedWoId(wo.id)
                                    setIsWoDetailOpen(true)
                                  }}
                                >
                                  {wo.serial_number} <ArrowUpRight size={10} style={{ opacity: 0.6 }} />
                                </span>
                              </td>
                              <td className="p-3 font-medium text-slate-700">
                                <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-600">
                                  {wo.current_operation || 'Gia công'}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-slate-600 text-xs">{wo.barcode || '—'}</td>
                              <td className="p-3">
                                {isEditingThisRow ? (
                                  <select 
                                    className="select h-7 text-[11px] px-2 py-0 border border-slate-200 rounded bg-white"
                                    value={recoveryStation}
                                    onChange={(e) => setRecoveryStation(e.target.value)}
                                  >
                                    <option value="Station-Combined-01">Station-Combined-01</option>
                                    <option value="STATION-01">STATION-01</option>
                                  </select>
                                ) : (
                                  <span className="text-xs font-semibold text-slate-700">{wo.assigned_station || '—'}</span>
                                )}
                              </td>
                              <td className="p-3">
                                {isEditingThisRow ? (
                                  <select 
                                    className="select h-7 text-[11px] px-2 py-0 border border-slate-200 rounded bg-white"
                                    value={recoveryTeam}
                                    onChange={(e) => setRecoveryTeam(e.target.value)}
                                  >
                                    {teams.map((t: any) => (
                                      <option key={t.id} value={t.code || t.name}>{t.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-xs text-slate-600">{wo.assigned_team || '—'}</span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={cn(
                                  "text-[9px] font-bold px-2 py-0.5 rounded tracking-wide uppercase",
                                  sStyle.bg
                                )}>
                                  {sStyle.label}
                                </span>
                              </td>
                              <td className="p-3 text-center font-semibold text-slate-750">{wo.current_attempt}</td>
                              <td className="p-3 text-right">
                                {isEditingThisRow ? (
                                  <div className="flex gap-1.5 justify-end">
                                    <button 
                                      className="btn btn-primary btn-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded px-2 h-6"
                                      onClick={() => handleSaveRecovery(wo.id)}
                                    >
                                      Lưu & Gửi
                                    </button>
                                    <button 
                                      className="btn btn-outline btn-xs border-slate-200 text-slate-600 rounded px-2 h-6"
                                      onClick={() => setEditingFailedWoId(null)}
                                    >
                                      Hủy
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5 ml-auto">
                                    <button 
                                      className="btn btn-outline btn-xs flex items-center gap-1 border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
                                      onClick={() => {
                                        setSelectedWoId(wo.id)
                                        setIsWoDetailOpen(true)
                                      }}
                                    >
                                      Chi tiết
                                    </button>

                                    {/* Action dropdown for failed recovery */}
                                    {isFailed && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button className="btn btn-outline btn-xs flex items-center gap-1 border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg px-2">
                                            <Settings size={10} /> Khắc phục
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-40 bg-white border border-slate-200 shadow-md rounded-lg p-1 z-50">
                                          <DropdownMenuItem 
                                            className="text-xs cursor-pointer hover:bg-slate-50 p-2 rounded"
                                            onClick={() => dispatchWorkOrder({ id: wo.id, station: wo.assigned_station || 'Station-Combined-01', team: wo.assigned_team })}
                                          >
                                            <Play size={10} className="mr-2 text-slate-500" /> Thử lại (Retry)
                                          </DropdownMenuItem>
                                          <DropdownMenuItem 
                                            className="text-xs cursor-pointer hover:bg-slate-50 p-2 rounded"
                                            onClick={() => dispatchWorkOrder({ id: wo.id, station: wo.assigned_station || 'Station-Combined-01', team: wo.assigned_team })}
                                          >
                                            <RefreshCw size={10} className="mr-2 text-slate-500" /> Redispatch
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator className="bg-slate-100 my-1" />
                                          <DropdownMenuItem 
                                            className="text-xs cursor-pointer hover:bg-slate-50 p-2 rounded"
                                            onClick={() => handleStartRecoveryEdit(wo)}
                                          >
                                            <Settings size={10} className="mr-2 text-slate-550" /> Đổi trạm (Station)
                                          </DropdownMenuItem>
                                          <DropdownMenuItem 
                                            className="text-xs cursor-pointer hover:bg-slate-50 p-2 rounded"
                                            onClick={() => handleStartRecoveryEdit(wo)}
                                          >
                                            <Settings size={10} className="mr-2 text-slate-550" /> Đổi nhóm (Team)
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator className="bg-slate-100 my-1" />
                                          <DropdownMenuItem 
                                            className="text-xs cursor-pointer text-rose-650 hover:bg-rose-50 p-2 rounded"
                                            onClick={() => cancelWorkOrder(wo.id)}
                                          >
                                            <Trash2 size={10} className="mr-2 text-rose-500" /> Hủy bỏ (Cancel)
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} style={{ padding: 30, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                            Không tìm thấy đơn làm việc chi tiết.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Inner Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid var(--color-border-subtle)' }}>
                    <span className="text-[11px] text-slate-500">
                      Trang {page} / {totalPages} (Tổng số {totalCount} nhãn)
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline btn-xs rounded-lg" disabled={page === 1} onClick={() => setPage(page - 1)}>
                        Trước
                      </button>
                      <button className="btn btn-outline btn-xs rounded-lg" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                        Sau
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Station Operating Guide Footer */}
              <div className="border border-slate-200/70 p-4 bg-slate-50 rounded-xl flex flex-col gap-3">
                <h4 className="text-[11px] font-bold uppercase text-orange-500 flex items-center gap-1.5 tracking-wider">
                  <Server size={12} /> Hướng dẫn vận hành trạm & Điều khiển thiết bị
                </h4>
                <div className="text-xs text-slate-500 leading-relaxed space-y-1">
                  <p>• <strong>Station-Combined-01</strong>: Tích hợp máy in nhãn tự động + Đầu khắc Laser xác minh mã.</p>
                  <p>• <strong>STATION-01</strong>: Trạm in dự phòng thủ công dành cho nhóm vận hành cơ động.</p>
                  <p className="pt-2 border-t border-slate-200/50">Cấu hình lô gán trạm và nhóm thực thi phía trên, chọn số lượng hoặc strategy thích hợp và nhấn <strong>Sản xuất lô</strong> để phân phối lệnh tự động.</p>
                </div>
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Work Order Detail Dialog Modal (Telemetry Logs & Payload analyzer) ─── */}
      <Dialog open={isWoDetailOpen} onOpenChange={setIsWoDetailOpen}>
        <DialogContent className="sm:max-w-[1000px] w-[90vw] max-h-[85vh] overflow-y-auto p-6 bg-white border border-slate-200 shadow-2xl rounded-2xl flex flex-col gap-5">
          <DialogHeader className="border-b border-slate-100 pb-4 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-md font-bold text-slate-800">
              <Eye size={18} className="text-orange-500" />
              Chi tiết thiết bị & Telemetry sản phẩm: <span className="font-mono text-slate-700">{selectedWo?.serial_number}</span>
            </DialogTitle>
          </DialogHeader>

          {isDetailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={30} />
            </div>
          ) : selectedWo ? (
            <div className="flex flex-col gap-5 flex-1 min-h-0">
              
              {/* Top Meta info grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-200/60 rounded-xl shrink-0">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider font-semibold">Trạng thái hiện tại</span>
                  <div className="mt-1 font-semibold text-xs text-slate-850">
                    <span className={cn(
                      "text-[9px] font-bold px-2 py-0.5 rounded tracking-wide uppercase",
                      getStatusStyle(selectedWo?.status || 'pending').bg
                    )}>
                      {selectedWo?.status}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider font-semibold">Mã vạch (Barcode)</span>
                  <div className="mt-1 font-mono text-xs text-slate-700">{selectedWo?.barcode || '—'}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider font-semibold">Mã Trace ID</span>
                  <div className="mt-1 font-mono text-xs text-slate-700">{selectedWo?.trace_id || '—'}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider font-semibold">Trạm / Nhóm hiện tại</span>
                  <div className="mt-1 text-xs text-slate-700 font-bold">{selectedWo?.assigned_station || '—'} / {selectedWo?.assigned_team || '—'}</div>
                </div>
              </div>

              {/* 2-Column split layout: Left = Timeline, Right = Selected Operation telemetry info */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0 overflow-hidden">
                
                {/* Left Column: Timeline of steps (col-span-5) */}
                <div className="md:col-span-5 flex flex-col gap-3 min-h-0">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide border-b border-slate-100 pb-2 flex items-center gap-1.5 shrink-0">
                    <Layers size={13} className="text-orange-500" />
                    Định tuyến & Tiến độ gia công (Routing Timeline)
                  </h3>
                  
                  <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[360px]">
                    {selectedWo && selectedWo.operations && selectedWo.operations.length > 0 ? (
                      selectedWo.operations.map((op: any, index: number) => {
                        const isSelected = selectedOpIdx === index
                        const isOpCompleted = op.status === 'completed'
                        const isOpRunning = ['running', 'printing', 'laser_running', 'vision_running'].includes(op.status?.toLowerCase())
                        const isOpFailed = op.status === 'failed'
                        
                        return (
                          <div
                            key={op.id || index}
                            className={cn(
                              "p-3 rounded-xl border cursor-pointer transition-all flex justify-between items-center",
                              isSelected 
                                ? "bg-orange-50/50 border-orange-200 text-orange-700 shadow-sm font-bold"
                                : "hover:bg-slate-50 border-slate-100 text-slate-700 bg-white"
                            )}
                            onClick={() => setSelectedOpIdx(index)}
                          >
                            <div className="space-y-1">
                              <div className="font-bold text-xs flex items-center gap-2">
                                <span className={cn(
                                  "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono",
                                  isSelected ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500 border border-slate-200"
                                )}>
                                  {op.sequence}
                                </span>
                                {op.operation_name || op.operation_type}
                              </div>
                              <div className="text-[10px] text-slate-400 pl-6">
                                {op.requires_station ? `Trạm: ${op.default_station_type || op.operation_type}` : 'Thao tác thủ công'}
                              </div>
                            </div>

                            <div className="text-right flex items-center gap-2 shrink-0">
                              {isOpCompleted && <CheckCircle size={14} className="text-emerald-500" />}
                              {isOpRunning && (
                                <span className="flex h-2 w-2 relative">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                                </span>
                              )}
                              {isOpFailed && <XCircle size={14} className="text-rose-500 animate-pulse" />}
                              {!isOpCompleted && !isOpRunning && !isOpFailed && <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />}
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                                {op.status || 'PENDING'}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-slate-400 text-center py-12 text-xs">Không tìm thấy dữ liệu định tuyến chi tiết.</div>
                    )}
                  </div>
                </div>

                {/* Right Column: Selected Operation Telemetry & Logs (col-span-7) */}
                <div className="md:col-span-7 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-5 flex flex-col gap-4 min-h-0">
                  {(() => {
                    const op = selectedWo?.operations?.[selectedOpIdx]
                    if (!op) {
                      return (
                        <div className="text-slate-450 text-center py-20 text-xs">
                          Chọn một thao tác bên trái để kiểm tra dữ liệu telemetry và sự kiện.
                        </div>
                      )
                    }

                    const requiresStation = op.requires_station !== false
                    const isLaserOrPrint = ['MARK', 'PRINT', 'VISION_VERIFY', 'VISION'].includes(op.operation_type)
                    
                    return (
                      <div className="space-y-4 flex-1 flex flex-col min-h-0">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                          <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                            Chi tiết thao tác #{op.sequence}: {op.operation_name || op.operation_type}
                          </h4>
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider",
                            op.status === 'completed' ? "bg-emerald-50 text-emerald-600 border-emerald-250" :
                            op.status === 'failed' ? "bg-rose-50 text-rose-600 border-rose-250" :
                            ['running', 'processing'].includes(op.status) ? "bg-sky-50 text-sky-650 border-sky-200" :
                            "bg-slate-50 text-slate-500 border-slate-200"
                          )}>
                            {op.status}
                          </span>
                        </div>

                        {/* Metadata grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 text-[11px] text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-slate-400 block font-semibold text-[9px] uppercase">Loại thao tác:</span>
                            <strong className="text-slate-700">{op.operation_type}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold text-[9px] uppercase">Trạm liên kết:</span>
                            <strong className="text-slate-700">{requiresStation ? (op.assigned_station || op.default_station_type || 'Bất kỳ') : 'Thao tác thủ công'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold text-[9px] uppercase">Tổ đội thi công:</span>
                            <strong className="text-slate-700">{op.assigned_team || 'Mặc định sàn'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold text-[9px] uppercase">Thời gian chu kỳ:</span>
                            <strong className="text-slate-755">
                              {op.completed_at ? `${op.duration}s` : 'Chưa đo'} / {op.estimated_duration}s (Est)
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold text-[9px] uppercase">Số lần thử lại:</span>
                            <strong className="text-slate-700">{op.retry_count} / {op.retry_limit}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold text-[9px] uppercase">Kết quả kiểm định:</span>
                            <strong className={cn(
                              op.result === 'PASSED' ? 'text-emerald-600 font-bold' : op.result === 'FAILED' ? 'text-rose-500 font-bold' : 'text-slate-500'
                            )}>
                              {op.quality_check_required ? (op.result || 'Đang chờ') : 'Không yêu cầu'}
                            </strong>
                          </div>
                        </div>

                        {/* Timing logs */}
                        {(op.started_at || op.completed_at) && (
                          <div className="text-[10px] text-slate-450 flex gap-4 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50 font-semibold">
                            {op.started_at && (
                              <span>Bắt đầu: <strong className="text-slate-600">{new Date(op.started_at).toLocaleTimeString()}</strong></span>
                            )}
                            {op.completed_at && (
                              <span>Kết thúc: <strong className="text-slate-600">{new Date(op.completed_at).toLocaleTimeString()}</strong></span>
                            )}
                          </div>
                        )}

                        {/* Camera inspection screen if selected steps is visual or laser */}
                        {isLaserOrPrint && (
                          <div className="space-y-2 shrink-0">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                              Visual Camera inspection & marking feedback (Simulator)
                            </span>
                            
                            <div style={{
                              background: '#090d16',
                              borderRadius: 8,
                              padding: 14,
                              position: 'relative',
                              overflow: 'hidden',
                              height: 110,
                              border: '1px solid rgba(255,255,255,0.05)',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              alignItems: 'center',
                              color: '#38bdf8',
                              fontFamily: 'monospace'
                            }}>
                              {/* Laser scanning beam */}
                              <div style={{
                                position: 'absolute',
                                width: '105%',
                                height: 2,
                                background: op.status === 'failed' ? 'rgba(239, 68, 68, 0.7)' : 'rgba(16, 185, 129, 0.7)',
                                boxShadow: op.status === 'failed' ? '0 0 8px #ef4444' : '0 0 8px #10b981',
                                animation: 'scanLine 3s infinite linear',
                                zIndex: 3
                              }} />
                              
                              {/* Visual Sticker Label */}
                              <div className="bg-white text-black p-1.5 rounded w-[80%] text-center border z-10" style={{
                                borderColor: op.status === 'failed' ? '#ef4444' : '#10b981'
                              }}>
                                <div className="text-[6px] text-slate-400 font-bold uppercase tracking-wider font-semibold">MES BARCODE MARKING</div>
                                <div className="text-[9px] font-mono font-bold my-0.5">{selectedWo?.serial_number}</div>
                                <div className="bg-black h-2.5 w-full my-0.5" />
                              </div>

                              <div className="absolute bottom-2 right-3 text-[9px] font-bold z-10 flex items-center gap-1.5" style={{
                                color: op.status === 'failed' ? '#ef4444' : '#10b981'
                              }}>
                                <span className="w-2 h-2 rounded-full animate-ping" style={{
                                  background: op.status === 'failed' ? '#ef4444' : '#10b981'
                                }} />
                                CAM INSPECT: {op.status === 'failed' ? 'REJECTED' : op.status === 'completed' ? 'PASSED' : 'SCANNING'}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Telemetry / Comments details box */}
                        {op.comments && (
                          <div className={cn(
                            "p-3 rounded-lg border text-xs leading-relaxed shrink-0",
                            op.status === 'failed' ? "bg-red-50/50 border-red-200 text-red-700" : "bg-blue-50/30 border-blue-200 text-slate-700"
                          )}>
                            <strong className="block text-[9px] font-bold uppercase tracking-wider mb-1">
                              {op.status === 'failed' ? 'Mã lỗi kiểm định (Vision Defect Log):' : 'Báo cáo thông tin:'}
                            </strong>
                            "{op.comments}"
                          </div>
                        )}

                        {/* Raw Telemetry Terminal Logs */}
                        <div className="flex-1 flex flex-col min-h-[140px]">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 block shrink-0">
                            Nhật ký Telemetry trạm máy (Machine MQTT Terminal Logs)
                          </span>
                          <div className="flex-1 bg-slate-900 text-slate-300 border border-slate-950 p-3.5 rounded-lg text-[10px] font-mono overflow-y-auto max-h-[220px]">
                            {op.status === 'completed' ? (
                              <div className="space-y-1">
                                <p className="text-emerald-500">[SYSTEM] Connection established to Broker at {new Date(op.started_at).toLocaleTimeString()}</p>
                                <p className="text-slate-400">[PUB] mes/station/{op.assigned_station}/job/start {JSON.stringify({ work_order_id: op.work_order_id, sequence: op.sequence })}</p>
                                <p className="text-sky-455">[SUB] mes/station/{op.assigned_station}/telemetry: {"{ state: \"PROCESSING\", speed: 1.2, progress: 50 }"}</p>
                                <p className="text-sky-455">[SUB] mes/station/{op.assigned_station}/telemetry: {"{ state: \"PROCESSING\", speed: 1.2, progress: 100 }"}</p>
                                <p className="text-emerald-400">[SUB] mes/station/{op.assigned_station}/job/complete {JSON.stringify({ result: op.result, duration: op.duration })}</p>
                                <p className="text-emerald-500">[SYSTEM] Job completed successfully in {op.duration}s. MQTT connection closed.</p>
                              </div>
                            ) : op.status === 'failed' ? (
                              <div className="space-y-1">
                                <p className="text-emerald-500">[SYSTEM] Connection established to Broker at {new Date(op.started_at || op.created_at).toLocaleTimeString()}</p>
                                <p className="text-slate-400">[PUB] mes/station/{op.assigned_station}/job/start {JSON.stringify({ work_order_id: op.work_order_id, sequence: op.sequence })}</p>
                                <p className="text-rose-500">[SUB] mes/station/{op.assigned_station}/telemetry: {"{ state: \"ERROR\", errorCode: \"VISION_FAIL\", confidence: 0.42 }"}</p>
                                <p className="text-rose-600">[SYSTEM] Job execution failed. Defect detected. Retry count incremented to {op.retry_count}.</p>
                              </div>
                            ) : op.status === 'running' ? (
                              <div className="space-y-1">
                                <p className="text-emerald-555">[SYSTEM] Connection established to Broker</p>
                                <p className="text-sky-455">[SUB] mes/station/{op.assigned_station}/telemetry: {"{ state: \"PROCESSING\", speed: 1.2, progress: 35 }"}</p>
                                <p className="text-sky-455 animate-pulse">[SYSTEM] Active job running. Waiting for completion payload...</p>
                              </div>
                            ) : (
                              <p className="text-slate-500 italic">Thao tác chưa bắt đầu. Đang đợi lệnh phát hành (Dispatch) của điều độ viên.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>

              </div>

              {/* Raw JSON Payloads expander */}
              <div className="border border-slate-200 rounded-xl overflow-hidden mt-2 bg-slate-50 p-4 shrink-0">
                <details className="cursor-pointer group">
                  <summary className="text-[11px] font-bold uppercase text-slate-500 group-open:mb-2 flex items-center justify-between">
                    <span>Xem Dữ liệu JSON gốc (Raw MQTT Payloads)</span>
                    <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                  </summary>
                  <pre className="bg-slate-900 text-slate-300 border border-slate-950 p-3.5 rounded-lg text-[9px] font-mono overflow-x-auto max-h-40">
                    {JSON.stringify(selectedWo, null, 2)}
                  </pre>
                </details>
              </div>

            </div>
          ) : (
            <div className="py-20 text-center text-slate-500">Không tìm thấy dữ liệu.</div>
          )}

          <div className="border-t border-slate-100 pt-3 flex justify-end shrink-0">
            <button 
              className="btn btn-outline border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold"
              onClick={() => setIsWoDetailOpen(false)}
            >
              Đóng
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
