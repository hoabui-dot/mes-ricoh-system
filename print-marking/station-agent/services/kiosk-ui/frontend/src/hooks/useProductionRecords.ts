import { useState, useCallback } from 'react'
import axios from 'axios'
import { ProductionRecord } from './useDashboard'

export interface PagedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface HistoryFilters {
  status?: string
  productCode?: string
  workOrder?: string
  dateFrom?: string
  dateTo?: string
}

export function useProductionRecords() {
  const [historyData, setHistoryData] = useState<PagedResult<ProductionRecord> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolve absolute API / Hub URLs for the projection service proxy (routing through Kiosk UI backend)
  const baseUrl = import.meta.env.VITE_PROJECTION_URL || `${window.location.protocol}//${window.location.host}`;

  const fetchHistory = useCallback(async (
    page: number,
    pageSize: number,
    filters: HistoryFilters = {}
  ) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.append('page', page.toString())
      params.append('pageSize', pageSize.toString())

      if (filters.status) params.append('status', filters.status)
      if (filters.productCode) params.append('productCode', filters.productCode)
      if (filters.workOrder) params.append('workOrder', filters.workOrder)
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.append('dateTo', filters.dateTo)

      const response = await axios.get<PagedResult<ProductionRecord>>(
        `${baseUrl}/api/projection/records/history?${params.toString()}`
      )
      setHistoryData(response.data)
    } catch (err: any) {
      console.error('Error fetching history production records:', err)
      setError(err.message || 'Lỗi khi tải lịch sử sản xuất.')
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  return {
    historyData,
    loading,
    error,
    fetchHistory
  }
}
