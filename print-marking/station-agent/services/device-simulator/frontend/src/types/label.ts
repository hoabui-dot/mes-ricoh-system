// ── Label Template Types ──────────────────────────────────────────────────────

export interface LabelTemplate {
  id: string
  name: string
  description?: string
  dpi: number
  labelWidth: number   // mm
  labelHeight: number  // mm
  templateJson: string
  version: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface LabelTemplateVersion {
  id: string
  templateId: string
  version: number
  templateJson: string
  createdBy?: string
  createdAt: string
}

// ── Designer Element Types ────────────────────────────────────────────────────

export type ElementType = 'text' | 'barcode' | 'qr' | 'rect' | 'circle' | 'line' | 'image'

export interface BaseElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  layer: number
  binding?: string
  locked?: boolean
  visible?: boolean
}

export interface TextElement extends BaseElement {
  type: 'text'
  text?: string
  font: string
  fontSize: number
  fontWeight?: 'normal' | 'bold'
  color?: string
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode'
  value?: string
  symbology: 'Code128' | 'Code39' | 'EAN13' | 'UPCA' | 'EAN8' | 'ITF'
  showText?: boolean
}

export interface QrElement extends BaseElement {
  type: 'qr'
  value?: string
  errorCorrection: 'L' | 'M' | 'Q' | 'H'
  magnification: number
}

export interface RectElement extends BaseElement {
  type: 'rect'
  fill?: string
  stroke?: string
  strokeWidth?: number
  cornerRadius?: number
}

export interface CircleElement extends BaseElement {
  type: 'circle'
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface LineElement extends BaseElement {
  type: 'line'
  stroke?: string
  strokeWidth?: number
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src?: string      // base64 or URL for preview
  alt?: string
}

export type DesignerElement =
  | TextElement
  | BarcodeElement
  | QrElement
  | RectElement
  | CircleElement
  | LineElement
  | ImageElement

// ── Label Document (the JSON schema sent to/from backend) ────────────────────

export interface LabelDocument {
  width: number      // mm
  height: number     // mm
  dpi: number
  elements: DesignerElement[]
}

// ── Print Types ───────────────────────────────────────────────────────────────

export interface PrintHistory {
  id: string
  templateId: string
  templateName: string
  templateVersion: number
  printerCode: string
  runtimeDataJson: string
  renderedZpl: string
  tcpRequestHex?: string
  tcpResponseHex?: string
  printerResult?: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  durationMs: number
  retryCount: number
  traceId: string
  correlationId: string
  exceptionMessage?: string
  timelineJson?: string
  createdAt: string
}

export type RuntimeData = Record<string, string>

// ── API Request/Response Types ────────────────────────────────────────────────

export interface RenderResponse {
  zpl: string
  rendererType: string
}

export interface PrintTestResponse {
  historyId: string
  success: boolean
  durationMs: number
  zpl: string
}

// ── Printer Simulator Mode ────────────────────────────────────────────────────

export enum PrinterSimulatorMode {
  Success = 0,
  PrinterBusy = 1,
  Offline = 2,
  PaperOut = 3,
  RibbonOut = 4,
  HeadOpen = 5,
  InvalidZpl = 6,
  InvalidBarcode = 7,
  TcpTimeout = 8,
  TcpConnectionRefused = 9,
  MemoryFull = 10,
}

export interface PrinterModeResponse {
  mode: number
  modeName: string
  availableModes: Array<{ value: number; name: string }>
}
