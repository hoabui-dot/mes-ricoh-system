import { useState, useEffect } from 'react'

interface Job {
  jobId: string
  jobNo: string
  productCode: string
  workflowType: string
  status: string
  startTime: string
  duration: number
  failureSource: string | null
}

interface TimelineItem {
  source: 'Engine' | 'Simulator' | 'PLC'
  stage: string
  status: string
  detail: string
  occurredAt: string
  performedBy?: string | null
}

interface PrinterJobResponse {
  id: string
  status: string
  zplContent: string | null
  durationMs: number
  receivedAt: string
  errorMessage: string | null
}

interface LaserCommandResponse {
  id: string
  rawCommand: string | null
  status: string
  durationMs: number
  executedAt: string
  errorMessage: string | null
}

interface VisionResultResponse {
  id: string
  result: string
  defectCode: string | null
  confidence: number | null
  ocrText: string | null
  durationMs: number
  verifiedAt: string
}

interface PlcEventResponse {
  id: string
  registerName: string
  value: boolean
  source: string
  occurredAt: string
}

interface FailureAnalysis {
  source: string
  reason: string
  expected: string
  actual: string
  device: string
  rawResponse: string
}

interface JobDetails {
  job: {
    id: string
    jobNo: string
    productCode: string
    jobType: string
    current_status: string
    created_at: string
    completed_at: string | null
    triggered_by_user_id: string | null
    reason_code: string | null
    reason_description: string | null
    labelTemplate?: string | null
  }
  attempts: any[]
  timeline: TimelineItem[]
  deviceResponses: {
    printer: PrinterJobResponse[]
    laser: LaserCommandResponse[]
    vision: VisionResultResponse[]
    plc: PlcEventResponse[]
  }
  failureAnalysis: FailureAnalysis | null
}

const translateStage = (stage: string) => {
  if (!stage) return '—';
  const s = stage.toUpperCase();
  if (s === 'START_PROCESSING') return 'Bắt đầu xử lý';
  if (s === 'START_MANUALREPRINT') return 'In lại nhãn thủ công (Manual Reprint)';
  if (s === 'START_MANUALREMARKING') return 'Khắc lại laser thủ công (Manual Re-marking)';
  if (s === 'START_MANUALREPROCESSING') return 'Làm lại quy trình thủ công (Manual Reprocess)';
  if (s === 'STEP_PRINT_LABEL_STARTED') return 'Bắt đầu in nhãn';
  if (s === 'STEP_PRINT_LABEL_FINISHED') return 'Hoàn thành in nhãn';
  if (s === 'STEP_LASER_MARK_STARTED') return 'Bắt đầu khắc laser';
  if (s === 'STEP_LASER_MARK_FINISHED') return 'Hoàn thành khắc laser';
  if (s === 'STEP_VISION_CHECK_STARTED') return 'Bắt đầu kiểm tra vision';
  if (s === 'STEP_VISION_CHECK_FINISHED') return 'Hoàn thành kiểm tra vision';
  if (s === 'STEP_PLC_REJECT_STARTED') return 'Bắt đầu loại bỏ sản phẩm lỗi';
  if (s === 'STEP_PLC_REJECT_FINISHED') return 'Hoàn thành loại bỏ sản phẩm lỗi';
  if (s === 'JOB_COMPLETED') return 'Lệnh hoàn thành';
  if (s === 'JOB_FAILED') return 'Lệnh thất bại';
  if (s === 'PLC_REJECT') return 'PLC Loại bỏ';
  if (s === 'PLC_REJECT_STARTED' || s === 'PLCREJECTSTARTED') return 'PLC Bắt đầu loại bỏ';
  if (s === 'PLC_REJECT_COMPLETED' || s === 'PLCREJECTCOMPLETED') return 'PLC Loại bỏ hoàn thành';
  return stage.replace(/_/g, ' ');
};

export default function JobsPanel() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [filter, setFilter] = useState<'All' | 'Running' | 'Completed' | 'Failed'>('All')
  const [loading, setLoading] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [details, setDetails] = useState<JobDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [detailTab, setDetailTab] = useState<'pieces' | 'progress'>('pieces')

  const fetchJobs = async () => {
    try {
      const response = await fetch(`/api/jobs?status=${filter}`)
      if (response.ok) {
        const data = await response.json()
        setJobs(data)
      }
    } catch (error) {
      console.error('Error fetching jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchDetails = async (id: string) => {
    setLoadingDetails(true)
    try {
      const response = await fetch(`/api/jobs/${id}/details`)
      if (response.ok) {
        const data = await response.json()
        setDetails(data)
      }
    } catch (error) {
      console.error('Error fetching job details:', error)
    } finally {
      setLoadingDetails(false)
    }
  }

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 3000)
    return () => clearInterval(interval)
  }, [filter])

  useEffect(() => {
    if (selectedJobId) {
      setDetailTab('pieces')
      fetchDetails(selectedJobId)
      const interval = setInterval(() => fetchDetails(selectedJobId), 3000)
      return () => clearInterval(interval)
    } else {
      setDetails(null)
    }
  }, [selectedJobId])

  const getStatusBadgeClass = (status: string) => {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return 'bg-green-950/80 text-green-400 border border-green-800'
      case 'FAILED':
        return 'bg-red-950/80 text-red-400 border border-red-800'
      case 'PROCESSING':
      case 'RUNNING':
        return 'bg-blue-950/80 text-blue-400 border border-blue-800 animate-pulse'
      default:
        return 'bg-gray-800 text-gray-400 border border-gray-700'
    }
  }

  const getSourceBadgeClass = (source: string) => {
    switch (source.toUpperCase()) {
      case 'PRINTER':
        return 'bg-amber-950 text-amber-400 border border-amber-900'
      case 'LASER':
        return 'bg-orange-950 text-orange-400 border border-orange-900'
      case 'VISION':
        return 'bg-cyan-950 text-cyan-400 border border-cyan-900'
      case 'PLC':
        return 'bg-indigo-950 text-indigo-400 border border-indigo-900'
      default:
        return 'bg-gray-900 text-gray-400 border border-gray-800'
    }
  }

  const getTimelineIcon = (source: string, stage: string) => {
    if (source === 'PLC') return '⚙️'
    if (stage.includes('Printer') || stage.includes('Print')) return '🖨️'
    if (stage.includes('Laser') || stage.includes('Mark')) return '⚡'
    if (stage.includes('Vision') || stage.includes('Verify') || stage.includes('Check')) return '📷'
    return '📦'
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-gray-900 p-1 rounded-lg border border-gray-800">
          {(['All', 'Running', 'Completed', 'Failed'] as const).map(f => (
            <button
              key={f}
              onClick={() => {
                setFilter(f)
                setLoading(true)
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                filter === f
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {f === 'Running' ? 'Đang chạy' : f === 'Completed' ? 'Thành công' : f === 'Failed' ? 'Lỗi' : 'Tất cả'}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-500">
          Tự động làm mới mỗi 3 giây
        </div>
      </div>

      {/* Grid Table */}
      <div className="bg-gray-900 border border-gray-850 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-950 border-b border-gray-850 text-gray-400 font-mono text-[10px] uppercase tracking-wider">
                <th className="py-3 px-4">Mã Yêu Cầu (Job ID)</th>
                <th className="py-3 px-4">Mã Sản Phẩm</th>
                <th className="py-3 px-4">Quy Trình</th>
                <th className="py-3 px-4 text-center">Trạng Thái</th>
                <th className="py-3 px-4">Nguồn Lỗi</th>
                <th className="py-3 px-4">Thời Gian Bắt Đầu</th>
                <th className="py-3 px-4 text-right">Thời Gian Chạy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-850 text-xs">
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-500">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-600 font-medium">
                    Không tìm thấy yêu cầu gia công nào.
                  </td>
                </tr>
              ) : (
                jobs.map(job => (
                  <tr
                    key={job.jobId}
                    onClick={() => setSelectedJobId(job.jobId)}
                    className="hover:bg-gray-850/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-200">
                      {job.jobNo}
                    </td>
                    <td className="py-3.5 px-4 text-gray-300 font-mono">
                      {job.productCode}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-purple-400 font-mono text-[10px] bg-purple-950/40 border border-purple-900/60 px-2 py-0.5 rounded">
                        {job.workflowType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClass(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {job.failureSource ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getSourceBadgeClass(job.failureSource)}`}>
                          {job.failureSource}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-gray-400 font-mono">
                      {new Date(job.startTime).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-300 font-mono">
                      {job.duration}s
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Job Detail Modal */}
      {selectedJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-5xl my-8 max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-gray-800 p-5 shrink-0 bg-gray-950 rounded-t-xl">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>🔍</span> Chi tiết tiến trình gia công & Dữ liệu thiết bị
                </h3>
                <p className="text-[10px] text-gray-500 mt-1 font-mono">
                  Mã tiến trình (Job ID): {details?.job.id || selectedJobId}
                </p>
              </div>
              <button
                onClick={() => setSelectedJobId(null)}
                className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3.5 py-1.5 rounded-lg text-xs transition-colors font-bold"
              >
                Đóng
              </button>
            </div>

            {/* Tab Navigation */}
            {details && (
              <div className="flex border-b border-gray-800 shrink-0 bg-gray-950 px-5">
                <button
                  onClick={() => setDetailTab('pieces')}
                  className={`px-6 py-2.5 font-bold text-xs tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 ${
                    detailTab === 'pieces'
                      ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                      : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <span>📦</span> Sản phẩm chi tiết ({jobs.filter((j: any) => j.jobNo === details.job.jobNo).length})
                </button>
                <button
                  onClick={() => setDetailTab('progress')}
                  disabled={!selectedJobId}
                  className={`px-6 py-2.5 font-bold text-xs tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    detailTab === 'progress'
                      ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                      : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <span>⚡</span> Tiến trình & Dữ liệu thiết bị
                </button>
              </div>
            )}

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingDetails && !details ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <span className="w-8 h-8 rounded-full border-2 border-t-blue-500 border-gray-800 animate-spin" />
                  <span className="text-xs text-gray-500">Đang tải dữ liệu chi tiết thiết bị...</span>
                </div>
              ) : details ? (
                <div className="space-y-6">
                  {detailTab === 'pieces' && (
                    <div className="py-2 flex-1 overflow-y-auto min-h-[350px]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {jobs.filter((j: any) => j.jobNo === details.job.jobNo).map((piece: any, idx: number) => {
                          const isSelected = selectedJobId === piece.jobId;
                          return (
                            <div
                              key={piece.jobId}
                              onClick={() => {
                                setSelectedJobId(piece.jobId);
                                setDetailTab('progress');
                              }}
                              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 min-h-[110px] ${
                                isSelected
                                  ? 'bg-blue-950/40 border-blue-500/50 shadow-sm font-semibold'
                                  : 'bg-gray-950 hover:bg-gray-800/50 border-gray-850 hover:border-gray-700 shadow-sm'
                              }`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div>
                                  <div className="font-bold text-xs text-white">Sản phẩm #{idx + 1}</div>
                                  <div className="font-mono text-[10px] text-gray-400 mt-1 break-all">
                                    Job ID: {piece.jobId.slice(0, 12)}…
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClass(piece.status)}`}>
                                  {piece.status}
                                </span>
                              </div>
                              
                              <div className="flex justify-between items-center text-[10px] text-gray-500 pt-2 border-t border-gray-800 font-medium">
                                <span>Bắt đầu: {new Date(piece.startTime).toLocaleTimeString('vi-VN')}</span>
                                <span className="text-blue-400 font-bold hover:underline">Xem chi tiết &rarr;</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {detailTab === 'progress' && (
                    <div className="space-y-6">
                      {/* Job Info Grid */}
                      <div className={`grid grid-cols-1 gap-4 ${details.job.labelTemplate ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
                    <div className="bg-gray-950 border border-gray-850 rounded-lg p-3 space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Mã Lệnh Sản Xuất</div>
                      <div className="text-sm font-bold text-white font-mono">{details.job.jobNo}</div>
                    </div>
                    <div className="bg-gray-950 border border-gray-850 rounded-lg p-3 space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Mã Sản Phẩm</div>
                      <div className="text-sm font-bold text-gray-200 font-mono">{details.job.productCode}</div>
                    </div>
                    {details.job.labelTemplate && (
                      <div className="bg-gray-950 border border-gray-850 rounded-lg p-3 space-y-1">
                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider text-amber-400/90 font-bold">Mẫu Nhãn Sử Dụng</div>
                        <div className="text-xs font-bold text-amber-300 font-mono truncate mt-0.5" title={details.job.labelTemplate}>
                          📄 {details.job.labelTemplate}
                        </div>
                      </div>
                    )}
                    <div className="bg-gray-950 border border-gray-850 rounded-lg p-3 space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Trạng Thái Lệnh</div>
                      <div className="flex items-center mt-0.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClass(details.job.current_status)}`}>
                          {details.job.current_status}
                        </span>
                      </div>
                    </div>
                    <div className="bg-gray-950 border border-gray-850 rounded-lg p-3 space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Người thực hiện</div>
                      <div className="text-xs text-gray-300 font-medium">
                        {details.job.triggered_by_user_id ? (
                          <span className="text-blue-400 font-semibold">{details.job.triggered_by_user_id} (Kiosk User)</span>
                        ) : (
                          <span className="text-gray-400">Hệ thống (Tự động)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Failure Analysis Block */}
                  {details.failureAnalysis && (
                    <div className="bg-red-950/20 border border-red-900/60 rounded-xl p-4 space-y-3">
                      <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span>⚠️</span> Phân Tích Nguyên Nhân Lỗi (Failure Analysis)
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="text-gray-500 block mb-0.5">Thiết bị lỗi:</span>
                          <span className="font-semibold text-gray-200 bg-gray-950 px-2 py-0.5 rounded border border-gray-850 inline-block mt-0.5">
                            {details.failureAnalysis.device}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block mb-0.5">Nguồn lỗi:</span>
                          <span className="font-semibold text-gray-200">{details.failureAnalysis.source}</span>
                        </div>
                        {details.failureAnalysis.expected && (
                          <div>
                            <span className="text-gray-500 block mb-0.5">Giá trị kỳ vọng:</span>
                            <span className="font-mono text-green-400 font-bold bg-green-950/30 px-2 py-0.5 rounded border border-green-900/50 inline-block mt-0.5">{details.failureAnalysis.expected}</span>
                          </div>
                        )}
                        {details.failureAnalysis.actual && (
                          <div>
                            <span className="text-gray-500 block mb-0.5">Giá trị thực tế:</span>
                            <span className="font-mono text-red-400 font-bold bg-red-950/30 px-2 py-0.5 rounded border border-red-900/50 inline-block mt-0.5">{details.failureAnalysis.actual}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-500 block mb-1">Nguyên nhân chi tiết:</span>
                        <div className="bg-red-950/30 border border-red-900/30 rounded p-2.5 font-medium text-red-300">
                          {details.failureAnalysis.reason}
                        </div>
                      </div>
                      {details.failureAnalysis.rawResponse && (
                        <div className="text-xs space-y-1">
                          <span className="text-gray-500 block">Phản hồi thô (Raw JSON):</span>
                          <pre className="bg-gray-950 border border-gray-850 rounded p-2 text-[10px] font-mono text-gray-400 overflow-x-auto">
                            {details.failureAnalysis.rawResponse}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step-by-Step Flow Audit Trail & Device Responses Side-by-Side */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Step-by-Step Flow */}
                    <div className="bg-gray-950/40 border border-gray-850 rounded-xl p-4 space-y-4">
                      <div className="border-b border-gray-850 pb-2 flex justify-between items-center">
                        <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                          Nhật ký sự kiện sản xuất (Audit Trail)
                        </h4>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {details.timeline.length} Sự kiện
                        </span>
                      </div>
                      <div className="relative pl-5 border-l border-gray-800 space-y-4 ml-2 py-1 max-h-[400px] overflow-y-auto pr-1">
                        {details.timeline.map((evt, idx) => {
                          const isError = evt.status === 'FAILED';
                          return (
                            <div key={idx} className="relative text-xs">
                              {/* Bullet point on the line */}
                              <span className={`absolute -left-[27px] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border bg-gray-950
                                ${isError ? 'border-red-500' : evt.source === 'PLC' ? 'border-indigo-500' : 'border-gray-700'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${isError ? 'bg-red-400' : evt.source === 'PLC' ? 'bg-indigo-400' : 'bg-gray-400'}`} />
                              </span>

                              <div className={`p-2.5 rounded-lg border transition-all space-y-1 bg-gray-900/60
                                ${isError ? 'border-red-900/60 bg-red-950/10' : 'border-gray-850'}`}>
                                <div className="flex justify-between items-center font-bold">
                                  <span className="flex items-center gap-1.5 text-gray-200">
                                    <span>{getTimelineIcon(evt.source, evt.stage)}</span>
                                    <span>{translateStage(evt.stage)}</span>
                                  </span>
                                  <span className="text-[9px] text-gray-500 font-mono">
                                    {new Date(evt.occurredAt).toLocaleTimeString('vi-VN')}
                                  </span>
                                </div>
                                <p className="text-gray-400 text-[11px] font-mono leading-relaxed bg-gray-950/40 p-1.5 rounded border border-gray-900">
                                  {evt.detail}
                                </p>
                                <div className="flex justify-between items-center text-[10px] pt-1">
                                  <span className="text-gray-600 font-mono text-[9px] uppercase tracking-wider">{evt.source}</span>
                                  {evt.performedBy ? (
                                    <span className="text-[10px] text-blue-400 font-semibold">Thực hiện: {evt.performedBy}</span>
                                  ) : (evt.source === 'Engine' && (evt.stage.toUpperCase() === 'START_PROCESSING' || evt.stage.toUpperCase() === 'START_AUTO')) ? (
                                    <span className="text-[10px] text-gray-500 font-medium">Thực hiện: Hệ thống</span>
                                  ) : null}
                                  <span className={`font-semibold text-[9px] ${evt.status === 'OK' || evt.status === 'INFO' ? 'text-green-500' : 'text-red-500'}`}>
                                    {evt.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Right: Device Responses Card */}
                    <div className="bg-gray-950/40 border border-gray-850 rounded-xl p-4 space-y-4 flex flex-col">
                      <div className="border-b border-gray-850 pb-2">
                        <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                          Phản hồi từ thiết bị phần cứng (Device Responses)
                        </h4>
                      </div>

                      <div className="flex-1 space-y-4 max-h-[400px] overflow-y-auto pr-1">
                        {/* Printer Section */}
                        {details.deviceResponses.printer.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex justify-between">
                              <span>🖨️ Máy in nhãn (ZPL content)</span>
                              <span>{details.deviceResponses.printer.length} phản hồi</span>
                            </div>
                            {details.deviceResponses.printer.map((p, idx) => (
                              <div key={idx} className="bg-gray-900 border border-gray-850 rounded p-2.5 space-y-1 text-xs">
                                <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                                  <span>Status: <span className={p.status === 'PRINTED' ? 'text-green-400' : 'text-red-400 font-bold'}>{p.status}</span></span>
                                  <span>{p.durationMs}ms · {new Date(p.receivedAt).toLocaleTimeString('vi-VN')}</span>
                                </div>
                                {p.zplContent && (
                                  <pre className="bg-gray-950 p-1.5 rounded text-[10px] font-mono text-gray-400 overflow-x-auto max-h-24 select-all leading-normal">
                                    {p.zplContent}
                                  </pre>
                                )}
                                {p.errorMessage && <div className="text-red-400 text-[10px] bg-red-950/30 p-1 rounded border border-red-900/40">{p.errorMessage}</div>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Laser Section */}
                        {details.deviceResponses.laser.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex justify-between">
                              <span>⚡ Máy khắc Laser (Etched content)</span>
                              <span>{details.deviceResponses.laser.length} phản hồi</span>
                            </div>
                            {details.deviceResponses.laser.map((l, idx) => (
                              <div key={idx} className="bg-gray-900 border border-gray-850 rounded p-2.5 space-y-1 text-xs">
                                <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                                  <span>Status: <span className={l.status === 'SUCCESS' ? 'text-green-400' : 'text-red-400 font-bold'}>{l.status}</span></span>
                                  <span>{l.durationMs}ms · {new Date(l.executedAt).toLocaleTimeString('vi-VN')}</span>
                                </div>
                                {l.rawCommand && (
                                  <pre className="bg-gray-950 p-1.5 rounded text-[10px] font-mono text-gray-400 overflow-x-auto max-h-24 select-all leading-normal">
                                    {l.rawCommand}
                                  </pre>
                                )}
                                {l.errorMessage && <div className="text-red-400 text-[10px] bg-red-950/30 p-1 rounded border border-red-900/40">{l.errorMessage}</div>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Vision Section */}
                        {details.deviceResponses.vision.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex justify-between">
                              <span>📷 Camera kiểm tra ngoại quan (Vision Camera)</span>
                              <span>{details.deviceResponses.vision.length} phản hồi</span>
                            </div>
                            {details.deviceResponses.vision.map((v, idx) => (
                              <div key={idx} className="bg-gray-900 border border-gray-850 rounded p-2.5 space-y-2 text-xs">
                                <div className="flex justify-between items-center">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${v.result === 'PASS' ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'}`}>
                                    {v.result}
                                  </span>
                                  <span className="text-[10px] text-gray-500 font-mono">{v.durationMs}ms · {new Date(v.verifiedAt).toLocaleTimeString('vi-VN')}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px] bg-gray-950 p-2 rounded font-mono">
                                  <div>OCR Text: <span className="text-gray-300 font-bold">{v.ocrText || '—'}</span></div>
                                  <div>Độ tin cậy: <span className="text-gray-300 font-bold">{v.confidence !== null ? `${(v.confidence * 100).toFixed(1)}%` : '—'}</span></div>
                                  {v.defectCode && <div className="col-span-2 text-red-400">Mã lỗi (Defect Code): <span className="font-bold">{v.defectCode}</span></div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* PLC Section */}
                        {details.deviceResponses.plc.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex justify-between">
                              <span>⚙️ Bộ điều khiển PLC (Modbus Events)</span>
                              <span>{details.deviceResponses.plc.length} phản hồi</span>
                            </div>
                            {details.deviceResponses.plc.map((plcEvent, idx) => (
                              <div key={idx} className="bg-gray-900 border border-gray-850 rounded p-2.5 flex items-center justify-between text-xs font-mono">
                                <div className="space-y-0.5">
                                  <div className="text-gray-300 font-bold">Register: {plcEvent.registerName}</div>
                                  <div className="text-[10px] text-gray-500">Nguồn: {plcEvent.source}</div>
                                </div>
                                <div className="text-right">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${plcEvent.value ? 'bg-indigo-950 text-indigo-400' : 'bg-gray-950 text-gray-500'}`}>
                                    {plcEvent.value ? 'ON' : 'OFF'}
                                  </span>
                                  <div className="text-[9px] text-gray-600 mt-1">{new Date(plcEvent.occurredAt).toLocaleTimeString('vi-VN')}</div>
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
            </div>
            ) : (
                <div className="text-center py-20 text-gray-500">
                  Không tìm thấy chi tiết yêu cầu.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
