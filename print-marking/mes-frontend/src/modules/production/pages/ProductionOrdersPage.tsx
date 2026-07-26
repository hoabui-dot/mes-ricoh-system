import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { 
  Plus, Search, Layers, Clipboard, AlertCircle, Play, CheckCircle, Send, XCircle, History,
  AlertTriangle, Clock, Calendar, User, Package, Cpu, ArrowRight, BookOpen, Layers2
} from 'lucide-react'
import { PageHeader, PermissionGuard, Spinner, EmptyState } from '@/components/common'
import { StatusBadge } from '@/components/industrial/StatusComponents'
import { apiGet, apiPost, apiPatch } from '@/services/api-client'
import { PERMISSIONS } from '@/utils/permissions'
import { formatRelative } from '@/utils/date'
import { toast } from '@/stores/toast.store'
import { useAuthStore } from '@/stores/auth.store'
import { cn } from '@/utils/cn'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

// Local types to override standard domain DTOs to fit planning refactoring
interface ProductionOrderEventDTO {
  id: string
  production_order_id: string
  event_type: string
  status: string
  message: string
  occurred_at: string
}

interface ProductionOrderDTO {
  id: string
  order_number: string
  customer: string
  product: string
  product_revision: string
  workflow_id?: string
  quantity: number
  priority: number
  status: string
  approval_status: string
  production_status: string
  operation_type?: string
  station?: string
  gateway_order_id?: string
  due_date?: string
  notes?: string
  quantity_completed: number
  quantity_running: number
  quantity_failed: number
  quantity_cancelled: number
  scrap_quantity: number
  events?: ProductionOrderEventDTO[]
  work_orders?: any[]
  created_at: string
  updated_at: string
}

interface WorkflowOperationDTO {
  id: string
  workflowId: string
  sequence: number
  operationType: string
  stationType: string
  estimatedDuration: number
  retryLimit: number
  isRequired: boolean
  metadata: Record<string, any>
  operationName: string
  requiresStation: boolean
  defaultStationType: string
  qualityCheckRequired: boolean
  isFinalOperation: boolean
  requiredSkills: string[]
  createdAt: string
  updatedAt: string
}

interface WorkflowDTO {
  id: string
  workflowCode: string
  workflowName: string
  description: string
  productFamily: string
  version: number
  status: string
  publishedAt?: string
  archivedAt?: string
  revision: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  operations: WorkflowOperationDTO[]
}

export function ProductionOrdersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('draft')
  const [dateFilter, setDateFilter] = React.useState<string>('today')
  const [startDate, setStartDate] = React.useState<string>(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = React.useState<string>(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(null)

  const handleStartDateChange = (val: string) => {
    setStartDate(val)
    if (endDate && val) {
      const s = new Date(val)
      const e = new Date(endDate)
      const diffTime = e.getTime() - s.getTime()
      const diffDays = diffTime / (1000 * 60 * 60 * 24)
      if (diffDays > 30) {
        const newEnd = new Date(s.getTime() + 30 * 24 * 60 * 60 * 1000)
        setEndDate(newEnd.toISOString().split('T')[0])
        toast.error(t('orders_module.rangeLimitWarning'))
      } else if (diffDays < 0) {
        setEndDate(val)
      }
    }
  }

  const handleEndDateChange = (val: string) => {
    setEndDate(val)
    if (startDate && val) {
      const s = new Date(startDate)
      const e = new Date(val)
      const diffTime = e.getTime() - s.getTime()
      const diffDays = diffTime / (1000 * 60 * 60 * 24)
      if (diffDays > 30) {
        const newStart = new Date(e.getTime() - 30 * 24 * 60 * 60 * 1000)
        setStartDate(newStart.toISOString().split('T')[0])
        toast.error(t('orders_module.rangeLimitWarning'))
      } else if (diffDays < 0) {
        setStartDate(val)
      }
    }
  }
  
  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [formOrderNumber, setFormOrderNumber] = React.useState('')
  const [formCustomer, setFormCustomer] = React.useState('')
  const [formProduct, setFormProduct] = React.useState('')
  const [formRevision, setFormRevision] = React.useState('')
  const [formWorkflowId, setFormWorkflowId] = React.useState('')
  const [formQuantity, setFormQuantity] = React.useState(100)
  const [formDueDate, setFormDueDate] = React.useState('')
  const [formPriority, setFormPriority] = React.useState<number>(40)
  const [formNotes, setFormNotes] = React.useState('')

  // UI state for workflow search and timeline expand
  const [workflowSearch, setWorkflowSearch] = React.useState('')
  const [isWorkflowExpanded, setIsWorkflowExpanded] = React.useState(false)

  // Fetch production orders
  const { data: res, isLoading } = useQuery({
    queryKey: ['production-orders'],
    queryFn: () => apiGet<ProductionOrderDTO[]>('/production-orders'),
  })

  const orders = res?.data ?? []

  // Fetch workflows templates
  const { data: workflowsRes } = useQuery({
    queryKey: ['workflows-all'],
    queryFn: () => apiGet<WorkflowDTO[]>('/workflows?pageSize=1000'),
  })
  const workflows = workflowsRes?.data ?? []

  const filteredOrders = orders.filter((o) => {
    const matchesSearch = o.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          o.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (o.customer && o.customer.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter

    let matchesDate = true
    const orderDate = new Date(o.created_at)
    const today = new Date()
    const orderDay = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate()).getTime()
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    
    if (dateFilter === 'today') {
      matchesDate = orderDay === todayDay
    } else if (dateFilter === '7days') {
      const diffDays = (todayDay - orderDay) / (1000 * 60 * 60 * 24)
      matchesDate = diffDays >= 0 && diffDays < 7
    } else if (dateFilter === 'month') {
      const diffDays = (todayDay - orderDay) / (1000 * 60 * 60 * 24)
      matchesDate = diffDays >= 0 && diffDays < 30
    } else if (dateFilter === 'custom' && startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
      matchesDate = orderDay >= startDay && orderDay <= endDay
    }

    return matchesSearch && matchesStatus && matchesDate
  })

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? filteredOrders[0]

  React.useEffect(() => {
    if (filteredOrders.length > 0) {
      const exists = filteredOrders.some((o) => o.id === selectedOrderId)
      if (!exists) {
        setSelectedOrderId(filteredOrders[0].id)
      }
    } else {
      setSelectedOrderId(null)
    }
  }, [filteredOrders, selectedOrderId])

  // Real-time SSE listener
  React.useEffect(() => {
    if (!selectedOrderId) return

    const baseUrl = import.meta.env.VITE_API_URL || '/api/v1'
    const url = `${baseUrl.trimEnd('/')}/production-orders/${selectedOrderId}/stream`
    const eventSource = new EventSource(url)

    eventSource.addEventListener('order_update', (event) => {
      try {
        const updatedOrder = JSON.parse(event.data) as ProductionOrderDTO
        queryClient.setQueryData(['production-orders'], (oldData: any) => {
          if (!oldData || !oldData.data) return oldData
          const newOrders = oldData.data.map((o: ProductionOrderDTO) => 
            o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o
          )
          return { ...oldData, data: newOrders }
        })
      } catch (err) {
        console.error('Failed to parse SSE event data', err)
      }
    })

    return () => {
      eventSource.close()
    }
  }, [selectedOrderId, queryClient])

  // Query individual work orders for progress tracking
  const { data: woRes } = useQuery({
    queryKey: ['production-order-work-orders', selectedOrderId],
    queryFn: () => {
      if (!selectedOrderId) return null
      return apiGet<any[]>(`/work-orders?production_order_id=${selectedOrderId}&page_size=1000`)
    },
    enabled: !!selectedOrderId,
  })
  const orderWorkOrders = (woRes?.data as any) ?? []

  // Mutations
  const { mutate: createOrder, isPending: isCreating } = useMutation({
    mutationFn: (data: any) => apiPost('/production-orders', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders'] })
      setIsCreateOpen(false)
      toast.success('Đã tạo đơn hàng sản xuất mới thành công!')
      // Reset form
      setFormOrderNumber('')
      setFormCustomer('')
      setFormProduct('')
      setFormRevision('')
      setFormWorkflowId('')
      setFormQuantity(100)
      setFormDueDate('')
      setFormPriority(40)
      setFormNotes('')
      setWorkflowSearch('')
      setIsWorkflowExpanded(false)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || err?.message || 'Không thể tạo đơn hàng')
    }
  })

  const { mutate: releaseOrder, isPending: isReleasing } = useMutation({
    mutationFn: (id: string) => apiPatch(`/production-orders/${id}/release`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders'] })
      toast.success('Đã phê duyệt và phát hành đơn hàng đến Gateway!')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || err?.message || 'Không thể phát hành đơn hàng')
    }
  })

  const { mutate: cancelOrder, isPending: isCancelling } = useMutation({
    mutationFn: (id: string) => apiPatch(`/production-orders/${id}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders'] })
      toast.success('Đã hủy đơn hàng sản xuất!')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || err?.message || 'Không thể hủy đơn hàng')
    }
  })

  // Selected workflow template object
  const selectedWf = workflows.find((w: any) => w.id === formWorkflowId)

  // Inline Validation warnings
  const getValidationWarnings = () => {
    const warnings: string[] = []
    
    if (!formOrderNumber.trim()) {
      warnings.push(t('orders_module.orderNumRequired'))
    }
    if (!formCustomer.trim()) {
      warnings.push(t('orders_module.customerRequired'))
    }
    if (!formProduct.trim()) {
      warnings.push(t('orders_module.productRequired'))
    }
    
    if (!formWorkflowId) {
      warnings.push(t('orders_module.workflowRequired'))
    }
    
    if (formQuantity <= 0) {
      warnings.push(t('orders_module.quantityMinWarning'))
    }
    
    if (formDueDate) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const due = new Date(formDueDate)
      if (due < today) {
        warnings.push(t('orders_module.duePastWarning'))
      }
    } else {
      warnings.push(t('orders_module.dueRequired'))
    }

    if (selectedWf) {
      if (selectedWf.status !== 'published') {
        warnings.push(t('orders_module.workflowUnpublishedWarning'))
      }
      if (!selectedWf.operations || selectedWf.operations.length === 0) {
        warnings.push(t('orders_module.workflowNoOpsWarning'))
      }
      
      // Warning if estimated completion exceeds due date (simplified check assuming 1 op takes its duration per unit in sequence)
      if (formDueDate) {
        const totalSecs = selectedWf.operations?.reduce((acc: number, op: any) => acc + (op.estimatedDuration ?? 0), 0) ?? 0
        const totalDurationMs = totalSecs * formQuantity * 1000
        const estimatedCompletionDate = new Date(Date.now() + totalDurationMs)
        const dueDateObj = new Date(formDueDate)
        dueDateObj.setHours(23, 59, 59, 999)
        if (estimatedCompletionDate > dueDateObj) {
          warnings.push(t('orders_module.dueDateCycleWarning'))
        }
      }
    }
    
    return warnings
  }

  const validationWarnings = getValidationWarnings()
  const isValid = validationWarnings.length === 0

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) {
      toast.error("Vui lòng xử lý các lỗi/cảnh báo kế hoạch trước khi lưu.")
      return
    }

    createOrder({
      order_number: formOrderNumber,
      customer: formCustomer,
      product: formProduct,
      product_revision: formRevision,
      workflow_id: formWorkflowId,
      quantity: formQuantity,
      priority: formPriority,
      due_date: formDueDate ? formDueDate : undefined,
      notes: formNotes,
    })
  }

  const filteredWorkflows = workflows.filter((wf: any) => 
    wf.workflowName.toLowerCase().includes(workflowSearch.toLowerCase()) ||
    wf.workflowCode.toLowerCase().includes(workflowSearch.toLowerCase()) ||
    wf.productFamily.toLowerCase().includes(workflowSearch.toLowerCase())
  )

  return (
    <div className="fade-in">
      <PageHeader
        title={t('orders_module.title')}
        description={t('orders_module.subtitle')}
      >
        <PermissionGuard permission={PERMISSIONS.PRODUCTION_CREATE}>
          <button className="btn btn-primary btn-sm" onClick={() => setIsCreateOpen(true)}>
            <Plus size={14} />
            {t('orders_module.addOrder')}
          </button>
        </PermissionGuard>
      </PageHeader>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20, minHeight: '60vh' }}>
        {/* Left Side: Master List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                className="input"
                placeholder={t('common.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 36, width: '100%' }}
              />
            </div>
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: 140, height: 38 }}
            >
              <option value="all">{t('order_status.all')}</option>
              <option value="draft">{t('order_status.draft')}</option>
              <option value="released">{t('order_status.released')}</option>
              <option value="sent_to_gateway">{t('order_status.sent_to_gateway')}</option>
              <option value="accepted">{t('order_status.accepted')}</option>
              <option value="in_progress">{t('order_status.in_progress')}</option>
              <option value="completed">{t('order_status.completed')}</option>
              <option value="failed">{t('order_status.failed')}</option>
              <option value="cancelled">{t('order_status.cancelled')}</option>
            </select>
            <select
              className="select"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ width: 140, height: 38 }}
            >
              <option value="today">{t('orders_module.dateToday')}</option>
              <option value="7days">{t('orders_module.date7Days')}</option>
              <option value="month">{t('orders_module.dateMonth')}</option>
              <option value="custom">{t('orders_module.dateCustom')}</option>
            </select>
          </div>

          {dateFilter === 'custom' && (
            <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Khoảng:</span>
              <input 
                type="date" 
                className="input" 
                value={startDate} 
                onChange={(e) => handleStartDateChange(e.target.value)} 
                style={{ height: 34, padding: '4px 8px', fontSize: 13, flex: 1 }} 
              />
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>-</span>
              <input 
                type="date" 
                className="input" 
                value={endDate} 
                onChange={(e) => handleEndDateChange(e.target.value)} 
                style={{ height: 34, padding: '4px 8px', fontSize: 13, flex: 1 }} 
              />
            </div>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <Spinner size={32} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: '70vh' }}>
              {filteredOrders.map((o) => {
                const completedQty = o.work_orders?.reduce((acc, curr) => acc + curr.quantity_completed, 0) ?? 0
                const targetQty = o.quantity
                const pct = targetQty > 0 ? Math.round((completedQty / targetQty) * 100) : 0

                return (
                  <div
                    key={o.id}
                    className={`card ${selectedOrderId === o.id ? 'border-accent' : ''}`}
                    onClick={() => setSelectedOrderId(o.id)}
                    style={{
                      padding: 16,
                      cursor: 'pointer',
                      border: selectedOrderId === o.id ? '1px solid var(--color-brand-orange)' : undefined,
                      background: selectedOrderId === o.id ? 'var(--color-bg-hover)' : undefined,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{o.order_number}</span>
                      <StatusBadge status={o.status} label={t(`order_status.${o.status}`, { defaultValue: o.status })} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{o.product}</div>
                    
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                      <span>Khách hàng: <strong style={{ color: 'var(--color-text-secondary)' }}>{o.customer}</strong></span>
                      <span>Phiên bản: <strong style={{ color: 'var(--color-text-secondary)' }}>{o.product_revision || 'N/A'}</strong></span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                      <span>{t('orders_module.progress')}</span>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>{completedQty} / {targetQty} ({pct}%)</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: 'var(--color-brand-orange)', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
              {filteredOrders.length === 0 && (
                <EmptyState title={t('orders_module.noOrders')} />
              )}
            </div>
          )}
        </div>

        {/* Right Side: Details View */}
        <div>
          {selectedOrder ? (
            <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{selectedOrder.order_number}</h3>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Khách hàng: {selectedOrder.customer}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <StatusBadge status={selectedOrder.status} label={t(`order_status.${selectedOrder.status}`, { defaultValue: selectedOrder.status })} />
                </div>
              </div>

              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t('orders_module.targetQty')}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{selectedOrder.quantity} pcs</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Sản phẩm (Product)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: 'var(--color-text-secondary)' }}>{selectedOrder.product} ({selectedOrder.product_revision || 'N/A'})</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Độ ưu tiên / Hạn giao</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: 'var(--color-text-secondary)' }}>
                    P: {selectedOrder.priority} • {selectedOrder.due_date ? new Date(selectedOrder.due_date).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
              </div>

              {selectedOrder.gateway_order_id && (
                <div className="card" style={{ padding: '12px 16px', background: 'rgba(249, 115, 22, 0.05)', border: '1px solid rgba(249, 115, 22, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-brand-orange)' }}>Gateway Correlation ID</div>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{selectedOrder.gateway_order_id}</div>
                  </div>
                  <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(249, 115, 22, 0.1)', color: 'var(--color-brand-orange)', fontWeight: 600 }}>
                    {t('orders_module.activeConnection')}
                  </div>
                </div>
              )}

              {/* Action Toolbar */}
              <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 20 }}>
                {selectedOrder.status === 'draft' && (
                  <button 
                    className="btn btn-primary btn-sm" 
                    onClick={() => releaseOrder(selectedOrder.id)}
                    disabled={isReleasing}
                    style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                  >
                    <Send size={14} />
                    {isReleasing ? t('orders_module.releasing') : t('orders_module.release')}
                  </button>
                )}

                {['draft', 'released', 'sent_to_gateway'].includes(selectedOrder.status) && (
                  <button 
                    className="btn btn-outline-danger btn-sm" 
                    onClick={() => cancelOrder(selectedOrder.id)}
                    disabled={isCancelling}
                    style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                  >
                    <XCircle size={14} />
                    {t('orders_module.cancelOrder')}
                  </button>
                )}
              </div>

              {/* Timeline Section */}
              <div>
                <h4 style={{ margin: '0 0 16px 0', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <History size={14} />
                  {t('orders_module.timeline')}
                </h4>
                {selectedOrder.events && selectedOrder.events.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: 'rgba(255,255,255,0.01)', padding: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.03)' }}>
                    {selectedOrder.events.map((ev, index) => (
                      <div key={ev.id} style={{ display: 'flex', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ 
                            width: 10, 
                            height: 10, 
                            borderRadius: '50%', 
                            background: ev.status === 'failed' ? '#EF4444' : ev.status === 'completed' ? '#10B981' : ev.status === 'in_progress' ? '#3B82F6' : 'var(--color-brand-orange)', 
                            marginTop: 4 
                          }} />
                          {index < (selectedOrder.events?.length ?? 0) - 1 && (
                            <div style={{ width: 2, flex: 1, background: 'rgba(255,255,255,0.06)', marginTop: 8, minHeight: 20 }} />
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{ev.event_type}</span>
                            <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{formatRelative(ev.occurred_at)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{ev.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12, border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 8 }}>
                    {t('orders_module.timelineEmpty')}
                  </div>
                )}
              </div>

              {/* Work Orders List */}
              <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>{t('orders_module.workOrders')}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedOrder.work_orders?.map((wo) => (
                    <div key={wo.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{wo.operation_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          Step {wo.routing_step} • Assigned: {wo.assigned_worker_name || 'Unassigned'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <StatusBadge status={wo.status} label={t(`order_status.${wo.status}`, { defaultValue: wo.status })} />
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                          {wo.quantity_completed} / {wo.quantity_planned}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!selectedOrder.work_orders || selectedOrder.work_orders.length === 0) && (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>
                      {t('orders_module.noOps')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
              <EmptyState title={t('orders_module.noSelectedOrder')} description={t('orders_module.chooseOrder')} />
            </div>
          )}
        </div>
      </div>

      {/* Refactored Enterprise UX Create Order Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent 
          style={{ maxWidth: '950px' }}
          className="max-h-[90vh] flex flex-col p-0 bg-slate-50 border border-slate-200 rounded-2xl shadow-2xl overflow-hidden focus:outline-none"
        >
          {/* Fixed Header */}
          <DialogHeader className="bg-white border-b border-slate-150 px-8 py-5 flex items-center justify-between shrink-0">
            <DialogTitle className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-800">
              <Clipboard size={22} className="text-orange-500" />
              {t('orders_module.dialogTitle')}
            </DialogTitle>
          </DialogHeader>

          {/* Scrollable Body */}
          <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 min-h-0">
            
            {/* Section 1: Order Information */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <BookOpen className="text-slate-555" size={18} />
                <h3 className="text-base font-bold text-slate-800">{t('orders_module.secOrderInfo')}</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-600 block">{t('orders_module.orderNumber')} <span className="text-red-500">*</span></label>
                  <input 
                    className="input w-full bg-slate-50 border-slate-200 hover:border-slate-350 focus:bg-white text-[15px] h-10 px-3 rounded-lg font-mono font-medium transition-all" 
                    value={formOrderNumber}
                    onChange={(e) => setFormOrderNumber(e.target.value)}
                    placeholder="PO-2026-0001" 
                    required 
                  />
                  {!formOrderNumber.trim() && (
                    <span className="text-xs text-red-500 font-semibold mt-1 block">{t('orders_module.orderNumRequired')}</span>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-600 block">{t('orders_module.customer')} <span className="text-red-500">*</span></label>
                  <input 
                    className="input w-full bg-slate-50 border-slate-200 hover:border-slate-350 focus:bg-white text-[15px] h-10 px-3 rounded-lg font-medium transition-all" 
                    value={formCustomer}
                    onChange={(e) => setFormCustomer(e.target.value)}
                    placeholder="Won Seal Tech" 
                    required 
                  />
                  {!formCustomer.trim() && (
                    <span className="text-xs text-red-500 font-semibold mt-1 block">{t('orders_module.customerRequired')}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-600 block">{t('orders_module.productCode')} <span className="text-red-500">*</span></label>
                  <input 
                    className="input w-full bg-slate-50 border-slate-200 hover:border-slate-350 focus:bg-white text-[15px] h-10 px-3 rounded-lg font-mono font-medium transition-all" 
                    value={formProduct}
                    onChange={(e) => setFormProduct(e.target.value)}
                    placeholder="BEARING-SEAL-01" 
                    required 
                  />
                  {!formProduct.trim() && (
                    <span className="text-xs text-red-500 font-semibold mt-1 block">{t('orders_module.productRequired')}</span>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-600 block">{t('orders_module.revision')}</label>
                  <input 
                    className="input w-full bg-slate-50 border-slate-200 hover:border-slate-350 focus:bg-white text-[15px] h-10 px-3 rounded-lg font-mono font-medium transition-all" 
                    value={formRevision}
                    onChange={(e) => setFormRevision(e.target.value)}
                    placeholder="Rev A" 
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Manufacturing Workflow */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Layers className="text-slate-555" size={18} />
                <h3 className="text-base font-bold text-slate-800">{t('orders_module.secWorkflow')}</h3>
              </div>

              {/* Search Box */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600 block">{t('orders_module.searchWorkflowPlaceholder')}</label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    className="input pl-11 w-full bg-slate-50 border-slate-200 hover:border-slate-350 focus:bg-white text-[15px] h-10 px-3 rounded-lg transition-all"
                    placeholder={t('orders_module.searchWorkflowPlaceholder')}
                    value={workflowSearch}
                    onChange={(e) => setWorkflowSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Workflow Cards */}
              <div className="grid grid-cols-2 gap-4 max-h-[260px] overflow-y-auto pr-1">
                {filteredWorkflows.map((wf: any) => {
                  const isSelected = formWorkflowId === wf.id
                  const opCount = wf.operations?.length ?? 0
                  const totalDurationSecs = wf.operations?.reduce((acc: number, op: any) => acc + (op.estimatedDuration ?? 0), 0) ?? 0
                  const durationMinutes = Math.ceil(totalDurationSecs / 60)

                  return (
                    <div
                      key={wf.id}
                      onClick={() => setFormWorkflowId(wf.id)}
                      className={cn(
                        "p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between h-full bg-white text-left",
                        isSelected 
                          ? "border-orange-500 bg-orange-50/10 shadow-sm" 
                          : "border-slate-200 hover:border-slate-350 hover:bg-slate-50/50"
                      )}
                    >
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="text-[15px] font-bold text-slate-800 leading-snug">
                            {t(`workflows.${wf.workflowName}`, { defaultValue: wf.workflowName })}
                          </h4>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 border",
                            wf.status === 'published' 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          )}>
                            {wf.status === 'published' ? t('orders_module.statusPublished', { defaultValue: 'Published' }) : t('orders_module.statusDraft', { defaultValue: 'Draft' })}
                          </span>
                        </div>
                        <p className="text-[13px] text-slate-450 leading-relaxed line-clamp-2">
                          {t(`workflows.${wf.description}`, { defaultValue: wf.description || t('orders_module.noDescription', { defaultValue: 'No description' }) })}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-y-2 justify-between text-xs text-slate-500">
                        <div>{t('orders_module.productFamilyLabel')}: <strong className="text-slate-700 font-semibold">{t(`workflows.${wf.productFamily}`, { defaultValue: wf.productFamily })}</strong></div>
                        <div className="flex gap-2 font-medium">
                          <span>v{wf.version}</span>
                          <span>•</span>
                          <span>{opCount} {t('orders_module.stepsLabel')}</span>
                          <span>•</span>
                          <span>{durationMinutes} {t('common.minutes', { defaultValue: 'phút' })}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {filteredWorkflows.length === 0 && (
                  <div className="col-span-2 py-8 text-center text-slate-450 text-[13px]">
                    {t('orders_module.noWorkflowsFound')}
                  </div>
                )}
              </div>
              {!formWorkflowId && (
                <span className="text-xs text-red-500 font-semibold block">{t('orders_module.workflowRequired')}</span>
              )}

              {/* Selected Workflow Summary Card */}
              {selectedWf && (() => {
                const opCount = selectedWf.operations?.length ?? 0
                const totalDurationSecs = selectedWf.operations?.reduce((acc: number, op: any) => acc + (op.estimatedDuration ?? 0), 0) ?? 0
                const durationMinutes = Math.ceil(totalDurationSecs / 60)

                return (
                  <div className="p-5 bg-orange-50/20 border border-orange-150 rounded-xl space-y-4 text-left">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-xs font-bold text-orange-600 uppercase tracking-wide">{t('orders_module.selectedWorkflowLabel')}</span>
                        <h4 className="text-[15px] font-bold text-slate-800 mt-0.5">
                          {t(`workflows.${selectedWf.workflowName}`, { defaultValue: selectedWf.workflowName })}
                        </h4>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline border-orange-250 text-orange-700 hover:bg-orange-50 font-bold px-3 py-1 rounded-lg text-xs"
                        onClick={() => setIsWorkflowExpanded(!isWorkflowExpanded)}
                      >
                        {isWorkflowExpanded ? t('orders_module.collapseDiagram') : t('orders_module.expandDiagram')}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-y-3 gap-x-4 text-[13px] border-t border-orange-100/50 pt-3">
                      <div>
                        <span className="text-slate-550 block">{t('orders_module.productFamilyLabel')}</span>
                        <strong className="text-slate-700 font-bold text-[14px]">
                          {t(`workflows.${selectedWf.productFamily}`, { defaultValue: selectedWf.productFamily })}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">{t('orders_module.versionLabel')}</span>
                        <strong className="text-slate-700 font-bold text-[14px]">v{selectedWf.version} (Rev {selectedWf.revision})</strong>
                      </div>
                      <div>
                        <span className="text-slate-550 block">{t('orders_module.statusLabel')}</span>
                        <strong className="text-slate-700 font-bold text-[14px] uppercase tracking-wider">
                          {selectedWf.status === 'published' ? t('orders_module.statusPublished', { defaultValue: 'Published' }) : t('orders_module.statusDraft', { defaultValue: 'Draft' })}
                        </strong>
                      </div>
                      <div className="mt-1">
                        <span className="text-slate-550 block">{t('orders_module.stepsLabel')}</span>
                        <strong className="text-orange-600 font-bold text-[14px]">{opCount} {t('orders_module.stepsLabel')}</strong>
                      </div>
                      <div className="mt-1">
                        <span className="text-slate-555 block">{t('orders_module.durationLabel')}</span>
                        <strong className="text-orange-600 font-bold text-[14px]">{durationMinutes} {t('common.minutes', { defaultValue: 'phút' })} ({totalDurationSecs}s)</strong>
                      </div>
                    </div>

                    {/* Timeline detail */}
                    {isWorkflowExpanded && (
                      <div className="pt-4 border-t border-orange-100/50 space-y-4">
                        <h5 className="text-xs font-bold text-slate-750 uppercase tracking-wider">{t('orders_module.timelineTitle')}</h5>
                        <div className="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-orange-200">
                          {selectedWf.operations?.map((op: any, index: number) => (
                            <div key={op.id || index} className="relative flex gap-3 items-start text-[13px]">
                              <div className="absolute -left-[20px] top-1.5 w-2 h-2 rounded-full bg-orange-500 border-2 border-white shadow-sm shrink-0 z-10" />
                              <div className="flex-1 bg-white p-3 rounded-lg border border-slate-150 shadow-sm flex justify-between items-center">
                                <div>
                                  <strong className="text-slate-750 font-bold block">
                                    {t(`operation_type.${op.operationType}`, { defaultValue: op.operationName || op.operationType })}
                                  </strong>
                                  <span className="text-xs text-slate-450 block mt-0.5">
                                    {t('orders_module.stationReqLabel')}: <strong className="text-slate-650 font-semibold">{op.requiresStation !== false ? (op.defaultStationType || op.stationType || 'Station') : t('orders_module.manualLabel')}</strong>
                                  </span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-orange-600 font-mono font-bold block">{op.estimatedDuration}s</span>
                                  <span className="text-[11px] text-slate-400 block mt-0.5">
                                    {t('orders_module.skillsLabel')}: {op.requiredSkills && op.requiredSkills.length > 0 ? op.requiredSkills.map((s: string) => t(`skills.${s}`, { defaultValue: s })).join(', ') : t('orders_module.noneLabel')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Section 3: Production Planning */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Calendar className="text-slate-555" size={18} />
                <h3 className="text-base font-bold text-slate-800">{t('orders_module.secPlanning')}</h3>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-600 block">{t('orders_module.targetQty')} <span className="text-red-500">*</span></label>
                  <input 
                    type="number"
                    className="input w-full bg-slate-50 border-slate-200 hover:border-slate-350 focus:bg-white text-[15px] h-10 px-3 rounded-lg font-bold" 
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(Number(e.target.value))}
                    min={1}
                    required 
                  />
                  {formQuantity <= 0 && (
                    <span className="text-xs text-red-500 font-semibold mt-1 block">{t('orders_module.quantityMinWarning')}</span>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-600 block">{t('orders_module.dueDate')} <span className="text-red-500">*</span></label>
                  <input 
                    type="date"
                    className="input w-full bg-slate-50 border-slate-200 hover:border-slate-350 focus:bg-white text-[15px] h-10 px-3 rounded-lg transition-all" 
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    required
                  />
                  {(() => {
                    if (!formDueDate) {
                      return <span className="text-xs text-red-500 font-semibold mt-1 block">{t('orders_module.dueRequired')}</span>
                    }
                    const today = new Date()
                    today.setHours(0,0,0,0)
                    const due = new Date(formDueDate)
                    if (due < today) {
                      return <span className="text-xs text-red-500 font-semibold mt-1 block">{t('orders_module.duePastWarning')}</span>
                    }
                    return null
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-600 block">{t('orders_module.priorityLabel')} <span className="text-red-500">*</span></label>
                  <input 
                    type="number"
                    className="input w-full bg-slate-50 border-slate-200 hover:border-slate-350 focus:bg-white text-[15px] h-10 px-3 rounded-lg transition-all" 
                    value={formPriority}
                    onChange={(e) => setFormPriority(Number(e.target.value))}
                    min={1}
                    max={100}
                    required 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-600 block">{t('orders_module.plannerLabel')}</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      className="input w-full bg-slate-100 border-slate-200 text-slate-550 text-[15px] h-10 pl-11 pr-3 rounded-lg cursor-not-allowed transition-all" 
                      value={user?.username || 'Planner'}
                      readOnly
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-600 block">{t('orders_module.notes')}</label>
                <textarea 
                  className="input w-full bg-slate-50 border-slate-200 hover:border-slate-350 focus:bg-white text-[15px] p-3 rounded-lg transition-all font-medium" 
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder={t('orders_module.notesPlaceholder')}
                />
              </div>
            </div>

            {/* Section 4: Review & Confirmation */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Cpu className="text-slate-555" size={18} />
                <h3 className="text-base font-bold text-slate-800">{t('orders_module.secReview')}</h3>
              </div>

              <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-[13px] bg-slate-50 p-4 rounded-xl border border-slate-150">
                <div>{t('orders_module.summarySelectedWf')} <strong className="text-slate-700 text-[14px] font-bold">{selectedWf ? t(`workflows.${selectedWf.workflowName}`, { defaultValue: selectedWf.workflowName }) : t('common.notSelected', { defaultValue: '(Chưa chọn)' })}</strong></div>
                <div>{t('orders_module.summaryQty')} <strong className="text-slate-700 text-[14px] font-bold">{formQuantity} pcs</strong></div>
                <div>{t('orders_module.summaryOps')} <strong className="text-slate-700 text-[14px] font-bold">{selectedWf?.operations?.length ?? 0} {t('orders_module.stepsLabel')}</strong></div>
                <div>{t('orders_module.summaryCycle')} <strong className="text-slate-700 text-[14px] font-bold">{selectedWf ? Math.ceil((selectedWf.operations?.reduce((acc: number, op: any) => acc + (op.estimatedDuration ?? 0), 0) ?? 0) / 60) : 0} {t('common.minutes', { defaultValue: 'phút' })}</strong></div>
                <div className="col-span-2">{t('orders_module.summaryDueDate')} <strong className="text-slate-700 text-[14px] font-bold">{formDueDate || t('common.notSelected', { defaultValue: '(Chưa chọn)' })}</strong></div>
              </div>

              {/* Warnings listing */}
              {validationWarnings.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-250 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                    <AlertTriangle size={18} className="text-amber-600" />
                    <span>{t('orders_module.warningsTitle')}</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-amber-700 space-y-1.5 pl-1.5 leading-normal">
                    {validationWarnings.map((w, index) => (
                      <li key={index} className="font-medium">{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

          </form>

          {/* Sticky Fixed Footer */}
          <DialogFooter className="bg-white border-t border-slate-150 p-6 flex justify-end gap-3 shrink-0 z-10">
            <button 
              type="button" 
              className="btn btn-outline border-slate-200 text-slate-700 hover:bg-slate-50 font-bold h-10 px-5 rounded-lg text-xs" 
              onClick={() => setIsCreateOpen(false)}
            >
              {t('orders_module.cancelButton')}
            </button>
            <button 
              type="submit" 
              className="btn btn-primary bg-orange-500 hover:bg-orange-600 text-white font-bold h-10 px-6 rounded-lg text-xs shadow-md transition-all" 
              disabled={isCreating || !isValid}
              onClick={handleCreateSubmit}
            >
              {isCreating ? t('orders_module.savingButton') : t('orders_module.submitButton')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
