import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

export type BarcodeSymbology = 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC' | 'ITF'

interface BarcodePreviewProps {
  /** The barcode value — must match exactly what ZPL sends to the Zebra printer */
  value: string
  symbology?: BarcodeSymbology
  showText?: boolean
  lineWidth?: number
  height?: number
  className?: string
  showLabelBorder?: boolean
}

/**
 * BarcodePreview renders a JsBarcode SVG barcode client-side.
 * The `value` prop must be identical to the `serial_number` binding resolved
 * by ZplRenderer so the preview is pixel-content equivalent to the physical print.
 *
 * Symbology maps to ZPL commands in ZplRenderer.cs:
 *   CODE128 → ^BC (default)   CODE39 → ^B3
 *   EAN13   → ^BE             EAN8   → ^B8
 *   UPC     → ^BU             ITF    → ^BI
 */
export function BarcodePreview({
  value,
  symbology = 'CODE128',
  showText = true,
  lineWidth = 1.8,
  height = 60,
  className = '',
  showLabelBorder = false,
}: BarcodePreviewProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const isEmpty = !value || value.trim() === '' || value === '—' || value === 'N/A'

  useEffect(() => {
    if (!svgRef.current || isEmpty) return
    try {
      JsBarcode(svgRef.current, value, {
        format: symbology,
        width: lineWidth,
        height: height,
        displayValue: showText,
        fontSize: 11,
        textMargin: 4,
        margin: 8,
        background: '#ffffff',
        lineColor: '#000000',
      })
    } catch {
      // Fall back to CODE128 for symbologies with strict validation (EAN, UPC)
      if (symbology !== 'CODE128') {
        try {
          JsBarcode(svgRef.current!, value, {
            format: 'CODE128',
            width: lineWidth,
            height: height,
            displayValue: showText,
            fontSize: 11,
            textMargin: 4,
            margin: 8,
            background: '#ffffff',
            lineColor: '#000000',
          })
        } catch { /* ignore */ }
      }
    }
  }, [value, symbology, showText, lineWidth, height, isEmpty])

  if (isEmpty) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 text-muted-fg text-xs py-4 ${className}`}>
        <div className="font-mono text-2xl opacity-20 tracking-widest select-none">▐███▌▐▌██▐██▌</div>
        <span className="italic opacity-60">Chưa có dữ liệu mã vạch</span>
      </div>
    )
  }

  return (
    <div
      className={[
        'flex flex-col items-center justify-center',
        showLabelBorder ? 'border border-border/50 rounded-lg p-3 bg-white shadow-inner' : '',
        className,
      ].join(' ')}
    >
      <svg
        ref={svgRef}
        className="max-w-full"
        style={{ background: '#ffffff', borderRadius: 2 }}
      />
    </div>
  )
}

export default BarcodePreview
