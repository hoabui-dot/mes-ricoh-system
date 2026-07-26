import { useState, useEffect } from 'react'
import type { VisionState, VisionResult, ConfigValue } from '../types'
import DeviceStatusBadge from './DeviceStatusBadge'

interface Props {
  state: VisionState
  results: VisionResult[]
  configValues: ConfigValue[]
  onSaveConfig: (key: string, value: string) => Promise<void>
}

export default function VisionCard({ state, results }: Props) {
  const lastResult = results[0] || null;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3 flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📷</span>
            <div>
              <div className="font-semibold text-white">Virtual Vision</div>
              <div className="text-xs text-gray-500">OCR / Barcode inspection</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={async () => {
              const endpoint = state.online ? '/api/vision/disconnect' : '/api/vision/connect';
              await fetch(endpoint, { method: 'POST' });
            }} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold text-white transition-colors ${state.online ? 'bg-red-700 hover:bg-red-600' : 'bg-green-700 hover:bg-green-600'}`}>
              {state.online ? 'Disconnect' : 'Connect'}
            </button>
            <DeviceStatusBadge online={state.online} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-gray-850 rounded p-2">
            <div className="text-gray-400">Requests</div>
            <div className="text-white font-mono">{state.requestCount}</div>
          </div>
          <div className="bg-gray-850 rounded p-2">
            <div className="text-gray-400">Pass rate</div>
            <div className="text-green-400 font-medium">{state.passRate}%</div>
          </div>
          <div className="bg-gray-850 rounded p-2">
            <div className="text-gray-400">Fail rate</div>
            <div className="text-red-400 font-medium">{state.failureRate}%</div>
          </div>
        </div>

        {lastResult && (
          <div className={`text-xs rounded p-2 ${lastResult.result === 'PASS' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
            <span className="font-semibold">{lastResult.result}</span>
            {lastResult.defectCode && <span className="ml-2 text-red-400">({lastResult.defectCode})</span>}
            {lastResult.ocrText && <span className="ml-2 text-gray-300 truncate max-w-[150px] inline-block align-bottom font-mono">OCR: {lastResult.ocrText}</span>}
            {lastResult.confidence !== null && <span className="ml-2 text-gray-400 font-mono">{(lastResult.confidence * 100).toFixed(1)}%</span>}
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-auto pt-2 border-t border-gray-800 mt-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Recent results</div>
          {results.slice(0, 4).map(r => (
            <div key={r.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-400 font-mono truncate max-w-20">{r.jobId}</span>
              <span className={r.result === 'PASS' ? 'text-green-400' : 'text-red-400'}>{r.result}</span>
              {r.defectCode && <span className="text-orange-400 font-mono text-[10px]">{r.defectCode}</span>}
              <span className="text-gray-500 font-mono">{r.durationMs}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
