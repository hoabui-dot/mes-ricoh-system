import {
  useSimulator, usePrinterJobs, useLaserCommands,
  useVisionResults, useGatewayEvents, useConnections
} from './hooks/useSimulator'
import PrinterCard from './components/PrinterCard'
import LaserCard from './components/LaserCard'
import VisionCard from './components/VisionCard'
import PlcCard from './components/PlcCard'
import JobsPanel from './components/JobsPanel'
import ConnectionPanel from './components/ConnectionPanel'
import EnvPanel from './components/EnvPanel'
import GatewayConsole from './components/GatewayConsole'
import TestConsolePanel from './components/TestConsolePanel'
import ZebraLabelStudio from './components/ZebraLabelStudio'
import SimulationPrinterPanel from './components/SimulationPrinterPanel'
import { useState, useEffect, useRef } from 'react'
import type { ConfigValue } from './types'

type Tab = 'devices' | 'gateway' | 'jobs' | 'env' | 'tests' | 'label-studio'
type Lang = 'en' | 'vi'

const TAB_LABELS: Record<Tab, { en: string; vi: string }> = {
  devices:      { en: 'Virtual Devices',      vi: 'Thiết bị ảo' },
  gateway:      { en: 'Factory Gateway',      vi: 'Cổng nhà máy' },
  jobs:         { en: 'Production History',   vi: 'Lịch sử gia công' },
  env:          { en: 'Environment Config',   vi: 'Cấu hình môi trường' },
  tests:        { en: 'Test Console',         vi: 'Kiểm tra hệ thống' },
  'label-studio': { en: 'Zebra Label Studio', vi: 'Zebra Label Studio' },
}

export default function App() {
  const { status, timeline, connected } = useSimulator()
  const printerJobs = usePrinterJobs()
  const laserCmds = useLaserCommands()
  const visionResults = useVisionResults()
  const gatewayEvents = useGatewayEvents()
  const connections = useConnections()
  const [tab, setTab] = useState<Tab>('devices')
  const [lang, setLang] = useState<Lang>('en')
  const [configValues, setConfigValues] = useState<ConfigValue[]>([])
  const signalREventCountRef = useRef(0)
  const [signalREventCount, setSignalREventCount] = useState(0)

  // Track SignalR events for the test runner
  useEffect(() => {
    signalREventCountRef.current += 1
    setSignalREventCount(signalREventCountRef.current)
  }, [timeline])

  const fetchConfig = () => {
    fetch('/api/config')
      .then(r => r.json())
      .then(setConfigValues)
      .catch(console.error)
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const saveConfig = async (key: string, value: string) => {
    try {
      const response = await fetch(`/api/config/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      })
      if (!response.ok) {
        throw new Error(`Failed to update config ${key}`)
      }
      fetchConfig()
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  return (
    <div className="min-h-screen p-4 bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between mb-5 pb-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Device Simulator</h1>
          <p className="text-xs text-gray-500">
            {lang === 'en' ? 'Virtual factory environment — 5 devices auto-running' : 'Môi trường nhà máy ảo — 5 thiết bị tự động'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {/* Language toggle */}
          <div className="flex items-center bg-gray-900 border border-gray-800 rounded-full p-0.5 gap-0.5">
            <button
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${lang === 'en' ? 'bg-indigo-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('vi')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${lang === 'vi' ? 'bg-indigo-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              VI
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-full px-3 py-1">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-gray-400 font-mono">{connected ? 'SignalR Live' : 'Disconnected'}</span>
          </div>
          {status && (
            <div className="flex gap-1.5">
              {[
                { label: 'PRT', on: status.printer?.online ?? false },
                { label: 'LSR', on: status.laser.online },
                { label: 'VIS', on: status.vision.online },
                { label: 'PLC', on: status.plc.online },
                { label: 'GW', on: status.gateway.connected },
              ].map(d => (
                <span key={d.label} className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider transition-colors
                  ${d.on ? 'bg-green-950/80 text-green-400 border border-green-900' : 'bg-gray-900 text-gray-500 border border-gray-800'}`}>
                  {d.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="flex gap-4">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 space-y-4">
          <ConnectionPanel connections={connections} />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-800 overflow-x-auto">
            {(['devices', 'gateway', 'jobs', 'env', 'tests', 'label-studio'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-semibold rounded-t transition-all border-t border-x -mb-[1px] whitespace-nowrap
                  ${tab === t
                    ? 'bg-gray-900 text-white border-gray-800 border-b-gray-900'
                    : 'text-gray-500 hover:text-gray-300 border-transparent hover:bg-gray-900/50'}
                  ${t === 'tests' ? 'text-indigo-400 hover:text-indigo-300' : ''}
                  ${t === 'label-studio' ? 'text-yellow-400 hover:text-yellow-300' : ''}`}>
                {t === 'tests' ? '🧪 ' : t === 'label-studio' ? '🦓 ' : ''}
                {lang === 'en' ? TAB_LABELS[t].en : TAB_LABELS[t].vi}
              </button>
            ))}
          </div>

          {tab === 'devices' && status && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {status.printer && (
                  <PrinterCard state={status.printer} jobs={printerJobs} configValues={configValues} onSaveConfig={saveConfig} />
                )}
                <LaserCard state={status.laser} commands={laserCmds} configValues={configValues} onSaveConfig={saveConfig} />
                <VisionCard state={status.vision} results={visionResults} configValues={configValues} onSaveConfig={saveConfig} />
                <PlcCard state={status.plc} configValues={configValues} onSaveConfig={saveConfig} />
              </div>
              {/* Simulation printers — connects to printer-adapter VirtualPrinterSimulator */}
              <SimulationPrinterPanel />
            </div>
          )}

          {tab === 'gateway' && status && (
            <GatewayConsole state={status.gateway} events={gatewayEvents} configValues={configValues} onSaveConfig={saveConfig} />
          )}

          {tab === 'devices' && !status && (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm font-medium animate-pulse">
              {lang === 'en' ? 'Connecting to virtual devices…' : 'Đang kết nối thiết bị ảo…'}
            </div>
          )}

          {tab === 'jobs' && (
            <div>
              <JobsPanel />
            </div>
          )}

          {tab === 'env' && (
            <div className="max-w-2xl">
              <EnvPanel />
            </div>
          )}

          {tab === 'tests' && (
            <TestConsolePanel
              signalRConnected={connected}
              signalREventCount={signalREventCount}
              lang={lang}
            />
          )}

          {tab === 'label-studio' && (
            <ZebraLabelStudio />
          )}
        </main>
      </div>
    </div>
  )
}
