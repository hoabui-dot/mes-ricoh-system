import React, { useState, useEffect, useRef } from 'react'
import type { LabelTemplate } from '../../types/label'

const API_BASE = '/api'

interface Props {
  onOpenDesigner: (template: LabelTemplate) => void
  onOpenPreview: (template: LabelTemplate) => void
}

export default function TemplatesPanel({ onOpenDesigner, onOpenPreview }: Props) {
  const [templates, setTemplates] = useState<LabelTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dpiFilter, setDpiFilter] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Create form state
  const [form, setForm] = useState({
    name: '', description: '', dpi: 203, labelWidth: 100, labelHeight: 50
  })

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (dpiFilter) params.set('dpi', dpiFilter)
      const res = await fetch(`${API_BASE}/label-templates?${params}`)
      const data = await res.json()
      setTemplates(data)
    } catch (e) {
      console.error('Failed to load templates', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTemplates() }, [search, dpiFilter])

  const handleCreate = async () => {
    const emptyDoc = JSON.stringify({
      width: form.labelWidth, height: form.labelHeight, dpi: form.dpi, elements: []
    })
    try {
      const res = await fetch(`${API_BASE}/label-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, templateJson: emptyDoc })
      })
      if (res.ok) {
        setShowCreateModal(false)
        setForm({ name: '', description: '', dpi: 203, labelWidth: 100, labelHeight: 50 })
        loadTemplates()
      }
    } catch (e) { console.error(e) }
  }

  const handleDuplicate = async (id: string) => {
    await fetch(`${API_BASE}/label-templates/${id}/duplicate`, { method: 'POST' })
    loadTemplates()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return
    await fetch(`${API_BASE}/label-templates/${id}`, { method: 'DELETE' })
    loadTemplates()
  }

  const handleExport = (template: LabelTemplate) => {
    const blob = new Blob([template.templateJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template.name.replace(/\s+/g, '_')}_v${template.version}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const json = JSON.parse(text)

      // Normalize canvas dimensions
      let width = json.width;
      let height = json.height;
      let dpi = json.dpi;
      if (json.label && typeof json.label === 'object') {
        width = width ?? json.label.width;
        height = height ?? json.label.height;
        dpi = dpi ?? json.label.dpi;
      }
      width = width ?? 100;
      height = height ?? 50;
      dpi = dpi ?? 203;

      // Normalize elements
      const rawElements = json.elements ?? [];
      const normalizedElements = rawElements.map((el: any, index: number) => {
        const type = el.type ?? 'text';
        const x = typeof el.x === 'number' ? el.x : 20;
        const y = typeof el.y === 'number' ? el.y : 20;
        const rotation = typeof el.rotation === 'number' ? el.rotation : 0;
        const layer = typeof el.layer === 'number' ? el.layer : index;

        let font = 'Arial';
        let fontSize = 16;
        if (el.font) {
          if (typeof el.font === 'string') {
            font = el.font;
          } else if (typeof el.font === 'object') {
            font = el.font.family ?? 'Arial';
            fontSize = el.font.height ?? el.font.width ?? 16;
          }
        }
        if (typeof el.fontSize === 'number') {
          fontSize = el.fontSize;
        }

        let defaultWidth = 100;
        let defaultHeight = 30;
        if (type === 'barcode') {
          defaultWidth = 200;
          defaultHeight = 80;
        } else if (type === 'qr') {
          defaultWidth = 80;
          defaultHeight = 80;
        } else if (type === 'circle') {
          defaultWidth = 60;
          defaultHeight = 60;
        }

        const widthVal = el.width ?? defaultWidth;
        const heightVal = el.height ?? defaultHeight;

        const textVal = el.text ?? el.defaultValue ?? el.value ?? '';
        const binding = el.binding ?? '';

        return {
          ...el,
          id: el.id ?? `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type,
          x,
          y,
          width: widthVal,
          height: heightVal,
          rotation,
          layer,
          font,
          fontSize,
          text: textVal,
          binding
        };
      });

      const normalizedJson = {
        width,
        height,
        dpi,
        elements: normalizedElements
      };

      const name = file.name.replace('.json', '').replace(/_/g, ' ')
      const res = await fetch(`${API_BASE}/label-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: json.name ?? name,
          description: json.description ?? '',
          dpi,
          labelWidth: width,
          labelHeight: height,
          templateJson: JSON.stringify(normalizedJson)
        })
      })
      if (res.ok) loadTemplates()
    } catch (e) { alert('Invalid JSON file') }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-48"
        />
        <select
          value={dpiFilter}
          onChange={e => setDpiFilter(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All DPI</option>
          <option value="203">203 DPI</option>
          <option value="300">300 DPI</option>
          <option value="600">600 DPI</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <label className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded cursor-pointer transition
            ${importing ? 'bg-gray-800 text-gray-500' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
            {importing ? '⏳ Importing...' : '📥 Import JSON'}
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-700 hover:bg-indigo-600 text-white rounded transition"
          >
            ＋ New Template
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500 text-sm animate-pulse">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
          <span className="text-4xl">📋</span>
          <p className="text-sm">No templates yet. Create your first label template.</p>
          <button onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 text-xs font-semibold bg-indigo-700 hover:bg-indigo-600 text-white rounded transition">
            ＋ Create Template
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900 text-gray-500 uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left">Name</th>
                <th className="px-3 py-2.5 text-left">Description</th>
                <th className="px-3 py-2.5 text-center">DPI</th>
                <th className="px-3 py-2.5 text-center">Size (mm)</th>
                <th className="px-3 py-2.5 text-center">Version</th>
                <th className="px-3 py-2.5 text-left">Modified</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t, i) => (
                <tr key={t.id}
                  className={`border-t border-gray-800 hover:bg-gray-900/60 transition-colors ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-950/50'}`}
                >
                  <td className="px-3 py-2.5">
                    <span className="font-semibold text-white">{t.name}</span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 max-w-[180px] truncate">{t.description ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 font-mono">{t.dpi}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-400 font-mono">
                    {t.labelWidth}×{t.labelHeight}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="px-1.5 py-0.5 bg-indigo-900/40 border border-indigo-800/50 rounded text-indigo-400 font-mono text-[10px]">v{t.version}</span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono text-[10px]">
                    {new Date(t.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => onOpenDesigner(t)}
                        title="Open in Designer"
                        className="px-2 py-1 text-[10px] bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 rounded transition">
                        🎨 Design
                      </button>
                      <button onClick={() => onOpenPreview(t)}
                        title="Preview & Print"
                        className="px-2 py-1 text-[10px] bg-green-900/50 hover:bg-green-800 text-green-300 rounded transition">
                        👁 Preview
                      </button>
                      <button onClick={() => handleDuplicate(t.id)}
                        title="Duplicate"
                        className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition">
                        ⎘
                      </button>
                      <button onClick={() => handleExport(t)}
                        title="Export JSON"
                        className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition">
                        ↓
                      </button>
                      <button onClick={() => handleDelete(t.id, t.name)}
                        title="Delete"
                        className="px-2 py-1 text-[10px] bg-red-900/40 hover:bg-red-800/60 text-red-400 rounded transition">
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[420px] shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-4">New Label Template</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] text-gray-400 mb-1 block">Template Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Shipping Label"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 mb-1 block">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[11px] text-gray-400 mb-1 block">Printer DPI</label>
                  <select value={form.dpi} onChange={e => setForm(f => ({ ...f, dpi: +e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500">
                    <option value={203}>203 DPI</option>
                    <option value={300}>300 DPI</option>
                    <option value={600}>600 DPI</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-gray-400 mb-1 block">Width (mm)</label>
                  <input type="number" value={form.labelWidth} onChange={e => setForm(f => ({ ...f, labelWidth: +e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-gray-400 mb-1 block">Height (mm)</label>
                  <input type="number" value={form.labelHeight} onChange={e => setForm(f => ({ ...f, labelHeight: +e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={!form.name.trim()}
                className="flex-1 py-2 text-xs font-semibold bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white rounded transition">
                Create Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
