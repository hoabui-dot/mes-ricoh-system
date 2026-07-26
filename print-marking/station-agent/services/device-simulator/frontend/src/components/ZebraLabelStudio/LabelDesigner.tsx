import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { LabelTemplate, DesignerElement, ElementType, TextElement, BarcodeElement, QrElement } from '../../types/label'
import { useLabelDesignerStore } from '../../store/labelDesignerStore'

// ── Canvas rendering (pure canvas, no Konva dependency required) ──────────────

interface Props {
  template: LabelTemplate | null
}

type PropsPanel = {
  element: DesignerElement
  onUpdate: (id: string, changes: Partial<DesignerElement>) => void
}

function PropertiesPanel({ element, onUpdate }: PropsPanel) {
  const [localEl, setLocalEl] = useState(element)
  useEffect(() => setLocalEl(element), [element])

  const update = (field: string, value: any) => {
    const changes = { [field]: value }
    setLocalEl(prev => ({ ...prev, ...changes } as DesignerElement))
    onUpdate(element.id, changes)
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Element Properties</div>

      {/* Position & Size */}
      <div className="grid grid-cols-2 gap-2">
        {[['x', 'X'], ['y', 'Y'], ['width', 'W'], ['height', 'H']].map(([field, label]) => (
          <div key={field}>
            <label className="text-gray-500 block mb-0.5">{label}</label>
            <input type="number" value={(localEl as any)[field] ?? 0}
              onChange={e => update(field, parseFloat(e.target.value) || 0)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-indigo-500 text-xs" />
          </div>
        ))}
      </div>

      {/* Rotation */}
      <div>
        <label className="text-gray-500 block mb-0.5">Rotation (°)</label>
        <input type="number" value={localEl.rotation}
          onChange={e => update('rotation', parseFloat(e.target.value) || 0)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-indigo-500 text-xs" />
      </div>

      {/* Binding Field */}
      <div>
        <label className="text-gray-500 block mb-0.5">Binding Field</label>
        <input value={localEl.binding ?? ''}
          onChange={e => update('binding', e.target.value)}
          placeholder="e.g. ProductName"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-indigo-500 text-xs" />
      </div>

      {/* Text-specific */}
      {element.type === 'text' && (
        <>
          <div>
            <label className="text-gray-500 block mb-0.5">Static Text</label>
            <input value={(localEl as TextElement).text ?? ''}
              onChange={e => update('text', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-indigo-500 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-gray-500 block mb-0.5">Font</label>
              <select value={(localEl as TextElement).font}
                onChange={e => update('font', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none">
                <option>Arial</option>
                <option>Roboto</option>
                <option>Noto Sans</option>
              </select>
            </div>
            <div>
              <label className="text-gray-500 block mb-0.5">Font Size</label>
              <input type="number" value={(localEl as TextElement).fontSize}
                onChange={e => update('fontSize', parseFloat(e.target.value) || 12)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-indigo-500 text-xs" />
            </div>
          </div>
        </>
      )}

      {/* Barcode-specific */}
      {element.type === 'barcode' && (
        <div>
          <label className="text-gray-500 block mb-0.5">Barcode Type</label>
          <select value={(localEl as BarcodeElement).symbology}
            onChange={e => update('symbology', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none">
            <option>Code128</option>
            <option>Code39</option>
            <option>EAN13</option>
            <option>UPCA</option>
            <option>EAN8</option>
            <option>ITF</option>
          </select>
        </div>
      )}

      {/* QR-specific */}
      {element.type === 'qr' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-gray-500 block mb-0.5">Error Correction</label>
            <select value={(localEl as QrElement).errorCorrection}
              onChange={e => update('errorCorrection', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none">
              <option value="L">L (7%)</option>
              <option value="M">M (15%)</option>
              <option value="Q">Q (25%)</option>
              <option value="H">H (30%)</option>
            </select>
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">Magnification</label>
            <input type="number" min={1} max={10} value={(localEl as QrElement).magnification}
              onChange={e => update('magnification', parseInt(e.target.value) || 4)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-indigo-500 text-xs" />
          </div>
        </div>
      )}

      {/* Layer */}
      <div>
        <label className="text-gray-500 block mb-0.5">Layer</label>
        <span className="text-gray-300 font-mono">{localEl.layer}</span>
      </div>
    </div>
  )
}

// ── Simple canvas-based designer ──────────────────────────────────────────────

function DesignerCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { elements, selectedIds, zoom, snapToGrid, gridSize, canvasWidth, canvasHeight,
    setSelected, updateElement } = useLabelDesignerStore()

  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null)

  const snap = (v: number) => snapToGrid ? Math.round(v / gridSize) * gridSize : v

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvasWidth * zoom
    const h = canvasHeight * zoom
    canvas.width = w
    canvas.height = h

    ctx.clearRect(0, 0, w, h)

    // Background (label surface)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, w, h)

    // Grid
    if (snapToGrid) {
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 0.5
      const step = gridSize * zoom
      for (let x = step; x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
      for (let y = step; y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }
    }

    // Elements
    elements.slice().sort((a: DesignerElement, b: DesignerElement) => a.layer - b.layer).forEach((el: DesignerElement) => {
      const x = el.x * zoom
      const y = el.y * zoom
      const ew = el.width * zoom
      const eh = el.height * zoom
      const isSelected = selectedIds.includes(el.id)

      ctx.save()
      ctx.translate(x + ew / 2, y + eh / 2)
      ctx.rotate((el.rotation * Math.PI) / 180)
      ctx.translate(-(ew / 2), -(eh / 2))

      if (el.type === 'text') {
        const te = el as TextElement
        const fs = (te.fontSize ?? 16) * zoom
        ctx.font = `${fs}px ${te.font || 'Arial'}`
        ctx.fillStyle = '#111827'
        ctx.fillText(te.binding ? `{${te.binding}}` : (te.text || 'Text'), 0, fs)
      } else if (el.type === 'barcode') {
        ctx.fillStyle = '#111827'
        ctx.fillRect(0, 0, ew, eh * 0.8)
        ctx.fillStyle = '#6b7280'
        ctx.font = `${10 * zoom}px monospace`
        ctx.fillText('BARCODE', 4 * zoom, eh)
      } else if (el.type === 'qr') {
        ctx.fillStyle = '#111827'
        ctx.fillRect(0, 0, ew, eh)
        ctx.fillStyle = '#ffffff'
        const cell = Math.max(2, ew / 7)
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          if ((r + c) % 2 === 0) ctx.fillRect(cell * c + 2, cell * r + 2, cell - 2, cell - 2)
        }
        ctx.fillStyle = '#6b7280'
        ctx.font = `${8 * zoom}px monospace`
        ctx.fillText('QR', ew * 0.35, eh * 0.85)
      } else if (el.type === 'rect') {
        ctx.strokeStyle = (el as any).stroke ?? '#374151'
        ctx.lineWidth = ((el as any).strokeWidth ?? 2) * zoom
        ctx.fillStyle = (el as any).fill ?? 'transparent'
        ctx.beginPath()
        ctx.rect(0, 0, ew, eh)
        ctx.fill()
        ctx.stroke()
      } else if (el.type === 'circle') {
        ctx.strokeStyle = (el as any).stroke ?? '#374151'
        ctx.lineWidth = ((el as any).strokeWidth ?? 2) * zoom
        ctx.fillStyle = (el as any).fill ?? 'transparent'
        ctx.beginPath()
        ctx.ellipse(ew / 2, eh / 2, ew / 2, eh / 2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      } else if (el.type === 'line') {
        ctx.strokeStyle = (el as any).stroke ?? '#374151'
        ctx.lineWidth = ((el as any).strokeWidth ?? 2) * zoom
        ctx.beginPath()
        ctx.moveTo(0, eh / 2)
        ctx.lineTo(ew, eh / 2)
        ctx.stroke()
      }

      // Selection outline
      if (isSelected) {
        ctx.strokeStyle = '#6366f1'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 2])
        ctx.strokeRect(-2, -2, ew + 4, eh + 4)
        ctx.setLineDash([])
        // Resize handle
        ctx.fillStyle = '#6366f1'
        ctx.fillRect(ew - 4, eh - 4, 8, 8)
      }
      ctx.restore()
    })
  }, [elements, selectedIds, zoom, snapToGrid, gridSize, canvasWidth, canvasHeight])

  const getElAt = (cx: number, cy: number): DesignerElement | null => {
    const x = cx / zoom
    const y = cy / zoom
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      if (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height)
        return el
    }
    return null
  }

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const el = getElAt(cx, cy)
    if (el) {
      setSelected([el.id])
      setDragging({ id: el.id, startX: cx, startY: cy, elX: el.x, elY: el.y })
    } else {
      setSelected([])
    }
  }

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const dx = (cx - dragging.startX) / zoom
    const dy = (cy - dragging.startY) / zoom
    updateElement(dragging.id, { x: snap(dragging.elX + dx), y: snap(dragging.elY + dy) })
  }

  const onMouseUp = () => setDragging(null)

  return (
    <canvas
      ref={canvasRef}
      className="border border-gray-700 rounded cursor-crosshair shadow-lg"
      style={{ display: 'block', background: '#f9fafb' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    />
  )
}

// ── Main Designer Component ───────────────────────────────────────────────────

const ELEMENT_TYPES: Array<{ type: ElementType; label: string; icon: string }> = [
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'barcode', label: 'Barcode', icon: '▌▌' },
  { type: 'qr', label: 'QR Code', icon: '⬛' },
  { type: 'rect', label: 'Rectangle', icon: '▭' },
  { type: 'circle', label: 'Circle', icon: '○' },
  { type: 'line', label: 'Line', icon: '─' },
  { type: 'image', label: 'Image', icon: '🖼' },
]

export default function LabelDesigner({ template }: Props) {
  const store = useLabelDesignerStore()

  useEffect(() => {
    store.setActiveTemplate(template)
  }, [template?.id])

  const selectedEl = store.selectedIds.length === 1
    ? store.elements.find(el => el.id === store.selectedIds[0]) ?? null
    : null

  const handleSave = async () => {
    if (!template) return
    const templateJson = store.getTemplateJson()
    try {
      const res = await fetch(`/api/label-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          dpi: template.dpi,
          labelWidth: template.labelWidth,
          labelHeight: template.labelHeight,
          templateJson
        })
      })
      if (res.ok) store.markClean()
      else alert('Failed to save template')
    } catch (e) {
      alert('Error saving template')
    }
  }

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <span className="text-4xl">🎨</span>
        <p className="text-sm">Select a template from the Templates tab to start designing.</p>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-full" style={{ minHeight: '600px' }}>
      {/* Left: Element Toolbar */}
      <div className="w-28 shrink-0 flex flex-col gap-1">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Add Element</div>
        {ELEMENT_TYPES.map(et => (
          <button key={et.type}
            onClick={() => store.addElement(et.type)}
            className="flex flex-col items-center gap-0.5 p-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-indigo-700 rounded text-xs text-gray-400 hover:text-white transition"
          >
            <span className="text-lg leading-none">{et.icon}</span>
            <span className="text-[10px]">{et.label}</span>
          </button>
        ))}

        <div className="mt-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Align</div>
        {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map(a => (
          <button key={a}
            onClick={() => store.alignSelected(a)}
            disabled={store.selectedIds.length < 2}
            className="py-1 px-2 text-[10px] bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded text-gray-500 hover:text-white transition disabled:opacity-30 capitalize">
            {a}
          </button>
        ))}
      </div>

      {/* Center: Canvas area */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        {/* Canvas toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Zoom:</span>
          <button onClick={() => store.setZoom(store.zoom - 0.25)} className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300">−</button>
          <span className="text-xs text-gray-300 font-mono w-10 text-center">{Math.round(store.zoom * 100)}%</span>
          <button onClick={() => store.setZoom(store.zoom + 0.25)} className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300">＋</button>
          <button onClick={() => store.setZoom(1)} className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300">1:1</button>

          <div className="flex items-center gap-1.5 ml-2">
            <input type="checkbox" id="snap" checked={store.snapToGrid} onChange={e => store.setSnapToGrid(e.target.checked)}
              className="accent-indigo-500" />
            <label htmlFor="snap" className="text-xs text-gray-400 cursor-pointer">Snap to Grid</label>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {store.selectedIds.length > 0 && (
              <button onClick={store.removeSelected}
                className="px-2 py-1 text-xs bg-red-900/40 hover:bg-red-800/60 text-red-400 rounded transition">
                🗑 Delete
              </button>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded ${store.isDirty ? 'bg-yellow-900/40 text-yellow-400' : 'bg-green-900/40 text-green-400'}`}>
              {store.isDirty ? '● Unsaved' : '✓ Saved'}
            </span>
            <button onClick={handleSave}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-700 hover:bg-indigo-600 text-white rounded transition">
              💾 Save Template
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="overflow-auto bg-gray-950 rounded-lg border border-gray-800 p-4 flex-1">
          <DesignerCanvas />
        </div>

        {/* Layer list */}
        {store.elements.length > 0 && (
          <div className="flex gap-1 overflow-x-auto py-1">
            {store.elements.slice().sort((a: DesignerElement, b: DesignerElement) => a.layer - b.layer).map((el: DesignerElement) => (
              <button key={el.id}
                onClick={() => store.setSelected([el.id])}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded border whitespace-nowrap transition
                  ${store.selectedIds.includes(el.id) ? 'bg-indigo-900/50 border-indigo-700 text-indigo-300' : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600'}`}
              >
                <span className="font-mono text-gray-600">{el.layer}</span>
                <span>{el.type}</span>
                {el.binding && <span className="text-indigo-400">{'{'+el.binding+'}'}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Properties panel */}
      <div className="w-52 shrink-0 bg-gray-900 border border-gray-800 rounded-lg p-3 overflow-y-auto">
        {selectedEl ? (
          <PropertiesPanel element={selectedEl} onUpdate={store.updateElement} />
        ) : (
          <div className="text-center text-gray-600 text-xs mt-8">
            <p>Click an element</p>
            <p>to edit properties</p>
          </div>
        )}
      </div>
    </div>
  )
}
