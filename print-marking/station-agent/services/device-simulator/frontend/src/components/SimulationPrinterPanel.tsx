import { useState, useEffect, useCallback } from 'react'

const MODES = [
  'Success', 'PrinterBusy', 'PaperOut', 'RibbonOut',
  'HeadOpen', 'InvalidZpl', 'InvalidBarcode', 'TcpTimeout', 'MemoryFull', 'Offline',
]

interface SimPrinter {
  printerCode: string
  displayName: string
  port: number
  simulatorMode: string
  isOnline: boolean
  isListening: boolean
}

export default function SimulationPrinterPanel() {
  const [printers, setPrinters] = useState<SimPrinter[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/printers/simulation-status')
      if (res.ok) {
        const data = await res.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPrinters(data.map((d: any) => ({
          printerCode:   d.printerCode   ?? d.PrinterCode,
          displayName:   d.displayName   ?? d.DisplayName,
          port:          d.port          ?? d.Port,
          simulatorMode: d.simulatorMode ?? d.SimulatorMode ?? 'Success',
          isOnline:      d.isOnline      ?? d.IsOnline      ?? false,
          isListening:   d.isListening   ?? d.IsListening   ?? false,
        })))
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const t = setInterval(fetchStatus, 3000)
    return () => clearInterval(t)
  }, [fetchStatus])

  const setBusy_ = (code: string, v: boolean) =>
    setBusy(prev => ({ ...prev, [code]: v }))

  const toggle = async (p: SimPrinter) => {
    setBusy_(p.printerCode, true)
    try {
      const action = p.isOnline ? 'disconnect' : 'connect'
      await fetch(`/api/printers/simulation-status/${encodeURIComponent(p.printerCode)}/${action}`, { method: 'POST' })
      await fetchStatus()
    } finally {
      setBusy_(p.printerCode, false)
    }
  }

  const setMode = async (p: SimPrinter, mode: string) => {
    setBusy_(p.printerCode + '_mode', true)
    try {
      await fetch(`/api/printers/simulation-status/${encodeURIComponent(p.printerCode)}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      await fetchStatus()
    } finally {
      setBusy_(p.printerCode + '_mode', false)
    }
  }

  if (loading) return (
    <div className="text-gray-500 text-xs italic py-2">Đang tải trạng thái máy in mô phỏng...</div>
  )

  if (printers.length === 0) return (
    <div className="text-gray-600 text-xs italic py-2">
      Không có máy in mô phỏng — đảm bảo printer-adapter đang chạy và có printers với driverType=simulation.
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pt-4 border-t border-gray-800">
        <span className="text-base">🖨</span>
        <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">
          Máy in mô phỏng ({printers.length})
        </h3>
        <span className="text-[10px] text-gray-600 ml-auto italic">
          Thay đổi phản ánh ngay trong Kiosk UI (≤3s)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {printers.map(p => (
          <div
            key={p.printerCode}
            className={`bg-gray-900 rounded-lg p-3 border flex flex-col gap-2 transition-all duration-300 ${
              p.isOnline
                ? 'border-amber-700/40 bg-amber-950/10'
                : 'border-gray-800 opacity-70'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-white text-sm">{p.displayName || p.printerCode}</div>
                <div className="text-[10px] text-gray-500 font-mono">:{p.port} · {p.printerCode}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  p.isOnline
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-gray-800 text-gray-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${p.isOnline ? 'bg-amber-400 animate-pulse' : 'bg-gray-600'}`} />
                  {p.isOnline ? 'Online' : 'Offline'}
                </span>
                <button
                  disabled={busy[p.printerCode]}
                  onClick={() => toggle(p)}
                  className={`text-[10px] px-2 py-0.5 rounded font-semibold text-white transition-colors disabled:opacity-40 ${
                    p.isOnline
                      ? 'bg-red-800 hover:bg-red-700'
                      : 'bg-green-800 hover:bg-green-700'
                  }`}
                >
                  {busy[p.printerCode] ? '…' : p.isOnline ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-500 shrink-0">Mode:</label>
              <select
                value={p.simulatorMode}
                disabled={busy[p.printerCode + '_mode']}
                onChange={e => setMode(p, e.target.value)}
                className="flex-1 text-[10px] bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-0.5 disabled:opacity-40 cursor-pointer"
              >
                {MODES.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="text-[10px] text-gray-600 font-mono">
              TCP listener: {p.isListening ? '✓ active' : '✗ stopped'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
