import type { StepTrace, TestRun } from '../hooks/useTestRunner'

interface Props {
  testName: string
  testNameVi: string
  run: TestRun
  onClose: () => void
  lang: 'en' | 'vi'
}

const STATUS_COLOR: Record<string, string> = {
  pass: 'text-green-400',
  fail: 'text-red-400',
  running: 'text-blue-400',
  skip: 'text-gray-500',
}

const STATUS_LABEL: Record<string, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  running: '...',
  skip: 'SKIP',
}

const STATUS_BG: Record<string, string> = {
  pass: 'border-green-900/60 bg-green-950/10',
  fail: 'border-red-900/60 bg-red-950/10',
  running: 'border-blue-900/60 bg-blue-950/10 animate-pulse',
  skip: 'border-gray-800 bg-gray-900/40',
}

function formatMs(ms?: number): string {
  if (ms === undefined || ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false })
}

function StepCard({ step, lang }: { step: StepTrace; lang: 'en' | 'vi' }) {
  return (
    <div className={`rounded-lg border p-3 space-y-2 text-xs ${STATUS_BG[step.result] ?? 'border-gray-800 bg-gray-900/40'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
            step.result === 'pass' ? 'bg-green-950 text-green-400' :
            step.result === 'fail' ? 'bg-red-950 text-red-400' :
            step.result === 'running' ? 'bg-blue-950 text-blue-400' :
            'bg-gray-900 text-gray-500'
          }`}>
            {STATUS_LABEL[step.result] ?? step.result}
          </span>
          <span className="text-gray-300 font-medium">
            {lang === 'en' ? step.description : step.descriptionVi}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
          <span>{formatTime(step.startedAt)}</span>
          {step.durationMs !== undefined && (
            <span className="text-gray-400">{formatMs(step.durationMs)}</span>
          )}
        </div>
      </div>

      {step.url ? (
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
            step.method === 'POST' ? 'bg-amber-950 text-amber-400' :
            step.method === 'PUT' ? 'bg-purple-950 text-purple-400' :
            'bg-cyan-950 text-cyan-400'
          }`}>
            {step.method ?? 'GET'}
          </span>
          <span className="font-mono text-[10px] text-gray-400 truncate">{step.url}</span>
          {step.statusCode !== undefined ? (
            <span className={`text-[10px] font-mono font-bold ml-auto ${step.statusCode < 400 ? 'text-green-400' : 'text-red-400'}`}>
              {step.statusCode}
            </span>
          ) : null}
        </div>
      ) : null}

      {step.requestPayload ? (
        <details className="text-[10px]">
          <summary className="text-gray-500 cursor-pointer hover:text-gray-300 transition-colors select-none">
            {lang === 'en' ? 'Request payload' : 'Dữ liệu yêu cầu'}
          </summary>
          <pre className="mt-1.5 bg-gray-950 border border-gray-800 rounded p-2 font-mono text-gray-400 overflow-x-auto leading-relaxed">
            {JSON.stringify(step.requestPayload, null, 2)}
          </pre>
        </details>
      ) : null}

      {step.responsePayload ? (
        <details className="text-[10px]">
          <summary className="text-gray-500 cursor-pointer hover:text-gray-300 transition-colors select-none">
            {lang === 'en' ? 'Response payload' : 'Dữ liệu phản hồi'}
          </summary>
          <pre className="mt-1.5 bg-gray-950 border border-gray-800 rounded p-2 font-mono text-gray-400 overflow-x-auto leading-relaxed max-h-32">
            {JSON.stringify(step.responsePayload, null, 2)}
          </pre>
        </details>
      ) : null}

      {step.error ? (
        <div className="bg-red-950/30 border border-red-900/40 rounded px-2.5 py-1.5 text-[10px] text-red-300 font-medium">
          ⚠ {step.error}
        </div>
      ) : null}
    </div>
  )
}

export default function TestExecutionLog({ testName, testNameVi, run, onClose, lang }: Props) {
  const totalPassed = run.steps.filter((s) => s.result === 'pass').length
  const totalFailed = run.steps.filter((s) => s.result === 'fail').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-800 p-5 bg-gray-950 rounded-t-xl shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${
                run.status === 'passed' ? 'text-green-400' :
                run.status === 'failed' ? 'text-red-400' :
                run.status === 'running' ? 'text-blue-400' :
                'text-gray-400'
              }`}>
                {run.status === 'passed' ? '✅' : run.status === 'failed' ? '❌' : run.status === 'running' ? '⏳' : '⬜'}
                {' '}{lang === 'en' ? testName : testNameVi}
              </span>
            </div>
            <div className="flex gap-3 text-[10px] text-gray-500 font-mono">
              {run.startedAt && <span>{lang === 'en' ? 'Started:' : 'Bắt đầu:'} {formatTime(run.startedAt)}</span>}
              {run.durationMs !== undefined && <span>{lang === 'en' ? 'Duration:' : 'Thời gian:'} {formatMs(run.durationMs)}</span>}
              <span className="text-green-500">✓ {totalPassed} {lang === 'en' ? 'passed' : 'thành công'}</span>
              {totalFailed > 0 && <span className="text-red-500">✗ {totalFailed} {lang === 'en' ? 'failed' : 'thất bại'}</span>}
              <span className="text-blue-400">📡 {run.signalREventsReceived} SignalR</span>
              <span className="text-amber-400">🌐 {run.apiCallsExecuted} API</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
          >
            {lang === 'en' ? 'Close' : 'Đóng'}
          </button>
        </div>

        {/* Step Timeline */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {run.steps.length === 0 ? (
            <div className="text-center py-12 text-gray-600 text-sm">
              {lang === 'en' ? 'No steps recorded yet.' : 'Chưa có bước nào được ghi lại.'}
            </div>
          ) : (
            <div className="relative pl-5 border-l border-gray-800 space-y-3 ml-2">
              {run.steps.map((step, idx) => (
                <div key={idx} className="relative">
                  {/* Connector dot */}
                  <span className={`absolute -left-[25px] top-3 w-3 h-3 rounded-full border bg-gray-950 flex items-center justify-center ${
                    step.result === 'pass' ? 'border-green-500' :
                    step.result === 'fail' ? 'border-red-500' :
                    step.result === 'running' ? 'border-blue-500 animate-pulse' :
                    'border-gray-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      step.result === 'pass' ? 'bg-green-400' :
                      step.result === 'fail' ? 'bg-red-400' :
                      step.result === 'running' ? 'bg-blue-400' :
                      'bg-gray-500'
                    }`} />
                  </span>
                  {/* Step number label */}
                  <div className="text-[9px] text-gray-600 font-mono uppercase tracking-wider mb-1">
                    {lang === 'en' ? 'Step' : 'Bước'} {idx + 1} · {step.action}
                  </div>
                  <StepCard step={step} lang={lang} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — final verdict */}
        {(run.status === 'passed' || run.status === 'failed') && (
          <div className={`border-t p-4 rounded-b-xl text-center text-sm font-bold ${
            run.status === 'passed'
              ? 'border-green-900/50 bg-green-950/20 text-green-400'
              : 'border-red-900/50 bg-red-950/20 text-red-400'
          }`}>
            {run.status === 'passed'
              ? (lang === 'en' ? '✅ Test Passed' : '✅ Kiểm thử thành công')
              : (lang === 'en' ? '❌ Test Failed' : '❌ Kiểm thử thất bại')}
            {run.durationMs !== undefined && (
              <span className="text-[11px] text-gray-500 ml-3 font-normal">
                {lang === 'en' ? 'in' : 'trong'} {formatMs(run.durationMs)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
