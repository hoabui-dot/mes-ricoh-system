import { useState } from 'react'
import type { GatewayState, GatewayEvent } from '../types'
import DeviceStatusBadge from './DeviceStatusBadge'

interface Props { state: GatewayState; events: GatewayEvent[] }

export default function GatewayCard({ state, events }: Props) {
  const [publishing, setPublishing] = useState(false)
  const [topic, setTopic] = useState('factory/events/simulator')
  const [tag, setTag] = useState('job.status')
  const [value, setValue] = useState('COMPLETED')

  const handlePublish = async () => {
    setPublishing(true)
    try {
      await fetch('/api/gateway/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          site: 'NMDDuongDuong',
          area: 'Assembly_Section',
          line: 'Chuyen03',
          machine: 'SIMULATOR-01',
          edgeId: 'edge-ipc-l3-marking',
          data: [{ tag, value, quality: 'GOOD' }]
        })
      })
    } finally {
      setPublishing(false)
    }
  }

  const sendJob = async (url: string) => {
    let body: any = undefined;
    if (url === '/api/gateway/send-print-job') {
      const input = window.prompt("Nhập số lượng sản phẩm cần in (pcs):", "100");
      if (input === null) return; // User cancelled
      const pcs = parseInt(input, 10);
      if (isNaN(pcs) || pcs <= 0) {
        window.alert("Số lượng sản phẩm phải lớn hơn 0!");
        return;
      }
      body = { pcs };
    }

    setPublishing(true)
    try {
      await fetch(url, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      })
    } catch (err) {
      console.error(err)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">📡</span>
          <div>
            <div className="font-semibold text-white">Factory Gateway</div>
            <div className="text-xs text-gray-500">
              MQTT {state.brokerHost ?? '—'}:{state.brokerPort}
            </div>
          </div>
        </div>
        <DeviceStatusBadge online={state.connected} label={state.connected ? 'CONNECTED' : 'DISCONNECTED'} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800 rounded p-2">
          <div className="text-gray-400">Published</div>
          <div className="text-blue-400 font-mono">{state.publishCount}</div>
        </div>
        <div className="bg-gray-800 rounded p-2">
          <div className="text-gray-400">Received</div>
          <div className="text-purple-400 font-mono">{state.receiveCount}</div>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <input value={topic} onChange={e => setTopic(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 font-mono"
          placeholder="Topic" />
        <div className="flex gap-1">
          <input value={tag} onChange={e => setTag(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 font-mono"
            placeholder="tag" />
          <input value={value} onChange={e => setValue(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 font-mono"
            placeholder="value" />
        </div>
        <button onClick={handlePublish} disabled={publishing || !state.connected}
          className="w-full bg-purple-700 hover:bg-purple-600 text-white rounded px-2 py-1 disabled:opacity-50">
          {publishing ? 'Publishing…' : 'Publish Event'}
        </button>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-gray-800">
        <div className="text-[10px] font-bold text-gray-500 tracking-wider uppercase">Pre-defined Factory Jobs</div>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <button onClick={() => sendJob('/api/gateway/send-print-job')} disabled={publishing || !state.connected}
            className="bg-indigo-700 hover:bg-indigo-600 text-white rounded px-1.5 py-1 text-center truncate disabled:opacity-50 font-medium transition-colors">
            Send Print Job
          </button>
          <button onClick={() => sendJob('/api/gateway/send-mark-job')} disabled={publishing || !state.connected}
            className="bg-emerald-700 hover:bg-emerald-600 text-white rounded px-1.5 py-1 text-center truncate disabled:opacity-50 font-medium transition-colors">
            Send Mark Job
          </button>
          <button onClick={() => sendJob('/api/gateway/send-print-mark-job')} disabled={publishing || !state.connected}
            className="bg-blue-700 hover:bg-blue-600 text-white rounded px-1.5 py-1 text-center truncate disabled:opacity-50 font-medium transition-colors">
            Send Print+Mark
          </button>
          <button onClick={() => sendJob('/api/gateway/send-verify-job')} disabled={publishing || !state.connected}
            className="bg-amber-700 hover:bg-amber-600 text-white rounded px-1.5 py-1 text-center truncate disabled:opacity-50 font-medium transition-colors">
            Send Verify Job
          </button>
        </div>
      </div>

      {events.length > 0 && (
        <div className="space-y-1 max-h-24 overflow-auto">
          {events.slice(0, 4).map(e => (
            <div key={e.id} className="flex items-center justify-between text-xs gap-2">
              <span className={e.direction === 'PUBLISH' ? 'text-blue-400' : 'text-purple-400'}>
                {e.direction === 'PUBLISH' ? '↑' : '↓'} {e.direction}
              </span>
              <span className="text-gray-400 truncate flex-1">{e.topic}</span>
              <span className="text-gray-600">{new Date(e.occurredAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
