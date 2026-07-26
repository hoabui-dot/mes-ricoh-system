import { useState, useEffect } from 'react'
import type { LaserState, LaserCommand, ConfigValue } from '../types'
import DeviceStatusBadge from './DeviceStatusBadge'

interface Props {
  state: LaserState
  commands: LaserCommand[]
  configValues: ConfigValue[]
  onSaveConfig: (key: string, value: string) => Promise<void>
}

export default function LaserCard({ state, commands }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3 flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <div className="font-semibold text-white">Virtual Laser</div>
              <div className="text-xs text-gray-500">TCP :{state.port} · MARK protocol</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={async () => {
              const endpoint = state.online ? '/api/laser/disconnect' : '/api/laser/connect';
              await fetch(endpoint, { method: 'POST' });
            }} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold text-white transition-colors ${state.online ? 'bg-red-700 hover:bg-red-600' : 'bg-green-700 hover:bg-green-600'}`}>
              {state.online ? 'Disconnect' : 'Connect'}
            </button>
            <DeviceStatusBadge online={state.online} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-850 rounded p-2">
            <div className="text-gray-400">Commands</div>
            <div className="text-white font-mono text-lg">{state.commandCount}</div>
          </div>
          <div className="bg-gray-850 rounded p-2">
            <div className="text-gray-400">Last result</div>
            <div className={`font-medium ${state.lastResult === 'SUCCESS' ? 'text-green-400' : state.lastResult === 'FAILED' ? 'text-red-400' : 'text-gray-500'}`}>
              {state.lastResult ?? '—'}
            </div>
          </div>
        </div>

        {state.lastCommand && (
          <div className="text-xs text-gray-400 bg-gray-850 rounded p-2 font-mono truncate">
            {state.lastCommand}
          </div>
        )}
      </div>

      {commands.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-auto pt-2 border-t border-gray-800 mt-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Recent</div>
          {commands.slice(0, 5).map(c => (
            <div key={c.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-300 truncate max-w-24">{c.rawCommand}</span>
              <span className={c.status === 'SUCCESS' ? 'text-green-400' : 'text-red-400'}>{c.status}</span>
              <span className="text-gray-500">{c.durationMs}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
