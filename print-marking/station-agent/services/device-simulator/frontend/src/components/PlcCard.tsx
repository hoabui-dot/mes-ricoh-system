import { useState, useEffect } from 'react'
import type { PlcState, ConfigValue } from '../types'
import DeviceStatusBadge from './DeviceStatusBadge'

interface Props {
  state: PlcState
  configValues: ConfigValue[]
  onSaveConfig: (key: string, value: string) => Promise<void>
}

const REGISTER_LABELS: Record<string, string> = {
  START_BUTTON: 'Start',
  STOP_BUTTON: 'Stop',
  SENSOR_IN: 'Sensor IN',
  SENSOR_OUT: 'Sensor OUT',
  MACHINE_READY: 'Machine Ready'
}

export default function PlcCard({ state }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3 flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙</span>
            <div>
              <div className="font-semibold text-white">Virtual PLC</div>
              <div className="text-xs text-gray-500">Modbus TCP :{state.port}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={async () => {
              const endpoint = state.online ? '/api/plc/disconnect' : '/api/plc/connect';
              await fetch(endpoint, { method: 'POST' });
            }} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold text-white transition-colors ${state.online ? 'bg-red-700 hover:bg-red-600' : 'bg-green-700 hover:bg-green-600'}`}>
              {state.online ? 'Disconnect' : 'Connect'}
            </button>
            <DeviceStatusBadge online={state.online} />
          </div>
        </div>

        <div className="bg-gray-850 rounded p-3">
          <div className="text-xs text-gray-400 mb-2.5 font-semibold">Registers</div>
          <div className="space-y-2">
            {Object.entries(state.registers).map(([name, value]) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <span className="text-gray-300 font-medium">{REGISTER_LABELS[name] ?? name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider ${value ? 'bg-green-950 text-green-400 border border-green-900' : 'bg-gray-900 text-gray-500 border border-gray-800'}`}>
                  {value ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-800 mt-2 font-mono">
        <span>Events: <span className="font-mono text-gray-400">{state.eventCount}</span></span>
        {state.lastEventAt && (
          <span>Last: {new Date(state.lastEventAt).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  )
}
