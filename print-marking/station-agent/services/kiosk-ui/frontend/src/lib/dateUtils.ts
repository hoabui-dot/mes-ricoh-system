/**
 * Shared Date Utility
 * Enforces the 7-day data retention policy.
 * All ranges are normalized to start of day (00:00:00.000) and end of day (23:59:59.999).
 */

export function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseYmd(ymdStr: string): Date {
  const [y, m, d] = ymdStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function getRetentionLimitDate(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const limitDate = new Date(today)
  limitDate.setDate(today.getDate() - 6) // Last 7 days includes today, so limit is today - 6 days
  return limitDate
}

export function getRetentionLimitStr(): string {
  return formatYmd(getRetentionLimitDate())
}

export function getTodayStr(): string {
  return formatYmd(new Date())
}

export function normalizeStartOfDay(dateStr: string): string {
  if (!dateStr) return ''
  const ymd = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
  return `${ymd}T00:00:00.000`
}

export function normalizeEndOfDay(dateStr: string): string {
  if (!dateStr) return ''
  const ymd = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
  return `${ymd}T23:59:59.999`
}

export function clampToRetentionWindow(dateStr: string, fallback: string): string {
  if (!dateStr) return fallback
  const limitStr = getRetentionLimitStr()
  const todayStr = getTodayStr()
  const ymd = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
  if (ymd < limitStr) return limitStr
  if (ymd > todayStr) return todayStr
  return ymd
}

export interface DateRange {
  dateFrom: string
  dateTo: string
}

export function buildTodayRange(): DateRange {
  const today = getTodayStr()
  return {
    dateFrom: normalizeStartOfDay(today),
    dateTo: normalizeEndOfDay(today)
  }
}

export function buildYesterdayRange(): DateRange {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const yesterday = formatYmd(d)
  return {
    dateFrom: normalizeStartOfDay(yesterday),
    dateTo: normalizeEndOfDay(yesterday)
  }
}

export function buildLast3DaysRange(): DateRange {
  const d = new Date()
  d.setDate(d.getDate() - 2)
  const start = formatYmd(d)
  const today = getTodayStr()
  return {
    dateFrom: normalizeStartOfDay(start),
    dateTo: normalizeEndOfDay(today)
  }
}

export function buildLast7DaysRange(): DateRange {
  const limit = getRetentionLimitStr()
  const today = getTodayStr()
  return {
    dateFrom: normalizeStartOfDay(limit),
    dateTo: normalizeEndOfDay(today)
  }
}

export function formatRangeDisplay(dateFrom: string, dateTo: string): string {
  if (!dateFrom || !dateTo) return ''
  
  const formatDate = (isoStr: string) => {
    const ymd = isoStr.includes('T') ? isoStr.split('T')[0] : isoStr
    const [y, m, d] = ymd.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${d} ${months[parseInt(m) - 1]} ${y}`
  }

  const fromYmd = dateFrom.split('T')[0]
  const toYmd = dateTo.split('T')[0]

  if (fromYmd === toYmd) {
    return formatDate(fromYmd)
  }
  return `${formatDate(fromYmd)} → ${formatDate(toYmd)}`
}
