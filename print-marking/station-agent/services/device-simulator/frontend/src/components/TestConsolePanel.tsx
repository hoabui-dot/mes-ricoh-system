import { useState, useMemo } from 'react'
import { ALL_TESTS } from '../testDefinitions'
import type { TestCategory, TestDefinition } from '../testDefinitions'
import { useTestRunner } from '../hooks/useTestRunner'
import TestExecutionLog from './TestExecutionLog'
import { USE_CASES_MD, USE_CASES_MD_VI } from '../useCasesDoc'

interface Props {
  signalRConnected: boolean
  signalREventCount: number
  lang: 'en' | 'vi'
}

// ─────────────────────────────────────────────────────────────────────────────
// i18n strings
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  en: {
    title: 'Test Console',
    subtitle: 'Enterprise Integration Test Platform',
    runAll: 'Run All Tests',
    runAllRunning: 'Running All Tests…',
    reset: 'Reset All',
    export: 'Export',
    total: 'Total',
    passed: 'Passed',
    failed: 'Failed',
    running: 'Running',
    skipped: 'Skipped',
    successRate: 'Success Rate',
    avgDuration: 'Avg Duration',
    signalR: 'SignalR Events',
    apiCalls: 'API Calls',
    run: 'Run Test',
    viewLog: 'View Log',
    manual: 'Manual — requires auth service',
    notRun: 'Not Run',
    noTests: 'No tests in this category.',
    signalRStatus: 'SignalR',
    exportJson: 'Export JSON',
    exportMd: 'Export Markdown',
    exportHtml: 'Export HTML',
    docButton: 'Document',
    docTitle: 'Use Case Documentation',
    close: 'Close',
    sharedCredsTitle: 'Kiosk UI Access Control Credentials',
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    serviceAccessControl: 'Kiosk UI Access Control',
    serviceOrchestration: 'Production & Rework Orchestration',
    serviceConnectivity: 'Device Connectivity & Failures',
    serviceSignalR: 'SignalR Communications',
    runService: 'Run All',
    showApi: 'Show API Details',
    hideApi: 'Hide API Details',
    steps: 'steps',
  },
  vi: {
    title: 'Kiểm tra hệ thống',
    subtitle: 'Nền tảng kiểm thử tích hợp doanh nghiệp',
    runAll: 'Chạy tất cả kiểm thử',
    runAllRunning: 'Đang chạy tất cả…',
    reset: 'Đặt lại tất cả',
    export: 'Xuất báo cáo',
    total: 'Tổng cộng',
    passed: 'Thành công',
    failed: 'Thất bại',
    running: 'Đang chạy',
    skipped: 'Bỏ qua',
    successRate: 'Tỉ lệ thành công',
    avgDuration: 'Thời gian trung bình',
    signalR: 'Sự kiện SignalR',
    apiCalls: 'Lời gọi API',
    run: 'Chạy',
    viewLog: 'Nhật ký',
    manual: 'Thủ công — cần dịch vụ xác thực',
    notRun: 'Chưa chạy',
    noTests: 'Không có kiểm thử nào.',
    signalRStatus: 'SignalR',
    exportJson: 'Xuất JSON',
    exportMd: 'Xuất Markdown',
    exportHtml: 'Xuất HTML',
    docButton: 'Tài liệu kịch bản',
    docTitle: 'Tài liệu kịch bản kiểm thử',
    close: 'Đóng',
    sharedCredsTitle: 'Thông tin xác thực Kiosk UI',
    usernameLabel: 'Tên đăng nhập',
    passwordLabel: 'Mật khẩu',
    serviceAccessControl: 'Kiểm soát truy cập Kiosk UI',
    serviceOrchestration: 'Điều phối sản xuất & Làm lại',
    serviceConnectivity: 'Kết nối thiết bị & Lỗi hệ thống',
    serviceSignalR: 'Truyền thông SignalR thời gian thực',
    runService: 'Chạy cả nhóm',
    showApi: 'Xem API',
    hideApi: 'Ẩn API',
    steps: 'bước',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatMs(ms?: number) {
  if (!ms) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function interpolate(str: string, params?: Record<string, string>): string {
  if (!str) return str
  if (!params) return str
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match
  })
}

// Render Markdown helper
function renderMarkdown(md: string) {
  let inCodeBlock = false
  const codeContent: string[] = []

  return md.split('\n').map((line, idx) => {
    // Handle Code Blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false
        const code = codeContent.join('\n')
        codeContent.length = 0 // Clear array
        return (
          <pre key={idx} className="bg-gray-950 border border-gray-800 rounded-lg p-3 font-mono text-[10px] text-indigo-300 my-2 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
            {code}
          </pre>
        )
      } else {
        inCodeBlock = true
        return null
      }
    }

    if (inCodeBlock) {
      codeContent.push(line)
      return null
    }

    // Headers
    if (line.startsWith('# ')) {
      return <h1 key={idx} className="text-base font-extrabold text-white mt-5 mb-2 border-b border-gray-800 pb-1 first:mt-0">{line.replace('# ', '')}</h1>
    }
    if (line.startsWith('## ')) {
      return <h2 key={idx} className="text-xs font-bold text-white mt-4 mb-1.5">{line.replace('## ', '')}</h2>
    }
    if (line.startsWith('### ')) {
      return <h3 key={idx} className="text-[11px] font-bold text-indigo-400 mt-3 mb-1">{line.replace('### ', '')}</h3>
    }

    // Horizontal Rule
    if (line.trim() === '---') {
      return <hr key={idx} className="border-gray-800 my-4" />
    }

    // Lists
    if (line.startsWith('* ')) {
      return <li key={idx} className="ml-4 list-disc text-xs text-gray-300 my-0.5 leading-relaxed">{line.replace('* ', '')}</li>
    }
    if (line.startsWith('- ')) {
      return <li key={idx} className="ml-4 list-dash text-xs text-gray-300 my-0.5 leading-relaxed">{line.replace('- ', '')}</li>
    }

    // Empty Lines
    if (line.trim() === '') {
      return <div key={idx} className="h-1" />
    }

    // Normal paragraph
    return <p key={idx} className="text-xs text-gray-400 leading-relaxed my-1">{line}</p>
  })
}

const STATUS_COLORS = {
  passed: {
    border: 'border-green-900/60',
    bg: 'bg-green-950/10',
    badge: 'bg-green-950 text-green-400 border border-green-900',
    dot: 'bg-green-400',
  },
  failed: {
    border: 'border-red-900/60',
    bg: 'bg-red-950/10',
    badge: 'bg-red-950 text-red-400 border border-red-900',
    dot: 'bg-red-400',
  },
  running: {
    border: 'border-blue-900/60',
    bg: 'bg-blue-950/10',
    badge: 'bg-blue-950 text-blue-400 border border-blue-900 animate-pulse',
    dot: 'bg-blue-400 animate-pulse',
  },
  skipped: {
    border: 'border-gray-800',
    bg: 'bg-gray-900/10',
    badge: 'bg-gray-900 text-gray-500 border border-gray-800',
    dot: 'bg-gray-500',
  },
  idle: {
    border: 'border-gray-800/50',
    bg: 'bg-gray-950/20',
    badge: 'bg-gray-900 text-gray-500 border border-gray-800',
    dot: 'bg-gray-700',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricsBar
// ─────────────────────────────────────────────────────────────────────────────
function MetricsBar({ metrics, lang }: { metrics: ReturnType<ReturnType<typeof useTestRunner>['computeMetrics']>; lang: 'en' | 'vi' }) {
  const t = T[lang]
  const cards = [
    { label: t.total, value: metrics.total, color: 'text-white' },
    { label: t.passed, value: metrics.passed, color: 'text-green-400' },
    { label: t.failed, value: metrics.failed, color: 'text-red-400' },
    { label: t.running, value: metrics.running, color: 'text-blue-400' },
    { label: t.skipped, value: metrics.skipped, color: 'text-gray-500' },
    { label: t.successRate, value: `${metrics.successRate}%`, color: metrics.successRate >= 80 ? 'text-green-400' : 'text-orange-400' },
    { label: t.avgDuration, value: formatMs(metrics.avgDurationMs), color: 'text-amber-400' },
    { label: t.signalR, value: metrics.totalSignalREvents, color: 'text-cyan-400' },
    { label: t.apiCalls, value: metrics.totalApiCalls, color: 'text-purple-400' },
  ]

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
      {cards.map((c) => (
        <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 text-center">
          <div className={`text-sm font-bold font-mono ${c.color}`}>{c.value}</div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">{c.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Nested Test Row
// ─────────────────────────────────────────────────────────────────────────────
function TestRow({
  test,
  run,
  onRun,
  onViewLog,
  isRunningAll,
  lang,
  sharedParams,
}: {
  test: TestDefinition
  run: ReturnType<typeof useTestRunner>['runs'][string] | undefined
  onRun: () => void
  onViewLog: () => void
  isRunningAll: boolean
  lang: 'en' | 'vi'
  sharedParams: Record<string, string>
}) {
  const t = T[lang]
  const status = run?.status ?? 'idle'
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.idle
  const isRunning = status === 'running'
  const [expanded, setExpanded] = useState(false)

  const statusLabel =
    status === 'passed' ? (lang === 'en' ? 'PASSED' : 'ĐẠT') :
    status === 'failed' ? (lang === 'en' ? 'FAILED' : 'LỖI') :
    status === 'running' ? (lang === 'en' ? 'RUNNING' : 'CHẠY') :
    status === 'skipped' ? (lang === 'en' ? 'SKIPPED' : 'BỎ QUA') :
    (lang === 'en' ? 'IDLE' : 'CHỜ')

  return (
    <div className={`border rounded-lg p-3 transition-all duration-200 ${colors.border} ${colors.bg} space-y-2`}>
      {/* Title row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors.dot}`} />
          <span className="text-xs font-semibold text-gray-200 truncate">
            {lang === 'en' ? test.name : test.nameVi}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded font-mono ${colors.badge}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Description */}
      <div className="text-[10px] text-gray-500 leading-relaxed pl-4.5">
        {lang === 'en' ? test.description : test.descriptionVi}
      </div>

      {/* Expandable API Calls */}
      {test.apiDetails && test.apiDetails.length > 0 && (
        <div className="pl-4.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider flex items-center gap-1 focus:outline-none"
          >
            {expanded ? '▼' : '▶'} {expanded ? t.hideApi : t.showApi}
          </button>

          {expanded && (
            <div className="bg-gray-950/60 border border-gray-850 rounded-lg p-2.5 mt-2 space-y-2">
              {test.apiDetails.map((detail, idx) => {
                const endpoint = interpolate(detail.endpoint, sharedParams)
                const model = detail.model ? interpolate(detail.model, sharedParams) : undefined

                return (
                  <div key={idx} className="border-t border-gray-900 pt-1.5 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-gray-400 font-semibold">{detail.service}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[9px]">
                      <span className={`px-1 rounded text-[8px] font-bold ${
                        detail.method === 'POST' ? 'bg-amber-950/60 text-amber-400 border border-amber-900/40' :
                        detail.method === 'GET' ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-900/40' :
                        detail.method === 'PUT' ? 'bg-purple-950/60 text-purple-400 border border-purple-900/40' :
                        detail.method === 'DELETE' ? 'bg-red-950/60 text-red-400 border border-red-900/40' :
                        detail.method === 'MQTT' ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-900/40' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {detail.method}
                      </span>
                      <span className="text-gray-300 break-all select-all">{endpoint}</span>
                    </div>
                    {model && (
                      <details className="mt-1 text-[8px]">
                        <summary className="text-gray-500 cursor-pointer hover:text-gray-300 transition-colors select-none">
                          {lang === 'en' ? 'View Payload' : 'Xem dữ liệu'}
                        </summary>
                        <pre className="mt-1 bg-gray-950 border border-gray-900 rounded p-1.5 font-mono text-indigo-300 overflow-x-auto whitespace-pre-wrap break-all leading-normal">
                          {model}
                        </pre>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Row Footer with run/log actions */}
      <div className="flex items-center gap-2 pl-4.5 pt-1">
        <span className="text-[9px] text-gray-600">
          {test.steps.length} {t.steps}
        </span>
        {run?.durationMs && (
          <span className="text-[9px] text-gray-600 font-mono">({formatMs(run.durationMs)})</span>
        )}
        {test.isManual && (
          <span className="text-[8px] bg-amber-950/30 text-amber-500 border border-amber-900/30 px-1 rounded">
            {lang === 'en' ? 'Manual' : 'Thủ công'}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onRun}
            disabled={isRunning || isRunningAll}
            className={`rounded px-2.5 py-1 text-[10px] font-bold transition-all disabled:opacity-50 ${
              status === 'passed'
                ? 'bg-green-900/30 hover:bg-green-900/50 text-green-300 border border-green-800/40'
                : status === 'failed'
                ? 'bg-red-900/30 hover:bg-red-900/50 text-red-300 border border-red-800/40'
                : 'bg-indigo-650 hover:bg-indigo-600 text-white'
            }`}
          >
            {isRunning ? (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full border border-t-white border-gray-700 animate-spin" />
                {lang === 'en' ? 'Running…' : 'Đang chạy…'}
              </span>
            ) : (
              `▶ ${t.run}`
            )}
          </button>
          {run && run.steps.length > 0 && (
            <button
              onClick={onViewLog}
              className="bg-gray-850 hover:bg-gray-750 text-gray-300 rounded px-2.5 py-1 text-[10px] font-bold border border-gray-800 transition-colors"
            >
              {t.viewLog}
            </button>
          )}
        </div>
      </div>

      {/* Error display */}
      {status === 'failed' && run?.steps && (
        <div className="text-[9px] text-red-400 bg-red-950/10 border border-red-900/20 rounded p-1.5 pl-4.5 font-mono">
          ⚠ {run.steps.find((s) => s.result === 'fail')?.error ?? 'Test failed'}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Panel
// ─────────────────────────────────────────────────────────────────────────────

export default function TestConsolePanel({ signalRConnected, signalREventCount }: Props) {
  const [panelLang, setPanelLang] = useState<'en' | 'vi'>('en')
  const t = T[panelLang]
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showDocModal, setShowDocModal] = useState(false)

  // Shared Credentials
  const [sharedUsername, setSharedUsername] = useState('admin123')
  const [sharedPassword, setSharedPassword] = useState('admin123')

  const { runs, runningAll, runTest, runAllTests, resetAll, computeMetrics, exportReport } =
    useTestRunner(signalRConnected, signalREventCount)

  // Memoize credentials params
  const sharedParams = useMemo(() => {
    return { username: sharedUsername, password: sharedPassword }
  }, [sharedUsername, sharedPassword])

  // Build merged parameters for all tests
  const mergedParams = useMemo(() => {
    const map: Record<string, Record<string, string>> = {}
    for (const test of ALL_TESTS) {
      if (test.category === 'Authentication' || test.category === 'Permission') {
        map[test.id] = sharedParams
      } else {
        map[test.id] = {}
      }
    }
    return map
  }, [sharedParams])

  const metrics = computeMetrics(ALL_TESTS)

  const selectedTest = selectedTestId ? ALL_TESTS.find((t) => t.id === selectedTestId) : null
  const selectedRun = selectedTestId ? runs[selectedTestId] : undefined

  // Categorize tests into the 4 primary services
  const accessControlTests = useMemo(
    () => ALL_TESTS.filter((t) => t.category === 'Authentication' || t.category === 'Permission'),
    []
  )

  const orchestrationTests = useMemo(
    () => ALL_TESTS.filter((t) => t.category === 'Production' || t.category === 'Rework'),
    []
  )

  const connectivityTests = useMemo(
    () => ALL_TESTS.filter((t) => t.category === 'DeviceHealth' || t.category === 'Failure'),
    []
  )

  const signalRTestsGroup = useMemo(
    () => ALL_TESTS.filter((t) => t.category === 'SignalR'),
    []
  )

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gray-900/40 p-4 border border-gray-800/80 rounded-xl backdrop-blur-sm">
        <div>
          <h2 className="text-base font-bold text-white">🧪 {t.title}</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Use Case Document Button */}
          <button
            onClick={() => setShowDocModal(true)}
            className="bg-gray-850 hover:bg-gray-750 border border-gray-800 text-indigo-400 hover:text-indigo-300 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            📖 {t.docButton}
          </button>

          {/* Local Language switcher */}
          <div className="flex items-center bg-gray-950 border border-gray-850 rounded-full p-0.5 gap-0.5 shrink-0">
            <button
              onClick={() => setPanelLang('en')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                panelLang === 'en'
                  ? 'bg-indigo-650 text-white shadow-md'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setPanelLang('vi')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                panelLang === 'vi'
                  ? 'bg-indigo-650 text-white shadow-md'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              VI
            </button>
          </div>

          {/* SignalR status */}
          <div className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-full border font-mono ${
            signalRConnected
              ? 'bg-green-950/40 border-green-900/60 text-green-400'
              : 'bg-red-950/40 border-red-900/60 text-red-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${signalRConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {t.signalRStatus}
          </div>

          {/* Export button */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((p) => !p)}
              className="bg-gray-850 hover:bg-gray-750 border border-gray-850 text-gray-300 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1"
            >
              📥 {t.export}
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-20 min-w-[150px] py-1">
                {(['json', 'markdown', 'html'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => { exportReport(ALL_TESTS, fmt); setShowExportMenu(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                  >
                    {fmt === 'json' ? t.exportJson : fmt === 'markdown' ? t.exportMd : t.exportHtml}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reset button */}
          <button
            onClick={resetAll}
            disabled={runningAll}
            className="bg-gray-850 hover:bg-gray-750 border border-gray-850 text-gray-400 hover:text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40"
          >
            ↺ {t.reset}
          </button>

          {/* Run All */}
          <button
            onClick={() => runAllTests(ALL_TESTS, mergedParams)}
            disabled={runningAll}
            className="bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg px-4 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {runningAll ? (
              <>
                <span className="w-3 h-3 rounded-full border border-t-white border-indigo-400 animate-spin" />
                {t.runAllRunning}
              </>
            ) : (
              `▶▶ ${t.runAll}`
            )}
          </button>
        </div>
      </div>

      {/* ── Metrics Dashboard ────────────────────────────────────────────────── */}
      <MetricsBar metrics={metrics} lang={panelLang} />

      {/* ── Grouped Service Cards Grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Service 1: Kiosk UI Access Control */}
        <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔐</span>
              <h3 className="text-sm font-bold text-white">{t.serviceAccessControl}</h3>
            </div>
            <button
              onClick={() => runAllTests(accessControlTests, mergedParams)}
              disabled={runningAll}
              className="bg-indigo-700/50 hover:bg-indigo-700/80 border border-indigo-900/40 text-indigo-300 rounded px-3 py-1 text-[10px] font-semibold transition-colors"
            >
              ▶ {t.runService}
            </button>
          </div>

          {/* Global Shared Credentials */}
          <div className="bg-gray-950/70 border border-gray-850 rounded-xl p-3.5 space-y-2.5 shadow-inner">
            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🗝️</span> {t.sharedCredsTitle}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-gray-500 font-bold">{t.usernameLabel}</label>
                <input
                  type="text"
                  value={sharedUsername}
                  onChange={(e) => setSharedUsername(e.target.value)}
                  className="bg-gray-900 border border-gray-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-gray-300 font-mono focus:outline-none transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-gray-500 font-bold">{t.passwordLabel}</label>
                <input
                  type="password"
                  value={sharedPassword}
                  onChange={(e) => setSharedPassword(e.target.value)}
                  className="bg-gray-900 border border-gray-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-gray-300 font-mono focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Tests List */}
          <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1.5">
            {accessControlTests.map((test) => (
              <TestRow
                key={test.id}
                test={test}
                run={runs[test.id]}
                onRun={() => runTest(test, sharedParams)}
                onViewLog={() => setSelectedTestId(test.id)}
                isRunningAll={runningAll}
                lang={panelLang}
                sharedParams={sharedParams}
              />
            ))}
          </div>
        </div>

        {/* Service 2: Production & Rework Orchestration */}
        <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔄</span>
              <h3 className="text-sm font-bold text-white">{t.serviceOrchestration}</h3>
            </div>
            <button
              onClick={() => runAllTests(orchestrationTests, mergedParams)}
              disabled={runningAll}
              className="bg-indigo-700/50 hover:bg-indigo-700/80 border border-indigo-900/40 text-indigo-300 rounded px-3 py-1 text-[10px] font-semibold transition-colors"
            >
              ▶ {t.runService}
            </button>
          </div>

          {/* Tests List */}
          <div className="space-y-3 overflow-y-auto max-h-[590px] pr-1.5">
            {orchestrationTests.map((test) => (
              <TestRow
                key={test.id}
                test={test}
                run={runs[test.id]}
                onRun={() => runTest(test, {})}
                onViewLog={() => setSelectedTestId(test.id)}
                isRunningAll={runningAll}
                lang={panelLang}
                sharedParams={{}}
              />
            ))}
          </div>
        </div>

        {/* Service 3: Device Connectivity & Failures */}
        <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔌</span>
              <h3 className="text-sm font-bold text-white">{t.serviceConnectivity}</h3>
            </div>
            <button
              onClick={() => runAllTests(connectivityTests, mergedParams)}
              disabled={runningAll}
              className="bg-indigo-700/50 hover:bg-indigo-700/80 border border-indigo-900/40 text-indigo-300 rounded px-3 py-1 text-[10px] font-semibold transition-colors"
            >
              ▶ {t.runService}
            </button>
          </div>

          {/* Tests List */}
          <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1.5">
            {connectivityTests.map((test) => (
              <TestRow
                key={test.id}
                test={test}
                run={runs[test.id]}
                onRun={() => runTest(test, {})}
                onViewLog={() => setSelectedTestId(test.id)}
                isRunningAll={runningAll}
                lang={panelLang}
                sharedParams={{}}
              />
            ))}
          </div>
        </div>

        {/* Service 4: SignalR Communications */}
        <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <h3 className="text-sm font-bold text-white">{t.serviceSignalR}</h3>
            </div>
            <button
              onClick={() => runAllTests(signalRTestsGroup, mergedParams)}
              disabled={runningAll}
              className="bg-indigo-700/50 hover:bg-indigo-700/80 border border-indigo-900/40 text-indigo-300 rounded px-3 py-1 text-[10px] font-semibold transition-colors"
            >
              ▶ {t.runService}
            </button>
          </div>

          {/* Tests List */}
          <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1.5">
            {signalRTestsGroup.map((test) => (
              <TestRow
                key={test.id}
                test={test}
                run={runs[test.id]}
                onRun={() => runTest(test, {})}
                onViewLog={() => setSelectedTestId(test.id)}
                isRunningAll={runningAll}
                lang={panelLang}
                sharedParams={{}}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Execution Log Modal ──────────────────────────────────────────────── */}
      {selectedTest && selectedRun && (
        <TestExecutionLog
          testName={selectedTest.name}
          testNameVi={selectedTest.nameVi}
          run={selectedRun}
          onClose={() => setSelectedTestId(null)}
          lang={panelLang}
        />
      )}

      {/* ── Use Case Document Modal ───────────────────────────────────────────── */}
      {showDocModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-850">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                📄 {t.docTitle}
              </h3>
              <button
                onClick={() => setShowDocModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-base p-1 focus:outline-none"
              >
                ✕
              </button>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {renderMarkdown(panelLang === 'vi' ? USE_CASES_MD_VI : USE_CASES_MD)}
            </div>
            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-gray-855 flex justify-end">
              <button
                onClick={() => setShowDocModal(false)}
                className="bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg px-4.5 py-2 text-xs font-bold transition-colors"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dismiss export menu on outside click */}
      {showExportMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
      )}
    </div>
  )
}
