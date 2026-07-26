/// <reference types="vite/client" />
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { APIEnvelope, TokenResponse } from '@/types'

// ─── Trace ID Generator ───────────────────────────────────────────────────────
function generateTraceId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ─── Token Storage ────────────────────────────────────────────────────────────
const TOKEN_KEY = 'mes_access_token'
const REFRESH_TOKEN_KEY = 'mes_refresh_token'

export const tokenStorage = {
  getAccessToken: () => localStorage.getItem(TOKEN_KEY),
  setAccessToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setRefreshToken: (token: string) => localStorage.setItem(REFRESH_TOKEN_KEY, token),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}

// ─── API Client ───────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// ─── Refresh state ────────────────────────────────────────────────────────────
let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

// ─── Request Interceptor ──────────────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // Propagate tracing headers matching backend middleware expectations
    config.headers['X-Trace-ID'] = generateTraceId()
    config.headers['X-Correlation-ID'] = generateTraceId()
    return config
  },
  (error) => Promise.reject(error),
)

// ─── Response Interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<APIEnvelope>) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = tokenStorage.getRefreshToken()

      if (!refreshToken) {
        tokenStorage.clear()
        window.dispatchEvent(new Event('mes:session-expired'))
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          addRefreshSubscriber((token) => {
            if (originalRequest.headers) {
              originalRequest.headers['Authorization'] = `Bearer ${token}`
            }
            resolve(apiClient(originalRequest))
          })
          void reject
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await axios.post<APIEnvelope<TokenResponse>>(
          `${BASE_URL}/auth/refresh`,
          { refresh_token: refreshToken },
        )

        const newToken = res.data.data!.access_token
        const newRefresh = res.data.data!.refresh_token
        tokenStorage.setAccessToken(newToken)
        tokenStorage.setRefreshToken(newRefresh)
        onRefreshed(newToken)

        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`
        }

        return apiClient(originalRequest)
      } catch {
        tokenStorage.clear()
        window.dispatchEvent(new Event('mes:session-expired'))
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

// ─── Typed API Helper ─────────────────────────────────────────────────────────
export async function apiGet<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<APIEnvelope<T>> {
  const res = await apiClient.get<APIEnvelope<T>>(url, { params })
  return res.data
}

export async function apiPost<T>(
  url: string,
  data?: unknown,
): Promise<APIEnvelope<T>> {
  const res = await apiClient.post<APIEnvelope<T>>(url, data)
  return res.data
}

export async function apiPut<T>(
  url: string,
  data?: unknown,
): Promise<APIEnvelope<T>> {
  const res = await apiClient.put<APIEnvelope<T>>(url, data)
  return res.data
}

export async function apiPatch<T>(
  url: string,
  data?: unknown,
): Promise<APIEnvelope<T>> {
  const res = await apiClient.patch<APIEnvelope<T>>(url, data)
  return res.data
}

export async function apiDelete<T = void>(
  url: string,
): Promise<APIEnvelope<T>> {
  const res = await apiClient.delete<APIEnvelope<T>>(url)
  return res.data
}

// ─── Error Helpers ────────────────────────────────────────────────────────────
export function getAPIErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const envelope = error.response?.data as APIEnvelope | undefined
    if (envelope?.error?.message) {
      return envelope.error.message
    }
    if (error.message) return error.message
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}

export function getAPIFieldErrors(
  error: unknown,
): Record<string, string> {
  if (axios.isAxiosError(error)) {
    const envelope = error.response?.data as APIEnvelope | undefined
    const details = envelope?.error?.details
    if (details) {
      return Object.fromEntries(details.map((d) => [d.field, d.message]))
    }
  }
  return {}
}
