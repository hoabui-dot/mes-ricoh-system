import React, { useState, useEffect } from 'react'
import type { PrintHistory } from '../../types/label'

const PAGE_SIZE = 50

const STATUS_STYLE: Record<string, string> = {
  SUCCESS: 'bg-green-900/50 text-green-400 border border-green-800',
  FAILED: 'bg-red-900/50 text-red-400 border border-red-800',
  PENDING: 'bg-yellow-900/40 text-yellow-400 border border-yellow-800',
}

export default function PrintHistoryPanel() {
  const [records, setRecords] = useState<PrintHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<PrintHistory | null>(null)

  const loadHistory = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/print-history?page=${page}&pageSize=${PAGE_SIZE}`)
      const data = await res.json()
      setRecords(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/print-history/${id}`)
      const data: PrintHistory = await res.json()
      setSelected(data)
    } catch (e) { console.error(e) }
  }

  useEffect(() => { loadHistory() }, [page])

  const formatDuration = (ms: number) =>
    ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-300">Print History</h3>
        <span className="text-xs text-gray-600">({records.length} records)</span>
        <button onClick={loadHistory}
          className="ml-auto px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition">
          ↻ Refresh
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 rounded">
            ←
          </button>
          <span className="text-xs text-gray-500 px-1">p.{page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={records.length < PAGE_SIZE}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 rounded">
            →
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500 text-sm animate-pulse">Loading history…</div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
          <span className="text-4xl">📊</span>
          <p className="text-sm">No print history yet. Run a Print Test from the Preview tab.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900 text-gray-500 uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left">Time</th>
                <th className="px-3 py-2.5 text-left">Template</th>
                <th className="px-3 py-2.5 text-center">Ver</th>
                <th className="px-3 py-2.5 text-center">Printer</th>
                <th className="px-3 py-2.5 text-center">Duration</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-center">Retries</th>
                <th className="px-3 py-2.5 text-left">TraceId</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id}
                  onClick={() => loadDetail(r.id)}
                  className={`border-t border-gray-800 cursor-pointer hover:bg-indigo-900/20 transition-colors
                    ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-950/50'}`}
                >
                  <td className="px-3 py-2.5 font-mono text-gray-500 text-[10px]">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-white max-w-[140px] truncate">
                    {r.templateName}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-indigo-400 text-[10px]">
                    v{r.templateVersion}
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-400 font-mono text-[10px]">
                    {r.printerCode}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-gray-400">
                    {formatDuration(r.durationMs)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_STYLE[r.status] ?? STATUS_STYLE.PENDING}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-500">
                    {r.retryCount > 0 ? <span className="text-orange-400">{r.retryCount}</span> : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-gray-600 text-[10px] max-w-[100px] truncate">
                    {r.traceId.slice(0, 16)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Dialog */}
      {selected && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"
          onClick={() => setSelected(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}>
            {/* Dialog Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
              <span className={`px-2 py-1 rounded text-xs font-bold ${STATUS_STYLE[selected.status] ?? ''}`}>
                {selected.status}
              </span>
              <span className="text-sm font-bold text-white">{selected.templateName}</span>
              <span className="text-xs text-indigo-400">v{selected.templateVersion}</span>
              <span className="text-xs text-gray-500">·</span>
              <span className="text-xs text-gray-500 font-mono">{selected.printerCode}</span>
              <span className="text-xs text-gray-500">·</span>
              <span className="text-xs text-gray-500">{formatDuration(selected.durationMs)}</span>
              <button onClick={() => setSelected(null)}
                className="ml-auto text-gray-500 hover:text-white text-lg leading-none">×</button>
            </div>

            {/* Dialog Body */}
            <div className="overflow-y-auto flex-1 p-5">
              <div className="grid grid-cols-2 gap-4">

                {/* Runtime Data */}
                <DetailSection title="Runtime Data" color="yellow">
                  <pre className="text-yellow-300 text-[10px]">{formatJson(selected.runtimeDataJson)}</pre>
                </DetailSection>

                {/* Generated ZPL */}
                <DetailSection title="Generated ZPL" color="green">
                  <pre className="text-green-400 text-[10px] whitespace-pre-wrap">{selected.renderedZpl}</pre>
                </DetailSection>

                {/* TCP Request */}
                <DetailSection title="TCP Request (hex)" color="blue">
                  <pre className="text-blue-300 text-[10px] break-all whitespace-pre-wrap">
                    {selected.tcpRequestHex ?? '(not captured)'}
                  </pre>
                </DetailSection>

                {/* TCP Response */}
                <DetailSection title="TCP Response" color="blue">
                  <pre className="text-blue-300 text-[10px]">
                    {selected.tcpResponseHex ?? '(not captured)'}
                  </pre>
                </DetailSection>

                {/* Printer Result */}
                <DetailSection title="Printer Result" color="gray">
                  <pre className="text-gray-300 text-[10px]">{selected.printerResult ?? '(none)'}</pre>
                </DetailSection>

                {/* Exception */}
                {selected.exceptionMessage && (
                  <DetailSection title="Exception" color="red">
                    <pre className="text-red-300 text-[10px] whitespace-pre-wrap">{selected.exceptionMessage}</pre>
                  </DetailSection>
                )}

              </div>

              {/* Full Timeline */}
              <div className="mt-4 grid grid-cols-1 gap-2">
                <DetailSection title="Trace Info" color="gray">
                  <div className="flex gap-6 text-[10px] font-mono">
                    <div><span className="text-gray-500">TraceId: </span><span className="text-gray-300">{selected.traceId}</span></div>
                    <div><span className="text-gray-500">CorrelationId: </span><span className="text-gray-300">{selected.correlationId}</span></div>
                    <div><span className="text-gray-500">Retries: </span><span className="text-gray-300">{selected.retryCount}</span></div>
                    <div><span className="text-gray-500">Created: </span><span className="text-gray-300">{new Date(selected.createdAt).toLocaleString()}</span></div>
                  </div>
                </DetailSection>

                {selected.timelineJson && (
                  <DetailSection title="Full Timeline" color="gray">
                    <pre className="text-gray-400 text-[10px]">{formatJson(selected.timelineJson)}</pre>
                  </DetailSection>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const border = {
    yellow: 'border-yellow-800/60', green: 'border-green-800/60',
    blue: 'border-blue-800/60', red: 'border-red-800/60', gray: 'border-gray-800'
  }[color] ?? 'border-gray-800'
  const text = {
    yellow: 'text-yellow-500', green: 'text-green-500',
    blue: 'text-blue-400', red: 'text-red-500', gray: 'text-gray-500'
  }[color] ?? 'text-gray-500'

  return (
    <div className={`bg-gray-950 rounded-lg border ${border} p-3`}>
      <div className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${text}`}>{title}</div>
      <div className="overflow-auto max-h-48">{children}</div>
    </div>
  )
}

function formatJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}
