import { useEffect, useState } from 'react'
import type { ConfigValue } from '../types'

export default function EnvPanel() {
  const [values, setValues] = useState<ConfigValue[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setValues)
  }, [])

  const handleSave = async (key: string) => {
    setSaving(true)
    await fetch(`/api/config/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: draft }),
    })
    setValues(prev => prev.map(v => v.key === key ? { ...v, value: draft } : v))
    setSaving(false)
    setEditing(null)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Environment / Config</h3>
      <div className="space-y-2 text-xs">
        {values.map(cfg => (
          <div key={cfg.key} className="flex items-center justify-between gap-2">
            <div>
              <div className="text-gray-300">{cfg.key}</div>
              {cfg.description && <div className="text-gray-600">{cfg.description}</div>}
            </div>
            {editing === cfg.key ? (
              <div className="flex gap-1">
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 w-32"
                />
                <button
                  onClick={() => handleSave(cfg.key)}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 rounded px-2 py-1 disabled:opacity-50"
                >
                  {saving ? '…' : 'OK'}
                </button>
                <button onClick={() => setEditing(null)} className="bg-gray-700 rounded px-2 py-1">
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <code className="text-green-400">{cfg.value}</code>
                {cfg.isEditable && (
                  <button
                    onClick={() => { setEditing(cfg.key); setDraft(cfg.value) }}
                    className="text-gray-500 hover:text-gray-300"
                  >
                    ✎
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {values.length === 0 && <div className="text-gray-600">Loading…</div>}
      </div>
    </div>
  )
}
