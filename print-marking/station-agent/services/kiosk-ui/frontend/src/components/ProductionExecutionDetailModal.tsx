/**
 * ProductionExecutionDetailModal
 *
 * Reusable detail dialog used by Dashboard, History, and any future page.
 * Shows production record summary + pieces list + attempt/step timeline.
 */
import { useEffect, useState } from 'react'
import { jobsApi } from '@/api/client'
import { ProductionRecord } from '@/hooks/useDashboard'
import { StatusBadge } from '@/components/StatusBadge'
import { LabelPreview } from '@/components/LabelPreview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { History, Database, Clock } from 'lucide-react'
import client from '@/api/client'

// ── helpers ────────────────────────────────────────────────────────────────

const translateTriggerType = (type: string) => {
  if (!type) return '—'
  const t = type.toUpperCase()
  if (t === 'AUTO') return 'Yêu cầu tự động (Original)'
  if (t === 'MANUALREPRINT') return 'In lại nhãn (Manual Reprint)'
  if (t === 'MANUALREMARKING') return 'Khắc lại laser (Manual Re-marking)'
  if (t === 'MANUALREPROCESSING') return 'Làm lại quy trình (Manual Reprocess)'
  if (t === 'MANUAL_RETRY') return 'Thử lại thủ công'
  return type
}

const translateReasonCode = (code: string) => {
  if (!code) return '—'
  const c = code.toUpperCase()
  if (c === 'PRINT_QUALITY') return 'Lỗi chất lượng in'
  if (c === 'LASER_UNREADABLE') return 'Mã khắc không đọc được'
  if (c === 'WRONG_LABEL') return 'Sai nhãn sản phẩm'
  if (c === 'VERIFICATION_FAILED') return 'Lỗi xác thực vision'
  if (c === 'CUSTOMER_COMPLAINT') return 'Khiếu nại từ khách hàng'
  if (c === 'OPERATOR_MISTAKE') return 'Thao tác viên nhầm lẫn'
  if (c === 'MAINTENANCE_TEST') return 'Kiểm tra & Bảo trì'
  if (c === 'OTHER') return 'Lý do khác'
  return code
}

const parseFailureMessage = (_stepName: string, errorMessage: string) => {
  if (!errorMessage) return null
  try {
    const data = JSON.parse(errorMessage)
    if (data && (data.status === 'failed' || data.reason)) {
      let reason = data.reason
      if (reason === 'QR Code mismatch') reason = 'Sai lệch mã QR (QR Code mismatch)'
      else if (reason === 'Unreadable marking') reason = 'Mã khắc không đọc được (Unreadable marking)'
      else if (reason === 'Missing marking') reason = 'Thiếu dấu khắc/nhãn (Missing marking)'
      return { reason, expected: data.expected, actual: data.actual, rawResponse: errorMessage }
    }
  } catch {
    // not JSON
  }
  return { reason: errorMessage, expected: null, actual: null, rawResponse: errorMessage }
}

const getStepStatusBadge = (status: string) => {
  const s = status?.toUpperCase()
  if (s === 'COMPLETED') return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">Hoàn thành</span>
  if (s === 'FAILED') return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 text-xs font-semibold">Thất bại</span>
  if (s === 'PROCESSING') return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand/10 text-brand-light border border-brand/30 text-xs font-semibold animate-pulse">Đang chạy</span>
  if (s === 'SKIPPED') return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 text-xs font-semibold">Bỏ qua</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/30 text-xs font-semibold">Chờ</span>
}

// ── types ──────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: ProductionRecord | null
  activeTemplate?: any
}

// ── component ──────────────────────────────────────────────────────────────

export function ProductionExecutionDetailModal({ open, onOpenChange, record, activeTemplate }: Props) {
  const [detailTab, setDetailTab] = useState<'pieces' | 'progress'>('pieces')
  const [detailPieces, setDetailPieces] = useState<any[]>([])
  const [loadingPieces, setLoadingPieces] = useState(false)
  const [selectedPieceJobId, setSelectedPieceJobId] = useState<string | null>(null)
  const [detailAttempts, setDetailAttempts] = useState<any[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null)
  const [attemptSteps, setAttemptSteps] = useState<Record<string, any[]>>({})

  // Reset state when record changes
  useEffect(() => {
    if (!record || !open) {
      setDetailPieces([])
      setSelectedPieceJobId(null)
      setDetailAttempts([])
      setSelectedAttemptId(null)
      setAttemptSteps({})
      setDetailTab('pieces')
      return
    }

    let active = true
    setLoadingPieces(true)
    setDetailPieces([])
    setSelectedPieceJobId(null)
    setDetailTab('pieces')

    client.get(`/projection/records/work-order/${record.jobNo}`)
      .then((res: any) => {
        if (!active) return
        setDetailPieces(res.data || [])
        if (res.data && res.data.length > 0) {
          const sorted = [...res.data].sort(
            (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          const match = sorted.find((p: any) => p.jobId === record.jobId) || sorted[0]
          setSelectedPieceJobId(match.jobId)
        }
      })
      .catch((err: any) => console.error('[ProductionExecutionDetailModal] load pieces:', err))
      .finally(() => { if (active) setLoadingPieces(false) })

    return () => { active = false }
  }, [record, open])

  // Fetch attempts when selected piece changes
  useEffect(() => {
    if (!selectedPieceJobId) return
    let active = true
    setLoadingDetail(true)
    setSelectedAttemptId(null)
    setAttemptSteps({})

    jobsApi.getAttempts(selectedPieceJobId)
      .then((res: any) => {
        if (!active) return
        setDetailAttempts(res.data || [])
        if (res.data && res.data.length > 0) {
          const latest = [...res.data].sort((a: any, b: any) => b.attemptNo - a.attemptNo)[0]
          setSelectedAttemptId(latest.id)
        }
      })
      .catch((err: any) => console.error('[ProductionExecutionDetailModal] load attempts:', err))
      .finally(() => { if (active) setLoadingDetail(false) })

    return () => { active = false }
  }, [selectedPieceJobId])

  // Fetch steps for selected attempt
  useEffect(() => {
    if (!selectedAttemptId || attemptSteps[selectedAttemptId]) return

    jobsApi.getAttemptSteps(selectedAttemptId)
      .then((res: any) => {
        setAttemptSteps(prev => ({ ...prev, [selectedAttemptId]: res.data || [] }))
      })
      .catch((err: any) => console.error('[ProductionExecutionDetailModal] load steps:', err))
  }, [selectedAttemptId, attemptSteps])

  if (!record) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] md:max-w-5xl bg-card border-border text-foreground overflow-y-auto md:overflow-hidden md:flex md:flex-col max-h-[95vh] md:max-h-[90vh]">
        <DialogHeader className="pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-brand font-bold text-xl">
            <History className="h-5 w-5" />
            Chi tiết lịch sử &amp; Tiến trình gia công
          </DialogTitle>
          <DialogDescription className="text-muted-fg text-sm">
            Theo dõi chi tiết các lần chạy (attempts), tiến trình từng bước và nhật ký sự kiện của lệnh sản xuất.
          </DialogDescription>
        </DialogHeader>

        {/* Summary header */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-surface-2/60 border border-border/50 text-sm">
          <div>
            <span className="text-muted-fg block text-xs uppercase font-semibold">Lệnh sản xuất</span>
            <span className="font-bold text-foreground font-mono text-base">{record.jobNo}</span>
          </div>
          <div>
            <span className="text-muted-fg block text-xs uppercase font-semibold">Mã sản phẩm</span>
            <span className="font-semibold text-foreground text-base">{record.productCode}</span>
          </div>
          <div>
            <span className="text-muted-fg block text-xs uppercase font-semibold">Serial / Mã vạch</span>
            <span className="font-mono text-foreground text-sm font-bold">{record.productSerial || '—'}</span>
          </div>
          <div>
            <span className="text-muted-fg block text-xs uppercase font-semibold">Trạng thái hiện tại</span>
            <div className="mt-0.5">
              <StatusBadge status={record.currentStatus} jobType={record.jobType} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border mt-2">
          <button
            onClick={() => setDetailTab('pieces')}
            className={[
              'px-6 py-2.5 font-bold text-sm tracking-wider uppercase border-b-2 transition-all flex items-center gap-2',
              detailTab === 'pieces'
                ? 'border-brand text-brand bg-brand/5'
                : 'border-transparent text-muted-fg hover:text-foreground hover:bg-surface-2'
            ].join(' ')}
          >
            <Database className="h-4 w-4" />
            Sản phẩm chi tiết ({detailPieces.length})
          </button>
          <button
            onClick={() => setDetailTab('progress')}
            disabled={!selectedPieceJobId}
            className={[
              'px-6 py-2.5 font-bold text-sm tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed',
              detailTab === 'progress'
                ? 'border-brand text-brand bg-brand/5'
                : 'border-transparent text-muted-fg hover:text-foreground hover:bg-surface-2'
            ].join(' ')}
          >
            <Clock className="h-4 w-4" />
            Tiến trình &amp; Lần chạy thiết bị
          </button>
        </div>

        {/* Tab 1: Pieces List */}
        {detailTab === 'pieces' && (
          <div className="py-4 flex-1 overflow-hidden flex flex-col min-h-[350px]">
            <div className="border border-border rounded-lg bg-surface-2/30 flex-1 overflow-hidden flex flex-col">
              <div className="p-3 border-b border-border bg-surface-2 font-bold text-sm uppercase tracking-wider text-muted-fg flex justify-between items-center">
                <span>Danh sách sản phẩm trong lệnh</span>
                <Badge variant="outline" className="bg-background">{detailPieces.length}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {loadingPieces ? (
                  <div className="col-span-full text-center py-20 text-muted-fg text-sm animate-pulse">
                    Đang tải danh sách sản phẩm...
                  </div>
                ) : detailPieces.length === 0 ? (
                  <div className="col-span-full text-center py-20 text-muted-fg text-sm">
                    Không có sản phẩm nào được ghi nhận.
                  </div>
                ) : (
                  detailPieces.map((piece: any, idx: number) => {
                    const isSelected = selectedPieceJobId === piece.jobId
                    return (
                      <div
                        key={piece.id}
                        onClick={() => {
                          setSelectedPieceJobId(piece.jobId)
                          setDetailTab('progress')
                        }}
                        className={[
                          'p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3',
                          isSelected
                            ? 'bg-brand/10 border-brand/50 ring-1 ring-brand/30 shadow-sm font-semibold'
                            : 'bg-card hover:bg-surface-1 border-border hover:border-muted-fg/40 shadow-sm'
                        ].join(' ')}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="font-bold text-sm text-foreground">Sản phẩm #{idx + 1}</div>
                            <div className="font-mono text-xs text-muted-fg mt-0.5 break-all max-w-[170px]">
                              {piece.productSerial || 'Không có serial'}
                            </div>
                          </div>
                          <StatusBadge status={piece.currentStatus} jobType={piece.jobType} />
                        </div>

                        {piece.productSerial && activeTemplate && (
                          <div className="flex justify-center bg-white rounded-md border border-border/40 overflow-hidden p-1">
                            <LabelPreview
                              template={activeTemplate}
                              data={{
                                production_order: record.jobNo,
                                work_order: piece.productSerial || 'N/A',
                                product_name: (record.productCode || '—') + ' Bearing Seal',
                                product_code: record.productCode || '—',
                                revision: 'Rev A',
                                lot_number: 'LOT-2026-07-A',
                                batch_number: 'BATCH-01',
                                serial_number: piece.productSerial || 'N/A',
                              }}
                              width={180}
                              className="rounded border border-border/50"
                            />
                          </div>
                        )}

                        <div className="flex justify-between items-center text-[10px] text-muted-fg pt-2 border-t border-border/50 font-medium">
                          <span>Thời gian: {new Date(piece.updatedAt).toLocaleTimeString('vi-VN')}</span>
                          <span className="text-brand-light font-bold hover:underline">Xem chi tiết &rarr;</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Attempts & Steps Progress */}
        {detailTab === 'progress' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 py-4 md:overflow-hidden flex-1 min-h-0">
            {/* Left: Attempts List */}
            <div className="md:col-span-4 flex flex-col md:overflow-hidden border border-border rounded-lg bg-surface-2/30 max-h-[250px] md:max-h-none">
              <div className="p-3 border-b border-border bg-surface-2 font-bold text-sm uppercase tracking-wider text-muted-fg flex items-center justify-between">
                <span>Danh sách lần chạy</span>
                <Badge variant="outline" className="bg-background">{detailAttempts.length}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {!selectedPieceJobId ? (
                  <div className="text-center py-10 text-muted-fg text-xs">Chọn sản phẩm ở bên trái.</div>
                ) : loadingDetail ? (
                  <div className="text-center py-10 text-muted-fg text-xs animate-pulse">Đang tải danh sách...</div>
                ) : detailAttempts.length === 0 ? (
                  <div className="text-center py-10 text-muted-fg text-sm">Không có dữ liệu lần chạy.</div>
                ) : (
                  [...detailAttempts].sort((a, b) => b.attemptNo - a.attemptNo).map((attempt) => {
                    const isSelected = selectedAttemptId === attempt.id
                    const isSuccess = attempt.resultStatus?.toUpperCase() === 'COMPLETED' || attempt.resultStatus?.toUpperCase() === 'SUCCESS'
                    const isFailed = attempt.resultStatus?.toUpperCase() === 'FAILED'
                    return (
                      <div
                        key={attempt.id}
                        onClick={() => setSelectedAttemptId(attempt.id)}
                        className={[
                          'p-3 rounded-lg cursor-pointer border transition-all space-y-2',
                          isSelected
                            ? 'bg-brand/10 border-brand/50 text-foreground ring-1 ring-brand/30'
                            : 'border-transparent bg-surface-1 hover:bg-surface-2 hover:border-border text-muted-fg hover:text-foreground'
                        ].join(' ')}
                      >
                        <div className="flex justify-between items-center font-bold">
                          <span className={isSelected ? 'text-brand-light text-sm' : 'text-foreground text-sm'}>
                            Lần chạy #{attempt.attemptNo}
                          </span>
                          <span className="text-[10px] font-mono text-muted-fg/80">
                            {attempt.startedAt ? new Date(attempt.startedAt).toLocaleTimeString('vi-VN') : '—'}
                          </span>
                        </div>
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="opacity-75">Hành động:</span>
                            <span className="font-semibold text-foreground text-[11px] truncate max-w-[150px]">
                              {translateTriggerType(attempt.triggerType)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-75">Vận hành viên:</span>
                            <span className="font-semibold text-foreground text-[11px]">
                              {attempt.triggerType?.toUpperCase() === 'AUTO' ? 'Hệ thống' : (attempt.triggeredByUserId || 'Hệ thống')}
                            </span>
                          </div>
                          {attempt.reasonCode && (
                            <div className="bg-surface-2/80 p-1.5 rounded mt-1 border border-border/30">
                              <div className="flex justify-between font-semibold text-[10px] text-orange-400">
                                <span>Lý do:</span>
                                <span>{translateReasonCode(attempt.reasonCode)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-border/30 text-xs">
                          <span className="opacity-75 text-[10px]">Trạng thái:</span>
                          <Badge className={[
                            'px-1.5 py-0 text-[10px] font-semibold',
                            isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              isFailed ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                'bg-brand/10 text-brand-light border border-brand/20 animate-pulse'
                          ].join(' ')}>
                            {isSuccess ? 'OK' : isFailed ? 'NG' : 'Đang chạy'}
                          </Badge>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Right: Steps */}
            <div className="md:col-span-8 flex flex-col md:overflow-hidden min-h-0">
              <div className="flex-1 flex flex-col border border-border rounded-lg bg-surface-2/30 md:overflow-hidden min-h-[300px]">
                <div className="p-3 border-b border-border bg-surface-2 font-bold text-sm uppercase tracking-wider text-muted-fg flex items-center justify-between">
                  <span>Tiến trình từng bước</span>
                  {selectedAttemptId && (
                    <span className="font-mono text-xs text-brand-light font-bold bg-brand/10 px-2 py-0.5 rounded border border-brand/20">
                      ID Lần Chạy: {selectedAttemptId.slice(0, 8)}...
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {!selectedAttemptId ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-sm text-muted-fg">
                      Chọn một lần chạy ở bên trái.
                    </div>
                  ) : !attemptSteps[selectedAttemptId] ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-sm text-muted-fg animate-pulse">
                      Đang tải...
                    </div>
                  ) : attemptSteps[selectedAttemptId].length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-sm text-muted-fg">
                      Không có dữ liệu bước.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Failure analysis banner */}
                      {(() => {
                        const failedStep = attemptSteps[selectedAttemptId].find(
                          (s: any) => s.status?.toUpperCase() === 'FAILED'
                        )
                        const failure = failedStep
                          ? parseFailureMessage(failedStep.stepName, failedStep.errorMessage)
                          : null
                        if (!failure) return null
                        return (
                          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-2 text-sm">
                            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                              ⚠️ Phân Tích Nguyên Nhân Lỗi (Failure Analysis)
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div>
                                <span className="text-muted-fg block mb-0.5">Nguyên nhân:</span>
                                <span className="font-semibold text-red-300">{failure.reason}</span>
                              </div>
                              {failure.expected && (
                                <div>
                                  <span className="text-muted-fg block mb-0.5">Kỳ vọng:</span>
                                  <code className="font-mono bg-surface-3 px-1.5 rounded text-foreground">{failure.expected}</code>
                                </div>
                              )}
                              {failure.actual && (
                                <div>
                                  <span className="text-muted-fg block mb-0.5">Thực tế:</span>
                                  <code className="font-mono bg-surface-3 px-1.5 rounded text-red-300">{failure.actual}</code>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Step cards */}
                      {attemptSteps[selectedAttemptId].map((step: any, stepIdx: number) => (
                        <div
                          key={step.id}
                          className="bg-card border border-border rounded-xl p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="h-7 w-7 rounded-full bg-brand/10 text-brand-light border border-brand/20 flex items-center justify-center text-xs font-bold shrink-0">
                                {stepIdx + 1}
                              </span>
                              <div>
                                <div className="font-bold text-sm text-foreground">{step.stepName}</div>
                                {step.assignedDeviceId && (
                                  <div className="text-xs text-muted-fg mt-0.5">
                                    Thiết bị: <code className="bg-surface-3 px-1 rounded font-mono">{step.assignedDeviceId}</code>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0">{getStepStatusBadge(step.status)}</div>
                          </div>

                          {step.status === 'FAILED' && step.errorMessage && (() => {
                            const f = parseFailureMessage(step.stepName, step.errorMessage)
                            if (!f) return null
                            return (
                              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-xs space-y-1">
                                <div className="text-red-400 font-bold">Lỗi: {f.reason}</div>
                                {f.expected && <div className="text-muted-fg">Kỳ vọng: <code className="font-mono">{f.expected}</code></div>}
                                {f.actual && <div className="text-muted-fg">Thực tế: <code className="font-mono text-red-300">{f.actual}</code></div>}
                              </div>
                            )
                          })()}

                          <div className="flex flex-wrap gap-4 text-xs text-muted-fg pt-2 border-t border-border/40">
                            {step.startedAt && (
                              <span>Bắt đầu: <strong className="text-foreground font-mono">{new Date(step.startedAt).toLocaleTimeString('vi-VN')}</strong></span>
                            )}
                            {step.finishedAt && (
                              <span>Kết thúc: <strong className="text-foreground font-mono">{new Date(step.finishedAt).toLocaleTimeString('vi-VN')}</strong></span>
                            )}
                            {step.executionDurationMs > 0 && (
                              <span>Thời gian: <strong className="text-brand-light font-mono">{step.executionDurationMs}ms</strong></span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-border pt-4 mt-auto">
          <Button variant="outline" className="text-sm font-bold" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
