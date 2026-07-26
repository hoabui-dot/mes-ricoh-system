import { QRCodeSVG } from 'qrcode.react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LabelElement {
  id?: string
  type: string
  x: number
  y: number
  fontSize?: number
  font?: string
  text?: string
  binding?: string
  defaultValue?: string
  width?: number
  height?: number
  strokeWidth?: number
  magnification?: number
  payloadTemplate?: string
  symbology?: string
}

interface LabelLayout {
  columns?: number
  rows?: number
  gapMm?: number
}

interface LabelTemplateJson {
  width: number   // mm — single cell
  height: number  // mm — single cell
  dpi: number
  layout?: LabelLayout  // legacy JSON layout block (still supported)
  elements: LabelElement[]
}

/**
 * Accepts the full API template object (with top-level sheetColumns/sheetRows)
 * OR a raw JSON string / nested templateJson object.
 */
export interface LabelPreviewProps {
  /** Full API template object or raw JSON string of the template content */
  template: any | string | null | undefined
  data: Record<string, string>
  /** Display width in pixels for the entire preview (single or multi-up) */
  width?: number
  className?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveBinding(el: LabelElement, data: Record<string, string>): string {
  if (el.binding && el.binding.trim() !== '') {
    const key = el.binding.trim()
    if (data && data[key] !== undefined && data[key] !== null) return data[key]
    return el.defaultValue ?? el.text ?? `{${key}}`
  }
  return el.text ?? el.defaultValue ?? ''
}

function resolveQrPayload(el: LabelElement, data: Record<string, string>): string {
  if (el.payloadTemplate && el.payloadTemplate.trim() !== '') {
    return el.payloadTemplate.replace(/{([^{}]+)}/g, (match, key) => {
      const k = key.trim()
      return data && data[k] !== undefined ? data[k] : match
    })
  }
  return resolveBinding(el, data)
}

/** Extracts the parseable template JSON object from any shape the API might send */
function parseTemplateJson(template: any): LabelTemplateJson | null {
  if (!template) return null

  // Raw JSON string
  if (typeof template === 'string') {
    try { return JSON.parse(template) } catch { return null }
  }

  // API response object: { templateJson: <parsed JsonElement or string>, ...rest }
  const rawJson = template.templateJson ?? template.TemplateJson
  if (rawJson !== undefined) {
    if (typeof rawJson === 'string') {
      try { return JSON.parse(rawJson) } catch { return null }
    }
    if (rawJson && typeof rawJson === 'object' && Array.isArray(rawJson.elements)) {
      return rawJson as LabelTemplateJson
    }
  }

  // Direct template JSON object with elements array
  if (Array.isArray(template.elements)) {
    return template as LabelTemplateJson
  }

  return null
}

/** 
 * Extracts N-Up layout config, preferring the DB-level fields on the API object
 * (sheetColumns, sheetRows, gapMm) over the legacy JSON `layout` block.
 */
function resolveLayout(template: any, parsed: LabelTemplateJson): { cols: number; rows: number; gapMm: number } {
  // DB-level fields take priority (set from layoutType column)
  if (typeof template === 'object' && template !== null) {
    const cols = template.sheetColumns ?? template.SheetColumns
    const rows = template.sheetRows ?? template.SheetRows
    const gap  = template.gapMm ?? template.GapMm
    if (typeof cols === 'number' && (cols > 1 || rows > 1)) {
      return { cols, rows: rows ?? 1, gapMm: gap ?? 0 }
    }
    // Also handle layoutType string
    const lt = (template.layoutType ?? template.LayoutType ?? '') as string
    if (lt === '2UP') return { cols: 2, rows: 1, gapMm: gap ?? 2 }
    if (lt === '3UP') return { cols: 3, rows: 1, gapMm: gap ?? 2 }
  }

  // Legacy JSON layout block inside templateJson
  const layout = parsed.layout
  if (layout) {
    const cols = Math.max(1, layout.columns ?? 1)
    const rows = Math.max(1, layout.rows ?? 1)
    if (cols > 1 || rows > 1) return { cols, rows, gapMm: layout.gapMm ?? 0 }
  }

  return { cols: 1, rows: 1, gapMm: 0 }
}

// ── Single label tile ─────────────────────────────────────────────────────────

function SingleLabelTile({
  parsed,
  data,
  tileWidth,
}: {
  parsed: LabelTemplateJson
  data: Record<string, string>
  tileWidth: number
}) {
  const dpi      = parsed.dpi || 203
  const mmWidth  = parsed.width  || 50
  const mmHeight = parsed.height || 30
  const dotsWidth = Math.round((mmWidth / 25.4) * dpi)
  const tileHeight = (tileWidth * mmHeight) / mmWidth
  const scale      = tileWidth / dotsWidth

  return (
    <div
      className="relative select-none overflow-hidden bg-white text-black border border-zinc-200 shadow-sm flex-shrink-0"
      style={{ width: tileWidth, height: tileHeight, minWidth: tileWidth, minHeight: tileHeight }}
    >
      {parsed.elements.map((el, idx) => {
        const elType = (el.type || '').toLowerCase()
        const x = el.x * scale
        const y = el.y * scale

        switch (elType) {
          case 'text': {
            const fontSize = (el.fontSize ?? 12) * scale * 1.3
            return (
              <div
                key={idx}
                className="absolute font-bold leading-none whitespace-nowrap text-left"
                style={{ left: x, top: y, fontSize, fontFamily: 'monospace, Arial, sans-serif' }}
              >
                {resolveBinding(el, data)}
              </div>
            )
          }

          case 'rect': {
            const elWidth  = (el.width  ?? 100) * scale
            const elHeight = (el.height ?? 50)  * scale
            const sw = Math.max((el.strokeWidth ?? 2) * scale, 1)
            return (
              <div
                key={idx}
                className="absolute border border-black"
                style={{ left: x, top: y, width: elWidth, height: elHeight, borderWidth: sw, boxSizing: 'border-box' }}
              />
            )
          }

          case 'circle': {
            const diameter = (el.width ?? 60) * scale
            const sw = Math.max((el.strokeWidth ?? 2) * scale, 1)
            return (
              <div
                key={idx}
                className="absolute border border-black rounded-full"
                style={{ left: x, top: y, width: diameter, height: diameter, borderWidth: sw, boxSizing: 'border-box' }}
              />
            )
          }

          case 'line': {
            const elWidth  = (el.width ?? 100) * scale
            const thickness = Math.max((el.height ?? 2) * scale, 1)
            return (
              <div
                key={idx}
                className="absolute bg-black"
                style={{ left: x, top: y, width: elWidth, height: thickness }}
              />
            )
          }

          case 'qr': {
            const qrPayload = resolveQrPayload(el, data)
            const qrW = el.width  ? el.width  * scale : (el.magnification ?? 4) * 25 * scale
            const qrH = el.height ? el.height * scale : (el.magnification ?? 4) * 25 * scale
            return (
              <div
                key={idx}
                className="absolute flex items-center justify-center p-0.5 bg-white border border-zinc-100"
                style={{ left: x, top: y, width: qrW, height: qrH }}
              >
                <QRCodeSVG value={qrPayload} size={Math.min(qrW, qrH) - 4} level="M" includeMargin={false} />
              </div>
            )
          }

          case 'barcode': {
            const value = resolveBinding(el, data)
            return (
              <div
                key={idx}
                className="absolute flex flex-col items-center justify-center border border-zinc-300 bg-zinc-50 overflow-hidden"
                style={{ left: x, top: y, width: (el.width ?? 120) * scale, height: (el.height ?? 50) * scale }}
              >
                <div className="text-[7px] text-zinc-400 font-mono tracking-tighter leading-none">▐█▐█▐▌█▌</div>
                <div className="text-[8px] font-mono text-black select-none truncate max-w-full px-1 scale-75 mt-0.5">{value}</div>
              </div>
            )
          }

          default:
            return null
        }
      })}
    </div>
  )
}

// ── Main LabelPreview ─────────────────────────────────────────────────────────

export function LabelPreview({
  template,
  data,
  width = 400,
  className = '',
}: LabelPreviewProps) {
  const errorCls    = `flex items-center justify-center border border-dashed border-border rounded-lg bg-surface-2 text-muted-fg text-xs italic ${className}`
  const placeholderH = (width * 3) / 5

  if (!template) {
    return <div className={errorCls} style={{ width, height: placeholderH }}>Đang tải Template...</div>
  }

  const parsed = parseTemplateJson(template)
  if (!parsed) {
    return <div className={errorCls} style={{ width, height: placeholderH }}>Lỗi phân tích Template</div>
  }

  const { cols } = resolveLayout(template, parsed)
  const mmWidth  = parsed.width  || 50
  const mmHeight = parsed.height || 30
  const totalH   = Math.round((width * mmHeight) / mmWidth)

  return (
    <div className={`relative ${className}`} style={{ width, height: totalH }}>
      <SingleLabelTile parsed={parsed} data={data} tileWidth={width} />
      
      {/* Column badge */}
      {cols > 1 && (
        <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded select-none pointer-events-none">
          {cols === 2 ? '2 Cột' : cols === 3 ? '3 Cột' : `${cols} Cột`}
        </div>
      )}
    </div>
  )
}

export default LabelPreview
