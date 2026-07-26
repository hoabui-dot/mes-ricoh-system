import { useState } from 'react'
import type { GatewayState, GatewayEvent, ConfigValue } from '../types'
import SimulatorDispatchDialog from './SimulatorDispatchDialog'
import type { DispatchConfig } from './SimulatorDispatchDialog'

interface Props {
  state: GatewayState
  events: GatewayEvent[]
  configValues: ConfigValue[]
  onSaveConfig: (key: string, value: string) => Promise<void>
}

interface JobDef {
  label: string
  url: string
  op: string
  desc: string
  hasPcs: boolean
  hasScenario: boolean
  payload: object
}

export default function GatewayConsole({ state, events, configValues, onSaveConfig }: Props) {
  const [publishing, setPublishing] = useState<string | null>(null)
  const [publishStatus, setPublishStatus] = useState<{
    [key: string]: { status: 'SUCCESS' | 'FAILED'; error?: string; time: string }
  }>({})
  const [expandedPayload, setExpandedPayload] = useState<string | null>(null)
  const [dispatchDialog, setDispatchDialog] = useState<{ job: JobDef } | null>(null)

  const [draftSite,   setDraftSite]   = useState(configValues.find(c => c.key === 'SITE_CODE')?.value ?? 'NMDDuongDuong')
  const [draftArea,   setDraftArea]   = useState(configValues.find(c => c.key === 'AREA_CODE')?.value ?? 'Assembly_Section')
  const [draftLine,   setDraftLine]   = useState(configValues.find(c => c.key === 'LINE_CODE')?.value ?? 'Chuyen03')
  const [draftEdgeId, setDraftEdgeId] = useState(configValues.find(c => c.key === 'EDGE_ID')?.value ?? 'edge-ipc-l3-marking')
  const [savingConfig, setSavingConfig] = useState(false)

  const site   = configValues.find(c => c.key === 'SITE_CODE')?.value ?? 'NMDDuongDuong'
  const area   = configValues.find(c => c.key === 'AREA_CODE')?.value ?? 'Assembly_Section'
  const line   = configValues.find(c => c.key === 'LINE_CODE')?.value ?? 'Chuyen03'
  const edgeId = configValues.find(c => c.key === 'EDGE_ID')?.value  ?? 'edge-ipc-l3-marking'

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      await onSaveConfig('SITE_CODE', draftSite)
      await onSaveConfig('AREA_CODE', draftArea)
      await onSaveConfig('LINE_CODE', draftLine)
      await onSaveConfig('EDGE_ID',   draftEdgeId)
    } finally {
      setSavingConfig(false)
    }
  }

  const triggerJob = async (
    url: string,
    label: string,
    cfg: DispatchConfig,
    hasPcs: boolean,
    hasScenario: boolean
  ) => {
    setPublishing(label)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario:       hasScenario ? cfg.scenario : undefined,
          pcs:            hasPcs ? cfg.pcs : undefined,
          dispatchTarget: cfg.target,
          station:        cfg.station,
          team:           cfg.team,
          notes:          cfg.notes,
        })
      })
      const nowStr = new Date().toLocaleTimeString()
      if (response.ok) {
        setPublishStatus(prev => ({ ...prev, [label]: { status: 'SUCCESS', time: nowStr } }))
      } else {
        const errData = await response.json().catch(() => ({}))
        setPublishStatus(prev => ({
          ...prev,
          [label]: { status: 'FAILED', error: (errData as any).error || `HTTP ${response.status}`, time: nowStr }
        }))
      }
    } catch (err: any) {
      setPublishStatus(prev => ({
        ...prev,
        [label]: { status: 'FAILED', error: err.message || 'Network error', time: new Date().toLocaleTimeString() }
      }))
    } finally {
      setPublishing(null)
    }
  }

  const jobs: JobDef[] = [
    {
      label: 'Print Job',
      url: '/api/gateway/send-print-job',
      op: 'PRINT_ONLY',
      desc: 'Print label with product info and scan verify',
      hasPcs: true,
      hasScenario: false,
      payload: {
        site, area, line, machine: 'Printer-01', edge_id: edgeId,
        data: [
          { tag: 'operation.type', value: 'PRINT_ONLY',       quality: 'GOOD' },
          { tag: 'print.type',     value: 'LABEL_PRINT',      quality: 'GOOD' },
          { tag: 'product.id',     value: 'FC-WP-RO100G-B-998822', quality: 'GOOD' },
          { tag: 'product.lot',    value: 'LOT-2026-06-A-001', quality: 'GOOD' },
          { tag: 'product.mfg_date', value: '2026-06-16',     quality: 'GOOD' },
          { tag: 'product.exp_date', value: '2028-06-16',     quality: 'GOOD' },
          { tag: 'dispatch_target',  value: '<selected at dispatch>', quality: 'GOOD' },
        ]
      }
    },
    {
      label: 'Mark Job',
      url: '/api/gateway/send-mark-job',
      op: 'MARK_ONLY',
      desc: 'Etch traceability marking directly on product packaging',
      hasPcs: false,
      hasScenario: true,
      payload: {
        site, area, line, machine: 'Laser-Marking-03', edge_id: edgeId,
        data: [
          { tag: 'operation.type', value: 'MARK_ONLY',     quality: 'GOOD' },
          { tag: 'marking.type',   value: 'LASER_ETCHING', quality: 'GOOD' },
          { tag: 'marking.serial', value: 'SN-0001234',    quality: 'GOOD' },
          { tag: 'marking.lot',    value: '2026-BATCH-A',  quality: 'GOOD' },
          { tag: 'marking.date_code', value: '260616',     quality: 'GOOD' },
          { tag: 'dispatch_target', value: '<selected at dispatch>', quality: 'GOOD' },
        ]
      }
    },
    {
      label: 'Print + Mark',
      url: '/api/gateway/send-print-mark-job',
      op: 'PRINT_AND_MARK',
      desc: 'Decompose combined print, mark, and visual verify steps',
      hasPcs: true,
      hasScenario: true,
      payload: {
        site, area, line, machine: 'Station-Combined-01', edge_id: edgeId,
        data: [
          { tag: 'operation.type', value: 'PRINT_AND_MARK',     quality: 'GOOD' },
          { tag: 'print.type',     value: 'PRODUCT_LABEL',      quality: 'GOOD' },
          { tag: 'marking.type',   value: 'LASER_SERIALIZATION', quality: 'GOOD' },
          { tag: 'product.id',     value: 'FC-WP-RO100G-B-998822', quality: 'GOOD' },
          { tag: 'product.lot',    value: 'LOT-2026-06-A-001',  quality: 'GOOD' },
          { tag: 'marking.serial', value: 'SN-0001234',         quality: 'GOOD' },
          { tag: 'dispatch_target', value: '<selected at dispatch>', quality: 'GOOD' },
        ]
      }
    }
  ]

  return (
    <div className="space-y-4">
      {/* ── Config & Identity ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* MQTT Connection Card */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">MQTT Connection</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${state.connected ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'}`}>
                {state.connected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              <div>Broker Host: <span className="font-mono text-gray-200">{state.brokerHost || 'localhost'}</span></div>
              <div>Broker Port: <span className="font-mono text-gray-200">{state.brokerPort || 1883}</span></div>
              <div>Subscribed Topic: <span className="font-mono text-purple-400">nd/+/+/command</span></div>
            </div>
            <button
              onClick={async () => {
                const endpoint = state.connected ? '/api/gateway/disconnect' : '/api/gateway/connect'
                await fetch(endpoint, { method: 'POST' })
              }}
              className={`w-full mt-3 rounded py-1 text-xs font-semibold text-white transition-colors ${state.connected ? 'bg-red-700 hover:bg-red-600' : 'bg-green-700 hover:bg-green-600'}`}
            >
              {state.connected ? 'Disconnect Broker' : 'Connect Broker'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 text-[10px]">
            <div className="bg-gray-800 rounded p-1.5 text-center">
              <div className="text-gray-500">Telemetry Outbound</div>
              <div className="text-blue-400 font-mono text-sm">{state.publishCount}</div>
            </div>
            <div className="bg-gray-800 rounded p-1.5 text-center">
              <div className="text-gray-500">Commands Inbound</div>
              <div className="text-purple-400 font-mono text-sm">{state.receiveCount}</div>
            </div>
          </div>
        </div>

        {/* Identity Config Card */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <h3 className="text-sm font-semibold text-white">Localhost Identity Config Env</h3>
            <span className="text-[10px] text-gray-500">Updates database configuration variables directly</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-gray-400 mb-1">Site Code (SITE_CODE)</label>
              <input value={draftSite} onChange={e => setDraftSite(e.target.value)} className="w-full bg-gray-850 border border-gray-750 rounded px-2.5 py-1 text-gray-200" />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Area Code (AREA_CODE)</label>
              <input value={draftArea} onChange={e => setDraftArea(e.target.value)} className="w-full bg-gray-850 border border-gray-750 rounded px-2.5 py-1 text-gray-200" />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Line Code (LINE_CODE)</label>
              <input value={draftLine} onChange={e => setDraftLine(e.target.value)} className="w-full bg-gray-850 border border-gray-750 rounded px-2.5 py-1 text-gray-200" />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Edge ID (EDGE_ID)</label>
              <input value={draftEdgeId} onChange={e => setDraftEdgeId(e.target.value)} className="w-full bg-gray-850 border border-gray-750 rounded px-2.5 py-1 text-gray-200 font-mono" />
            </div>
          </div>
          <button onClick={handleSaveConfig} disabled={savingConfig}
            className="w-full bg-blue-700 hover:bg-blue-600 text-white rounded py-1.5 text-xs font-semibold disabled:opacity-50 transition-colors">
            {savingConfig ? 'Saving Config Values...' : 'Update Direct Config Environment'}
          </button>
        </div>
      </div>

      {/* ── Pre-defined Job Triggers ──────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2">
          <h3 className="text-sm font-semibold text-white">Pre-defined Factory MQTT Job Triggers</h3>
          <span className="text-[10px] text-gray-500">Select dispatch target before triggering</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {jobs.map(job => (
            <div key={job.label} className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-200 text-xs">{job.label}</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-purple-300 font-mono">{job.op}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1 leading-normal">{job.desc}</div>

                {/* Tags preview */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {job.hasPcs && (
                    <span className="text-[9px] bg-indigo-950/50 text-indigo-300 border border-indigo-900 px-1.5 py-0.5 rounded font-mono">Batch PCS</span>
                  )}
                  {job.hasScenario && (
                    <span className="text-[9px] bg-cyan-950/50 text-cyan-300 border border-cyan-900 px-1.5 py-0.5 rounded font-mono">Vision Scenario</span>
                  )}
                  <span className="text-[9px] bg-amber-950/50 text-amber-300 border border-amber-900 px-1.5 py-0.5 rounded font-mono">Dispatch Target</span>
                </div>
              </div>

              {/* Publish status */}
              {publishStatus[job.label] && (
                <div className={`text-[10px] px-2 py-1.5 rounded flex items-center justify-between ${
                  publishStatus[job.label].status === 'SUCCESS' ? 'bg-green-950/30 text-green-300' : 'bg-red-950/30 text-red-300'
                }`}>
                  <span>
                    {publishStatus[job.label].status}
                    {publishStatus[job.label].error && (
                      <span className="ml-1 text-red-400">({publishStatus[job.label].error})</span>
                    )}
                  </span>
                  <span className="text-gray-500">{publishStatus[job.label].time}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setDispatchDialog({ job })}
                  disabled={publishing !== null || !state.connected}
                  className="flex-1 bg-purple-700 hover:bg-purple-600 text-white rounded py-1.5 text-xs font-semibold disabled:opacity-50 transition-colors"
                >
                  {publishing === job.label ? 'Publishing MQTT...' : `Trigger ${job.label}`}
                </button>
                <button
                  onClick={() => setExpandedPayload(expandedPayload === job.label ? null : job.label)}
                  className="bg-gray-900 hover:bg-gray-950 text-gray-400 rounded px-2.5 py-1.5 text-xs transition-colors"
                >
                  {expandedPayload === job.label ? 'Hide' : 'Payload'}
                </button>
              </div>

              {expandedPayload === job.label && (
                <pre className="bg-gray-950 rounded p-2 text-[10px] font-mono text-gray-400 overflow-auto max-h-40 leading-normal border border-gray-900">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── MQTT Event Log ────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2">
          <h3 className="text-sm font-semibold text-white">MQTT Event Log Stream</h3>
          <span className="text-xs text-gray-500 font-mono">Broker: localhost:1883</span>
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {events.map(evt => (
            <div key={evt.id} className="bg-gray-950 border border-gray-850 rounded p-2 text-xs flex flex-col space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                    evt.direction === 'PUBLISH' ? 'bg-blue-950 text-blue-400' : 'bg-purple-950 text-purple-400'
                  }`}>
                    {evt.direction === 'PUBLISH' ? '↑ OUTBOUND' : '↓ INBOUND'}
                  </span>
                  <span className="text-gray-300 font-mono truncate select-all">{evt.topic}</span>
                </div>
                <span className="text-gray-500 text-[10px] font-mono">{new Date(evt.occurredAt).toLocaleTimeString()}</span>
              </div>
              <pre className="text-[10px] text-gray-400 bg-gray-900 rounded p-1.5 font-mono overflow-x-auto select-all leading-normal">
                {JSON.stringify(JSON.parse(evt.payloadJson), null, 2)}
              </pre>
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-center py-6 text-gray-600 text-xs">
              No MQTT events transmitted yet. Trigger a job above to broadcast.
            </div>
          )}
        </div>
      </div>

      {/* ── Dispatch Dialog ──────────────────────────────────────────────── */}
      {dispatchDialog && (
        <SimulatorDispatchDialog
          open={true}
          jobLabel={dispatchDialog.job.label}
          jobOp={dispatchDialog.job.op}
          hasPcs={dispatchDialog.job.hasPcs}
          hasScenario={dispatchDialog.job.hasScenario}
          onClose={() => setDispatchDialog(null)}
          onConfirm={cfg => {
            const job = dispatchDialog.job
            setDispatchDialog(null)
            triggerJob(job.url, job.label, cfg, job.hasPcs, job.hasScenario)
          }}
        />
      )}
    </div>
  )
}
