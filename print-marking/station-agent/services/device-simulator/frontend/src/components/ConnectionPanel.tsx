import type { ConnectionStatus } from '../types'

interface Props {
  connections: ConnectionStatus[]
}

const STATUS_COLOR: Record<string, string> = {
  GREEN: 'bg-green-500',
  YELLOW: 'bg-yellow-400',
  RED: 'bg-red-500',
}

export default function ConnectionPanel({ connections }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">System Connections</h3>
      <div className="space-y-2">
        {connections.map(c => (
          <div key={c.connectionName} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[c.status] ?? 'bg-gray-500'}`} />
              <span className="text-gray-300 font-medium">{c.connectionName}</span>
            </div>
            <div className="text-right text-gray-500">
              {c.detail && <div className="text-red-400">{c.detail.slice(0, 50)}</div>}
              <div>{new Date(c.checkedAt).toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
        {connections.length === 0 && (
          <div className="text-gray-600 text-xs">Checking connections…</div>
        )}
      </div>
    </div>
  )
}
