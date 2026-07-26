import React, { useState, useEffect, useCallback } from 'react'
import type { LabelTemplate, RuntimeData, RenderResponse, PrintTestResponse, PrinterModeResponse } from '../../types/label'
import { PrinterSimulatorMode } from '../../types/label'

const API_BASE = '/api'

interface Props {
  template: LabelTemplate | null
}

const DEFAULT_RUNTIME: RuntimeData = {
  ProductName: 'Coffee Premium',
  Barcode: '123456789012',
  Batch: 'B001',
  Lot: 'L0008',
  Serial: 'SN998877',
}

export default function PreviewPanel({ template }: Props) {
  const [runtimeDataText, setRuntimeDataText] = useState(JSON.stringify(DEFAULT_RUNTIME, null, 2))
  const [templateJson, setTemplateJson] = useState('')
  const [renderedZpl, setRenderedZpl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printResult, setPrintResult] = useState<PrintTestResponse | null>(null)
  const [printerMode, setPrinterMode] = useState<PrinterModeResponse | null>(null)
  const [settingMode, setSettingMode] = useState(false)
  const [validationResult, setValidationResult] = useState<string | null>(null)

  // Load printer mode from device simulator
  useEffect(() => {
    fetch('/api/printer/mode').then(r => r.json()).then(setPrinterMode).catch(() => {})
  }, [])

  useEffect(() => {
    if (template) {
      try {
        const rawJson = template.templateJson || '{}'
        setTemplateJson(JSON.stringify(JSON.parse(rawJson), null, 2))
      } catch (e) {
        setTemplateJson('{}')
      }
    }
  }, [template?.id, template?.templateJson])

  const handleRender = useCallback(async () => {
    if (!templateJson.trim()) return
    setRendering(true)
    setError(null)
    try {
      const data: RuntimeData = JSON.parse(runtimeDataText)
      const res = await fetch(`${API_BASE}/label-templates/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateJson, data })
      })
      const result: RenderResponse = await res.json()
      if (res.ok) {
        setRenderedZpl(result.zpl)
        setError(null)
      } else {
        setError((result as any).error ?? 'Render failed')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRendering(false)
    }
  }, [templateJson, runtimeDataText])

  // Auto-render on runtime data change (debounced)
  useEffect(() => {
    if (!templateJson.trim()) return
    const timer = setTimeout(handleRender, 600)
    return () => clearTimeout(timer)
  }, [runtimeDataText])

  const handleValidate = () => {
    try {
      JSON.parse(templateJson)
      setValidationResult('✅ Valid JSON template')
    } catch (e: any) {
      setValidationResult(`❌ Invalid JSON: ${e.message}`)
    }
  }

  const handleCopyZpl = () => {
    navigator.clipboard.writeText(renderedZpl).then(() => {
      const orig = renderedZpl
      alert('ZPL copied to clipboard!')
    })
  }

  const handleDownloadZpl = () => {
    const blob = new Blob([renderedZpl], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `label_${template?.name ?? 'output'}.zpl`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrintTest = async () => {
    if (!template || !renderedZpl) return
    setPrinting(true)
    setPrintResult(null)
    try {
      const data: RuntimeData = JSON.parse(runtimeDataText)
      const res = await fetch(`${API_BASE}/label-templates/${template.id}/print-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, printerCode: 'printer-01' })
      })
      const result: PrintTestResponse = await res.json()
      setPrintResult(result)
    } catch (e: any) {
      setPrintResult({ historyId: '', success: false, durationMs: 0, zpl: '' })
    } finally {
      setPrinting(false)
    }
  }

  const handleSetPrinterMode = async (mode: number) => {
    setSettingMode(true)
    try {
      const res = await fetch('/api/printer/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      })
      const result = await res.json()
      const pmRes = await fetch('/api/printer/mode')
      const pm = await pmRes.json()
      setPrinterMode(pm)
    } finally {
      setSettingMode(false)
    }
  }

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <span className="text-4xl">👁️</span>
        <p className="text-sm">Select a template to preview and test printing.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Action Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={handleRender} disabled={rendering}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white rounded transition">
          {rendering ? '⏳' : '⚡'} Render
        </button>
        <button onClick={handleValidate}
          className="px-3 py-1.5 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition">
          ✓ Validate
        </button>
        <button onClick={handleCopyZpl} disabled={!renderedZpl}
          className="px-3 py-1.5 text-xs font-semibold bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 rounded transition">
          📋 Copy ZPL
        </button>
        <button onClick={handleDownloadZpl} disabled={!renderedZpl}
          className="px-3 py-1.5 text-xs font-semibold bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 rounded transition">
          ↓ Download ZPL
        </button>
        <button onClick={handlePrintTest} disabled={printing || !renderedZpl}
          className="px-3 py-1.5 text-xs font-semibold bg-green-800 hover:bg-green-700 disabled:opacity-50 text-green-100 rounded transition">
          {printing ? '🖨️ Printing…' : '🖨️ Print Test'}
        </button>
        {validationResult && (
          <span className={`text-xs px-2 py-1 rounded ${validationResult.startsWith('✅') ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
            {validationResult}
          </span>
        )}
        {printResult && (
          <span className={`text-xs px-2 py-1 rounded ${printResult.success ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-400'}`}>
            {printResult.success ? `✅ Print OK (${printResult.durationMs}ms)` : '❌ Print Failed'}
          </span>
        )}
      </div>

      {/* Printer Simulator Mode */}
      {printerMode && (
        <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5">
          <span className="text-[11px] text-gray-500 font-semibold">🖨️ Simulator Mode:</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${printerMode.mode === 0 ? 'bg-green-900/50 text-green-400' : 'bg-orange-900/50 text-orange-300'}`}>
            {printerMode.modeName}
          </span>
          <select
            onChange={e => handleSetPrinterMode(+e.target.value)}
            value={printerMode.mode}
            disabled={settingMode}
            className="ml-auto bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none"
          >
            {printerMode.availableModes.map(m => (
              <option key={m.value} value={m.value}>{m.value}: {m.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded px-3 py-2 text-xs text-red-300">{error}</div>
      )}

      {/* Three-Panel Layout */}
      <div className="grid grid-cols-3 gap-4" style={{ minHeight: '480px' }}>
        {/* Panel 1: Template JSON */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">① Template JSON</span>
            <span className="text-[10px] text-gray-600">v{template.version}</span>
          </div>
          <textarea
            value={templateJson}
            onChange={e => setTemplateJson(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs font-mono text-gray-300 resize-none focus:outline-none focus:border-indigo-600"
            style={{ minHeight: '440px' }}
            spellCheck={false}
          />
        </div>

        {/* Panel 2: Generated ZPL */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">② Generated ZPL</span>
            {renderedZpl && <span className="text-[10px] text-gray-600">{renderedZpl.length} chars</span>}
          </div>
          <textarea
            value={renderedZpl}
            readOnly
            placeholder="Click ⚡ Render to generate ZPL..."
            className="flex-1 bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs font-mono text-green-400 resize-none focus:outline-none"
            style={{ minHeight: '440px' }}
            spellCheck={false}
          />
        </div>

        {/* Panel 3: Preview + Runtime Data */}
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">③ Label Preview</span>
          {/* ZPL Visual Preview */}
          <div className="bg-white border-2 border-gray-300 rounded-lg p-3 flex-1 flex flex-col items-center justify-center"
            style={{ minHeight: '250px', maxHeight: '260px', overflow: 'hidden' }}>
            {renderedZpl ? (
              <ZplPreviewRenderer zpl={renderedZpl} runtimeData={JSON.parse(runtimeDataText || '{}')} />
            ) : (
              <div className="text-gray-400 text-xs text-center">
                <span className="text-3xl block mb-2">🏷️</span>
                Render to preview
              </div>
            )}
          </div>

          {/* Runtime Data Editor */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
              Runtime Data
            </label>
            <textarea
              value={runtimeDataText}
              onChange={e => setRuntimeDataText(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2.5 text-xs font-mono text-yellow-300 resize-none focus:outline-none focus:border-yellow-600"
              rows={8}
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Simple ZPL Visual Preview ─────────────────────────────────────────────────

function ZplPreviewRenderer({ zpl, runtimeData }: { zpl: string; runtimeData: RuntimeData }) {
  // Extract lines from ZPL for a simple ASCII preview
  const lines: Array<{ text: string; type: 'text' | 'barcode' | 'qr' | 'box' }> = []

  // Parse ^FD fields from ZPL
  const fdMatches = [...zpl.matchAll(/\^FD([^^]*)\^FS/g)]
  const bcMatch = zpl.includes('^BC') || zpl.includes('^B3')
  const qrMatch = zpl.includes('^BQ')

  fdMatches.forEach(m => {
    const val = m[1].trim()
    if (!val) return
    if (bcMatch && !qrMatch) lines.push({ text: val, type: 'barcode' })
    else if (qrMatch) lines.push({ text: val, type: 'qr' })
    else lines.push({ text: val, type: 'text' })
  })

  return (
    <div className="w-full h-full flex flex-col items-center gap-1 justify-center">
      {lines.length === 0 ? (
        <span className="text-gray-400 text-xs">No renderable content</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="w-full text-center">
            {line.type === 'barcode' ? (
              <div className="flex justify-center gap-0.5 my-1">
                {line.text.split('').map((c, ci) => (
                  <div key={ci} className="bg-gray-900" style={{ width: ci % 3 === 0 ? 3 : 1.5, height: 40 }} />
                ))}
              </div>
            ) : line.type === 'qr' ? (
              <div className="inline-grid gap-0.5 p-1 bg-white" style={{ gridTemplateColumns: 'repeat(7, 6px)' }}>
                {Array.from({ length: 49 }).map((_, qi) => (
                  <div key={qi} className={qi % 3 === 0 || qi % 5 === 0 ? 'bg-gray-900' : 'bg-white'} style={{ width: 6, height: 6 }} />
                ))}
              </div>
            ) : (
              <span className="text-gray-900 font-semibold text-sm">{line.text}</span>
            )}
          </div>
        ))
      )}
    </div>
  )
}
