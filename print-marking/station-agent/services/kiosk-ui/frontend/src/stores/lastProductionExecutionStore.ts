import { useEffect, useState } from 'react'

/**
 * lastProductionExecutionStore
 *
 * Single source of truth for the last known production execution.
 * Rules:
 *  - Updated whenever a production order starts or progresses.
 *  - NEVER cleared when a job finishes — keep final state visible.
 *  - Only replaced when a genuinely newer production order starts.
 */

export interface WorkOrderSummary {
  jobId: string
  jobNo: string
  productSerial?: string
  status: string
  updatedAt: string
}

export interface LastProductionExecution {
  // Identity
  productionOrder: string   // workOrderNo / jobNo
  jobId: string
  productCode: string
  productSerial?: string

  // Context
  workflow: string
  operation: string
  station: string
  team: string
  operator: string

  // Quantities
  totalQuantity: number
  completedQuantity: number
  failedQuantity: number

  // Progress 0-100
  progress: number

  // Timing
  startTime: string | null
  finishTime: string | null
  duration: string | null   // human-readable e.g. "15 sec"

  // Status
  status: string   // PROCESSING | COMPLETED | FAILED | QUEUED | WAIT_REWORK

  // Recent pieces
  workOrderSummaries: WorkOrderSummary[]

  latestUpdated: string
}

// ---------------------------------------------------------------------------
// Tiny reactive store (no external dependencies needed)
// ---------------------------------------------------------------------------
type Listener = () => void

interface Store {
  getState: () => LastProductionExecution | null
  setState: (next: LastProductionExecution | null) => void
  subscribe: (listener: Listener) => () => void
}

function createStore(): Store {
  let state: LastProductionExecution | null = null
  const listeners = new Set<Listener>()

  return {
    getState() { return state },
    setState(next) {
      state = next
      listeners.forEach(l => l())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export const lastProductionExecutionStore = createStore()

// ---------------------------------------------------------------------------
// React hook — subscribe to store changes
// ---------------------------------------------------------------------------
export function useLastProductionExecution(): LastProductionExecution | null {
  const [value, setValue] = useState(() => lastProductionExecutionStore.getState())

  useEffect(() => {
    const unsub = lastProductionExecutionStore.subscribe(() => {
      setValue(lastProductionExecutionStore.getState())
    })
    return unsub
  }, [])

  return value
}

// ---------------------------------------------------------------------------
// Helper — build an execution snapshot from available data
// ---------------------------------------------------------------------------
export function buildExecution(params: {
  jobId: string
  productionOrder: string
  productCode: string
  productSerial?: string
  jobStatus: string
  totalQuantity?: number
  completedQuantity?: number
  failedQuantity?: number
  startTime?: string | null
  finishTime?: string | null
  updatedAt: string
  existing?: LastProductionExecution | null
}): LastProductionExecution {
  const {
    jobId, productionOrder, productCode, productSerial, jobStatus,
    totalQuantity = 0, completedQuantity = 0, failedQuantity = 0,
    startTime = null, finishTime = null, updatedAt, existing
  } = params

  const total = totalQuantity || existing?.totalQuantity || 0
  const completed = completedQuantity || existing?.completedQuantity || 0
  const failed = failedQuantity || existing?.failedQuantity || 0
  const progress = total > 0
    ? Math.round((completed / total) * 100)
    : (jobStatus === 'COMPLETED' ? 100 : 0)

  // Compute human-readable duration
  let duration: string | null = null
  const start = startTime || existing?.startTime
  const finish = finishTime || (
    (jobStatus === 'COMPLETED' || jobStatus === 'FAILED') ? updatedAt : null
  )
  if (start && finish) {
    const ms = new Date(finish).getTime() - new Date(start).getTime()
    if (ms < 1000) duration = `${ms}ms`
    else if (ms < 60000) duration = `${Math.round(ms / 1000)} sec`
    else if (ms < 3600000) duration = `${Math.round(ms / 60000)} min`
    else duration = `${Math.round(ms / 3600000)} hr`
  }

  return {
    productionOrder,
    jobId,
    productCode,
    productSerial,
    workflow: existing?.workflow || 'Default Workflow',
    operation: existing?.operation || 'PRINT_LABEL',
    station: existing?.station || 'STATION-01',
    team: existing?.team || '—',
    operator: existing?.operator || '—',
    totalQuantity: total,
    completedQuantity: completed,
    failedQuantity: failed,
    progress,
    startTime: start || null,
    finishTime: finish || null,
    duration,
    status: jobStatus,
    workOrderSummaries: existing?.workOrderSummaries || [],
    latestUpdated: updatedAt,
  }
}
