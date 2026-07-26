import { useEffect, useState, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import axios from 'axios'
import {
  lastProductionExecutionStore,
  buildExecution,
  WorkOrderSummary,
} from '@/stores/lastProductionExecutionStore'

export interface ProductionView {
  stationId: string
  jobId: string
  workOrderNo: string
  productCode: string
  productSerial?: string
  jobStatus: string
  // Extended fields from projection service (may be present)
  totalQuantity?: number
  completedQuantity?: number
  failedQuantity?: number
  startTime?: string
  finishTime?: string
  updatedAt: string
}

export interface ActivityLog {
  id: string
  eventType: string
  jobId: string
  jobNo: string
  productCode: string
  status: string
  message: string
  occurredAt: string
}

export interface DeviceStatus {
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

export interface ProductionRecord {
  id: string
  jobId: string
  jobNo: string
  productCode: string
  productSerial?: string
  jobType: string
  currentStatus: string
  stationId: string
  createdAt: string
  updatedAt: string
  // Batch production fields
  plannedQty?: number
  completedQty?: number
  failedQty?: number
}

export interface Alarm {
  id: string
  alarmType: string            // 'DeviceConnection' | 'ProductionError'
  alarmGroupKey: string
  severity: string             // 'Warning' | 'Error' | 'Critical'
  source: string
  message: string
  deviceId?: string
  deviceName?: string
  productionOrderId?: string
  isAcknowledged: boolean
  currentState: string         // 'Active' | 'Acknowledged' | 'Resolved'
  acknowledgedBy?: string
  acknowledgedAt?: string
  firstOccurredAt: string
  lastOccurredAt: string
  repeatCount: number
  resolvedAt?: string
  createdAt: string
}

export interface PagedAlarmResult {
  items: Alarm[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  activeCount: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Update the last-production-execution store from a ProductionView event */
function syncStoreFromProductionView(data: ProductionView) {
  const current = lastProductionExecutionStore.getState()

  // Only update if this is the same job or a genuinely newer one
  if (current && current.productionOrder !== data.workOrderNo) {
    // New production order — always replace
  } else if (current && current.status === 'COMPLETED' && data.jobStatus === 'COMPLETED') {
    // Already completed same job, only update quantities
  }

  const next = buildExecution({
    jobId: data.jobId,
    productionOrder: data.workOrderNo,
    productCode: data.productCode,
    productSerial: data.productSerial,
    jobStatus: data.jobStatus,
    totalQuantity: data.totalQuantity,
    completedQuantity: data.completedQuantity,
    failedQuantity: data.failedQuantity,
    startTime: data.startTime,
    finishTime: data.finishTime,
    updatedAt: data.updatedAt,
    existing: current,
  })

  lastProductionExecutionStore.setState(next)
}

/** Update workOrderSummaries from a ProductionRecord update */
function syncStoreFromRecord(data: ProductionRecord) {
  const current = lastProductionExecutionStore.getState()
  if (!current) return

  // Only update if it belongs to the same production order
  if (data.jobNo !== current.productionOrder) return

  const summary: WorkOrderSummary = {
    jobId: data.jobId,
    jobNo: data.jobNo,
    productSerial: data.productSerial,
    status: data.currentStatus,
    updatedAt: data.updatedAt,
  }

  const summaries = [...current.workOrderSummaries]
  const idx = summaries.findIndex(s => s.jobId === data.jobId)
  if (idx >= 0) {
    summaries[idx] = summary
  } else {
    summaries.unshift(summary)
  }

  // Also update quantities from record if available
  const completed = data.completedQty ?? current.completedQuantity
  const failed = data.failedQty ?? current.failedQuantity
  const total = data.plannedQty ?? current.totalQuantity
  const progress = total > 0 ? Math.round((completed / total) * 100) : current.progress

  lastProductionExecutionStore.setState({
    ...current,
    completedQuantity: completed,
    failedQuantity: failed,
    totalQuantity: total,
    progress,
    workOrderSummaries: summaries,
    latestUpdated: data.updatedAt,
  })
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useDashboard(stationId: string, onAlarmRaised?: (alarm: Alarm) => void) {
  const [production, setProduction] = useState<ProductionView | null>(null)
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [todayRecords, setTodayRecords] = useState<ProductionRecord[]>([])
  const [isConnected, setIsConnected] = useState(false)

  const baseUrl = import.meta.env.VITE_PROJECTION_URL ||
    `${window.location.protocol}//${window.location.host}`

  // Stable callbacks to avoid recreating them on every render
  const handleProductionUpdate = useCallback((data: ProductionView) => {
    setProduction(data)
    syncStoreFromProductionView(data)
  }, [])

  const handleActivityUpdate = useCallback((data: ActivityLog) => {
    setActivities(prev => {
      const filtered = prev.filter(a => a.id !== data.id)
      return [data, ...filtered].slice(0, 10)
    })
  }, [])

  const handleProductionRecordUpdate = useCallback((data: ProductionRecord) => {
    setTodayRecords(prev => {
      const exists = prev.some(r => r.id === data.id)
      if (exists) return prev.map(r => r.id === data.id ? data : r)
      return [data, ...prev]
    })
    syncStoreFromRecord(data)
  }, [])

  const handleDeviceStatusUpdate = useCallback((data: DeviceStatus) => {
    setDevices(prev => {
      const exists = prev.some(d => d.deviceId === data.deviceId)
      if (exists) return prev.map(d => d.deviceId === data.deviceId ? data : d)
      return [...prev, data]
    })
  }, [])

  const handleAlarmRaised = useCallback((data: Alarm) => {
    // Forward to AlarmCenterTab via callback — alarm state is managed there
    onAlarmRaised?.(data)
  }, [onAlarmRaised])

  // Keep a ref to the connection so we can stop it on cleanup
  const connRef = useRef<signalR.HubConnection | null>(null)

  useEffect(() => {
    let mounted = true

    // 1. Initial REST fetch from projection service
    const fetchInitialData = async () => {
      try {
        const [prodRes, actRes, devRes, todayRecsRes] = await Promise.all([
          axios.get<ProductionView>(`${baseUrl}/api/projection/production?stationId=${stationId}`).catch(() => null),
          axios.get<ActivityLog[]>(`${baseUrl}/api/projection/activities?limit=10`).catch(() => ({ data: [] as ActivityLog[] })),
          axios.get<DeviceStatus[]>(`${baseUrl}/api/projection/devices`).catch(() => ({ data: [] as DeviceStatus[] })),
          axios.get<{ items: ProductionRecord[], totalCount: number }>(
            `${baseUrl}/api/projection/records/today?page=1&pageSize=100`
          ).catch(() => ({ data: { items: [] as ProductionRecord[], totalCount: 0 } })),
        ])

        if (!mounted) return

        if (prodRes?.data) {
          setProduction(prodRes.data)
          syncStoreFromProductionView(prodRes.data)
        }
        if (actRes?.data) setActivities(actRes.data)
        if (devRes?.data) setDevices(devRes.data)
        if (todayRecsRes?.data?.items) setTodayRecords(todayRecsRes.data.items)
      } catch (err) {
        console.error('[useDashboard] Error fetching initial projection data:', err)
      }
    }

    fetchInitialData()

    // 2. SignalR Hub connection
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/production`)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    connRef.current = conn

    conn.on('OnProductionUpdate', handleProductionUpdate)
    conn.on('OnActivityUpdate', handleActivityUpdate)
    conn.on('OnProductionRecordUpdate', handleProductionRecordUpdate)
    conn.on('OnDeviceStatusUpdate', handleDeviceStatusUpdate)
    conn.on('OnAlarmRaised', handleAlarmRaised)

    conn.start()
      .then(async () => {
        if (!mounted) return
        setIsConnected(true)
        try {
          await conn.invoke('SubscribeToStation', stationId)
        } catch (err) {
          console.warn('[useDashboard] SubscribeToStation failed:', err)
        }
      })
      .catch(err => console.error('[useDashboard] SignalR connection error:', err))

    conn.onreconnected(() => {
      if (mounted) setIsConnected(true)
      conn.invoke('SubscribeToStation', stationId).catch(() => {})
    })
    conn.onclose(() => {
      if (mounted) setIsConnected(false)
    })

    return () => {
      mounted = false
      conn.off('OnProductionUpdate', handleProductionUpdate)
      conn.off('OnActivityUpdate', handleActivityUpdate)
      conn.off('OnProductionRecordUpdate', handleProductionRecordUpdate)
      conn.off('OnDeviceStatusUpdate', handleDeviceStatusUpdate)
      conn.off('OnAlarmRaised', handleAlarmRaised)
      conn.stop().catch(() => {})
      connRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, baseUrl])

  return { isConnected, production, activities, devices, todayRecords }
}
