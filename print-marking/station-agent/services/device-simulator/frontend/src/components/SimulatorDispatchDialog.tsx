import { useState } from 'react'

export type DispatchTarget = 'simulation'
export type VisionScenario = 'success'

export interface DispatchConfig {
  target: DispatchTarget
  pcs: number
  scenario: VisionScenario
  station: string
  team: string
  notes: string
}

interface Props {
  open: boolean
  jobLabel: string        // "Print Job" | "Mark Job" | "Print + Mark"
  jobOp: string           // "PRINT_ONLY" | "MARK_ONLY" | "PRINT_AND_MARK"
  hasPcs: boolean
  hasScenario: boolean
  onClose: () => void
  onConfirm: (cfg: DispatchConfig) => void
}

export default function SimulatorDispatchDialog({ open, jobLabel, jobOp, hasPcs, onClose, onConfirm }: Props) {
  const [pcs, setPcs] = useState(10)

  if (!open) return null

  const handleConfirm = () => {
    onConfirm({
      target: 'simulation',
      pcs: pcs,
      scenario: 'success',
      station: 'STATION-01',
      team: 'Team A',
      notes: 'Dispatched from Device Simulator'
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-bold text-white">🚀 Dispatch Job</h2>
            <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
              {jobLabel} · <span className="text-purple-400">{jobOp}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none transition-colors">✕</button>
        </div>

        {/* PCS Input */}
        {hasPcs ? (
          <div className="space-y-1">
            <label className="block text-xs text-gray-400 font-semibold">Production Quantity (PCS)</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={pcs}
              onChange={e => setPcs(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-indigo-500 focus:outline-none"
            />
            <div className="text-[10px] text-gray-500">
              Quantity of items to generate for print marking.
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Trigger simulated print job execution.</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors"
          >
            🚀 Dispatch {hasPcs ? `${pcs} PCS` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
