import { useEffect, useState, useCallback, useRef } from 'react'
import { templateApi, printerApi } from '@/api/client'
import { LabelPreview } from '@/components/LabelPreview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table as TableEl, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  FileText, Plus, Search, RefreshCw, Star, Archive, CheckCircle2,
  Download, Upload, Copy, Trash2, Edit2, Eye, Printer as PrinterIcon,
  History, AlertTriangle, Check, Settings2,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LabelTemplate {
  id: string
  name: string
  description?: string
  note?: string
  templateCode?: string
  category?: string
  orientation?: string
  revision?: string
  supportedBarcodeTypes?: string
  supportedPrinterModels?: string
  compatibleStationTypes?: string
  dpi: number
  labelWidth: number
  labelHeight: number
  templateJson: object
  version: number
  status: 'draft' | 'published' | 'archived'
  isDefault: boolean
  isActive: boolean
  createdBy?: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
  // N-Up layout
  layoutType: '1UP' | '2UP' | '3UP'
  sheetColumns: number
  sheetRows: number
  gapMm: number
}

interface PrinterAssignment {
  id: string
  printerCode: string
  templateId: string
  templateName?: string
  assignedAt: string
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function TemplateBadge({ status, isDefault }: { status: string; isDefault: boolean }) {
  const statusConfig = {
    published: {
      label: 'Phát hành',
      cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold border bg-success/10 text-success border-success/25',
      dot: 'bg-success',
    },
    draft: {
      label: 'Nháp',
      cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold border bg-surface-2 text-muted-fg border-border',
      dot: 'bg-muted-fg',
    },
    archived: {
      label: 'Lưu trữ',
      cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold border bg-warning/10 text-warning border-warning/25',
      dot: 'bg-warning',
    },
  }
  const cfg = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.draft
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={cfg.cls}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        {cfg.label}
      </span>
      {isDefault && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold border bg-info/10 text-info border-info/25">
          <Star size={11} className="fill-current flex-shrink-0" />
          Mặc định
        </span>
      )}
    </div>
  )
}

// ── Category Badge ────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  PRODUCT:    { label: 'Product',    color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20' },
  WIP:        { label: 'WIP',        color: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20' },
  PALLET:     { label: 'Pallet',     color: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20' },
  SHELF:      { label: 'Shelf',      color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20' },
  INSPECTION: { label: 'Inspection', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' },
  MATERIAL:   { label: 'Material',   color: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20' },
  SHEET:      { label: 'Sheet',      color: 'bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-500/10 dark:text-lime-400 dark:border-lime-500/20' },
  ISSUE:      { label: 'Issue',      color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' },
}

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null
  const meta = CATEGORY_META[category.toUpperCase()] ?? {
    label: category,
    color: 'bg-surface-2 text-muted-fg border-border',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[13px] font-semibold border ${meta.color}`}>
      {meta.label}
    </span>
  )
}

// ── Icon action button ────────────────────────────────────────────────────────

function IconBtn({
  id, onClick, title, danger, success, brand, children,
}: {
  id?: string; onClick: () => void; title: string
  danger?: boolean; success?: boolean; brand?: boolean
  children: React.ReactNode
}) {
  const cls = danger
    ? 'hover:bg-error/8 hover:border-error/25 hover:text-error'
    : success
    ? 'hover:bg-success/8 hover:border-success/25 hover:text-success'
    : brand
    ? 'hover:bg-brand-glow hover:border-brand/25 hover:text-brand'
    : 'hover:bg-surface-2 hover:border-border hover:text-foreground'

  return (
    <button
      id={id}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border border-transparent text-muted-fg transition-all duration-150 cursor-pointer ${cls}`}
    >
      {children}
    </button>
  )
}

// ── Template Editor Dialog ────────────────────────────────────────────────────

const BLANK_TEMPLATE_JSON = JSON.stringify({
  width: 50, height: 30, dpi: 203,
  elements: [
    { type: 'text', x: 10, y: 20, fontSize: 14, text: 'Company Name' },
    { type: 'text', x: 10, y: 55, fontSize: 10, binding: 'product_name', defaultValue: 'Product' },
    { type: 'qr', x: 260, y: 60, magnification: 4, payloadTemplate: '{serial_number}' },
  ]
}, null, 2)

function TemplateEditorDialog({
  open, template, printers, layoutType: defaultLayoutType, onClose, onSaved,
}: {
  open: boolean; template: LabelTemplate | null; printers: any[]
  layoutType: '1UP' | '2UP' | '3UP'  // active tab — used when creating
  onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!template
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [note, setNote]               = useState('')
  const [dpi, setDpi]                 = useState('203')
  const [width, setWidth]             = useState('50')
  const [height, setHeight]           = useState('30')
  const [gapMm, setGapMm]             = useState('0')
  const [jsonText, setJsonText]       = useState(BLANK_TEMPLATE_JSON)
  const [jsonError, setJsonError]     = useState<string | null>(null)
  const [parsedJson, setParsedJson]   = useState<object | null>(null)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [testPrinter, setTestPrinter] = useState('')
  const [testing, setTesting]         = useState(false)
  const [testResult, setTestResult]   = useState<{ success: boolean; msg: string } | null>(null)

  // Layout type for new templates — fixed by the active tab, cannot be changed after creation
  const layoutType = template?.layoutType ?? defaultLayoutType

  const tryParseJson = (text: string) => {
    try { const p = JSON.parse(text); setParsedJson(p); setJsonError(null) }
    catch (e: any) { setParsedJson(null); setJsonError(e.message) }
  }

  useEffect(() => {
    if (open) {
      if (template) {
        setName(template.name); setDescription(template.description ?? '')
        setNote(template.note ?? ''); setDpi(String(template.dpi))
        setWidth(String(template.labelWidth)); setHeight(String(template.labelHeight))
        setGapMm(String(template.gapMm ?? 0))
        const raw = JSON.stringify(template.templateJson, null, 2)
        setJsonText(raw); tryParseJson(raw)
      } else {
        // Derive gap default from layout type
        const defaultGap = defaultLayoutType === '1UP' ? '0' : '2'
        setName(''); setDescription(''); setNote(''); setDpi('203'); setWidth('50'); setHeight('30')
        setGapMm(defaultGap)
        setJsonText(BLANK_TEMPLATE_JSON); tryParseJson(BLANK_TEMPLATE_JSON)
      }
      setError(null); setTestResult(null); setTesting(false)
    }
  }, [open, template, defaultLayoutType])

  const handleJsonChange = (v: string) => { setJsonText(v); tryParseJson(v) }

  const handleSave = async () => {
    if (jsonError) { setError('Sửa lỗi JSON trước khi lưu.'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        name, description: description || undefined, note: note || undefined,
        dpi: parseInt(dpi), labelWidth: parseFloat(width), labelHeight: parseFloat(height),
        templateJson: jsonText,
        gapMm: parseFloat(gapMm) || 0,
      }
      if (isEdit) {
        await templateApi.update(template!.id, payload)
      } else {
        await templateApi.create({
          ...payload,
          layoutType,
          sheetColumns: layoutType === '3UP' ? 3 : layoutType === '2UP' ? 2 : 1,
          sheetRows: 1,
        })
      }
      onSaved()
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message)
    } finally { setSaving(false) }
  }

  const handleTestPrint = async () => {
    if (!testPrinter) { setTestResult({ success: false, msg: 'Chọn máy in trước.' }); return }
    setTesting(true); setTestResult(null)
    try {
      const res = await templateApi.printTest(template!.id, {
        printerCode: testPrinter,
        data: {
          serial_number: 'TEST-001', product_code: 'TEST-P01',
          product_name: 'Test Product', batch_number: 'BATCH-TEST',
          revision: 'A', production_date: new Date().toISOString().split('T')[0],
        }
      })
      setTestResult({
        success: res.data.success,
        msg: res.data.success ? `In thành công · ${res.data.durationMs}ms` : 'In thất bại — kiểm tra máy in.',
      })
    } catch (e: any) {
      setTestResult({ success: false, msg: e.response?.data?.error ?? e.message })
    } finally { setTesting(false) }
  }

  const labelCls = 'block text-[13px] font-semibold text-foreground mb-1.5'

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-card border-border text-foreground [box-shadow:var(--shadow-lg)]">
        <DialogHeader className="pb-4 border-b border-border flex-shrink-0">
          <DialogTitle className="text-[22px] font-semibold">
            {isEdit ? `Chỉnh sửa — ${template?.name}` : 'Thêm mẫu nhãn mới'}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-muted-fg">
            {isEdit
              ? `Phiên bản v${template?.version} · Trạng thái: ${template?.status}`
              : 'Cấu hình thông số và thiết kế layout tem nhãn'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-2 gap-6 py-4 min-h-0">
          {/* ── Form (left) ── */}
          <div className="overflow-y-auto pr-2 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Tên mẫu tem <span className="text-error">*</span></label>
                <Input id="tpl-name" value={name} onChange={e => setName(e.target.value)} placeholder="50x30 QR Label" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Mô tả</label>
                <Input id="tpl-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Mô tả ngắn..." />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Ghi chú sản xuất</label>
                <textarea
                  id="tpl-note" value={note} onChange={e => setNote(e.target.value)} rows={3}
                  placeholder="Ghi chú cho kỹ sư sản xuất..."
                  className="w-full rounded-lg bg-surface border border-border text-foreground text-[15px] px-3 py-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-shadow"
                />
              </div>
            {/* Layout type badge (read-only) */}
              <div className="col-span-2">
                <label className={labelCls}>Cột nhãn (Column Across)</label>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-bold border ${
                    layoutType === '3UP' ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20'
                    : layoutType === '2UP' ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20'
                    : 'bg-surface-2 text-muted-fg border-border'
                  }`}>
                    {layoutType === '1UP' ? '1 cột nhãn (1 nhãn / hàng)'
                    : layoutType === '2UP' ? '2 cột nhãn (2 nhãn / hàng)'
                    : '3 cột nhãn (3 nhãn / hàng)'}
                  </span>
                  {isEdit && <span className="text-[12px] text-muted-fg">Không thể đổi sau khi tạo</span>}
                </div>
              </div>
              <div>
                <label className={labelCls}>Độ phân giải (DPI)</label>
                <Select value={dpi} onValueChange={setDpi}>
                  <SelectTrigger id="tpl-dpi" className="bg-surface border-border text-foreground focus:ring-brand h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-foreground">
                    <SelectItem value="203">203 DPI</SelectItem>
                    <SelectItem value="300">300 DPI</SelectItem>
                    <SelectItem value="600">600 DPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Rộng (mm)</label>
                  <Input id="tpl-width" value={width} onChange={e => setWidth(e.target.value)} type="number" />
                </div>
                <div>
                  <label className={labelCls}>Cao (mm)</label>
                  <Input id="tpl-height" value={height} onChange={e => setHeight(e.target.value)} type="number" />
                </div>
              </div>
              {/* N-Up config: only shown for 2UP / 3UP */}
              {layoutType !== '1UP' && (
                <div className="col-span-2 grid grid-cols-3 gap-3 bg-surface-2 border border-border rounded-xl p-3 mt-1">
                  <div>
                    <label className={labelCls}>Số cột</label>
                    <Input value={layoutType === '3UP' ? 3 : 2} disabled type="number" className="opacity-60 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className={labelCls}>Số hàng</label>
                    <Input value={1} disabled type="number" className="opacity-60 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className={labelCls}>Khoảng cách (mm)</label>
                    <Input
                      id="tpl-gap-mm"
                      value={gapMm} onChange={e => setGapMm(e.target.value)}
                      type="number" min="0" max="20" step="0.5"
                    />
                  </div>
                  <div className="col-span-3 text-[11px] text-muted-fg pt-1">
                    Kích thước tờ in: <span className="font-semibold text-foreground">
                      {Math.round((parseFloat(width)||50) * (layoutType === '3UP' ? 3 : 2) + (parseFloat(gapMm)||0) * (layoutType === '3UP' ? 2 : 1))} × {height || 30} mm
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls.replace('mb-1.5', '')}>Template JSON</label>
                {jsonError && (
                  <span className="text-error text-[12px] flex items-center gap-1 font-semibold">
                    <AlertTriangle size={12} />{jsonError.slice(0, 55)}
                  </span>
                )}
              </div>
              <textarea
                id="tpl-json" value={jsonText} onChange={e => handleJsonChange(e.target.value)}
                className={`w-full h-64 bg-surface rounded-lg text-[13px] font-mono p-3 text-foreground resize-none outline-none border focus:ring-2 transition-shadow ${
                  jsonError ? 'border-error focus:ring-error/30' : 'border-border focus:ring-brand/30 focus:border-brand'
                }`}
                spellCheck={false}
              />
            </div>

            {/* Test Print */}
            {isEdit && (
              <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
                <div className="text-[13px] font-semibold text-foreground">In thử nghiệm</div>
                <div className="flex gap-3">
                  <Select value={testPrinter} onValueChange={setTestPrinter}>
                    <SelectTrigger id="tpl-test-printer" className="bg-surface border-border text-foreground h-10 flex-1 focus:ring-brand">
                      <SelectValue placeholder="Chọn máy in..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-foreground">
                      {printers.map(p => (
                        <SelectItem key={p.printerCode ?? p.PrinterCode} value={p.printerCode ?? p.PrinterCode}>
                          {p.displayName ?? p.DisplayName} ({p.printerCode ?? p.PrinterCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button id="tpl-test-print-btn" size="sm" onClick={handleTestPrint} disabled={testing}
                    className="bg-info hover:bg-info/90 text-white h-10 px-4 gap-2">
                    {testing ? <RefreshCw size={14} className="animate-spin" /> : <PrinterIcon size={14} />}
                    Test Print
                  </Button>
                </div>
                {testResult && (
                  <div className={`text-[13px] flex items-center gap-2 font-semibold ${testResult.success ? 'text-success' : 'text-error'}`}>
                    {testResult.success ? <Check size={14} /> : <AlertTriangle size={14} />}
                    {testResult.msg}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Live Preview (right) ── */}
          <div className="overflow-y-auto flex flex-col gap-3">
            <label className={labelCls}>Xem trước trực quan</label>
            <div className="bg-background border border-border rounded-xl p-4 flex items-center justify-center min-h-40 flex-1">
              {parsedJson ? (
                <LabelPreview
                  template={parsedJson as any}
                  data={{
                    serial_number: 'SN-TEST-001', product_code: 'P-TEST-01',
                    product_name: 'Test Product', batch_number: 'BATCH-01',
                    revision: 'A', production_date: new Date().toISOString().split('T')[0],
                  }}
                  width={360}
                />
              ) : (
                <div className="text-muted-fg text-[13px] flex items-center gap-2">
                  <AlertTriangle size={16} className="text-error" />
                  Cấu trúc JSON bị lỗi — sửa để xem trước.
                </div>
              )}
            </div>
            <p className="text-[12px] text-muted-fg text-center">
              * Bản xem trước sử dụng dữ liệu mẫu. Kết quả in thực tế phụ thuộc máy in.
            </p>
          </div>
        </div>

        {error && (
          <div className="text-error text-[13px] font-semibold flex items-center gap-2 bg-error/8 border border-error/20 rounded-xl px-4 py-3 flex-shrink-0">
            <AlertTriangle size={16} className="flex-shrink-0" /> {error}
          </div>
        )}

        <DialogFooter className="gap-3 border-t border-border pt-4 flex-shrink-0">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button id="tpl-save-btn" onClick={handleSave} disabled={saving || !!jsonError}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : null}
            {isEdit ? 'Lưu thay đổi' : 'Tạo mẫu nhãn'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Preview Dialog ────────────────────────────────────────────────────────────

function TemplatePreviewDialog({
  open, template, onClose,
}: { open: boolean; template: LabelTemplate | null; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border text-foreground [box-shadow:var(--shadow-lg)]">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-[22px] font-semibold">{template?.name}</DialogTitle>
          <DialogDescription className="text-[13px] text-muted-fg">
            v{template?.version} · {template?.labelWidth}×{template?.labelHeight}mm · {template?.dpi} DPI
            {template?.orientation && ` · ${template.orientation}`}
            {template?.revision && ` · Rev ${template.revision}`}
          </DialogDescription>
        </DialogHeader>

        {(template?.category || template?.templateCode) && (
          <div className="flex items-center gap-2 flex-wrap pt-2">
            {template?.category && <CategoryBadge category={template.category} />}
            {template?.templateCode && (
              <span className="font-mono text-[13px] text-foreground bg-surface-2 px-2.5 py-1 rounded-lg border border-border">
                {template.templateCode}
              </span>
            )}
          </div>
        )}

        {template?.note && (
          <div className="rounded-xl border border-warning/25 bg-warning/5 px-4 py-3">
            <div className="text-[12px] font-bold text-warning uppercase tracking-wider mb-2 flex items-center gap-1.5">
              📋 Ghi chú sản xuất
            </div>
            <pre className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed font-sans">
              {template.note}
            </pre>
          </div>
        )}

        <div className="flex items-center justify-center py-8 bg-background border border-border rounded-xl">
          {template && (
            <LabelPreview
              template={template.templateJson as any}
              data={{
                serial_number: 'SN-PREVIEW-001', product_code: 'P-PREVIEW-01',
                product_name: 'Preview Product', batch_number: 'BATCH-PREVIEW',
                revision: 'B', production_date: new Date().toISOString().split('T')[0],
              }}
              width={460}
            />
          )}
        </div>

        {template?.description && (
          <p className="text-[13px] text-muted-fg">{template.description}</p>
        )}

        <DialogFooter className="border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Print History Dialog ──────────────────────────────────────────────────────

function PrintHistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await templateApi.getPrintHistory(1, 50); setRecords(res.data) }
    catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (open) { load(); setSelected(null) } }, [open, load])

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col bg-card border-border text-foreground [box-shadow:var(--shadow-lg)]">
        <DialogHeader className="border-b border-border pb-4 flex-shrink-0">
          <DialogTitle className="text-[22px] font-semibold flex items-center gap-2">
            <History size={20} className="text-info" />
            Lịch sử in/khắc tem nhãn
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-fg text-[15px] gap-3">
              <RefreshCw size={20} className="animate-spin text-brand" /> Đang tải lịch sử in…
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-16 text-muted-fg text-[15px]">Chưa có lịch sử in.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                {records.map(r => (
                  <button key={r.id} onClick={() => setSelected(r)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                      selected?.id === r.id
                        ? 'border-brand bg-brand-glow shadow-sm'
                        : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-foreground text-[15px] truncate max-w-[60%]">
                        {r.templateName}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold border ${
                        r.status === 'SUCCESS'
                          ? 'bg-success/10 text-success border-success/25'
                          : r.status === 'FAILED'
                          ? 'bg-error/10 text-error border-error/25'
                          : 'bg-warning/10 text-warning border-warning/25'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-muted-fg flex gap-3 text-[13px]">
                      <span>v{r.templateVersion}</span>
                      <span>{r.printerCode}</span>
                      <span>{r.durationMs}ms</span>
                    </div>
                    <div className="text-muted-fg mt-1 font-mono text-[12px]">
                      {new Date(r.createdAt).toLocaleString('vi-VN')}
                    </div>
                  </button>
                ))}
              </div>

              <div className="sticky top-0">
                {selected ? (
                  <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-4">
                    <div className="text-[15px] font-bold text-foreground">
                      Chi tiết — {selected.templateName}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[13px]">
                      {[
                        ['Trạng thái', selected.status],
                        ['Phiên bản', `v${selected.templateVersion}`],
                        ['Mã máy in', selected.printerCode],
                        ['Thời gian xử lý', `${selected.durationMs} ms`],
                        ['Trace ID', selected.traceId],
                      ].map(([k, v]) => (
                        <>
                          <span key={`k-${k}`} className="text-muted-fg">{k}</span>
                          <span key={`v-${k}`} className="text-foreground font-mono truncate text-[12px]">{v}</span>
                        </>
                      ))}
                    </div>
                    {selected.renderedZpl && (
                      <div>
                        <div className="text-[13px] font-semibold text-muted-fg mb-2">Bản tin ZPL</div>
                        <pre className="text-[12px] font-mono bg-background text-foreground p-3 rounded-lg max-h-48 overflow-y-auto border border-border">
                          {selected.renderedZpl}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-muted-fg text-[13px] text-center py-16 border border-dashed border-border rounded-xl bg-surface-2">
                    Chọn một bản ghi để xem chi tiết.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-4 flex-shrink-0">
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main Label Templates Tab ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export function LabelTemplatesTab() {
  const [templates, setTemplates]   = useState<LabelTemplate[]>([])
  const [printers, setPrinters]     = useState<any[]>([])
  const [assignments, setAssignments] = useState<PrinterAssignment[]>([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter]   = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  // N-Up layout tab
  const [layoutTab, setLayoutTab]   = useState<'1UP' | '2UP' | '3UP'>('1UP')

  // Dialog visibility
  const [editorOpen, setEditorOpen]   = useState(false)
  const [editTarget, setEditTarget]   = useState<LabelTemplate | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<LabelTemplate | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [assignOpen, setAssignOpen]   = useState(false)

  const [assignSelections, setAssignSelections] = useState<Record<string, string>>({})
  const [assignSaving, setAssignSaving] = useState(false)

  const importRef = useRef<HTMLInputElement>(null)

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { layoutType: layoutTab }
      if (statusFilter !== 'all') params.status = statusFilter
      if (statusFilter === 'archived') params.includeArchived = true
      const [tRes, pRes, aRes] = await Promise.all([
        templateApi.list(params),
        printerApi.list(),
        templateApi.getAssignments(),
      ])
      setTemplates(tRes.data)
      setPrinters(pRes.data)
      setAssignments(aRes.data)
      const sel: Record<string, string> = {}
      aRes.data.forEach((a: any) => { sel[a.printerCode ?? a.PrinterCode] = a.templateId })
      setAssignSelections(sel)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [statusFilter, layoutTab])

  useEffect(() => { load() }, [load])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = templates.filter(t => {
    const matchSearch = !search
      || t.name.toLowerCase().includes(search.toLowerCase())
      || (t.description ?? '').toLowerCase().includes(search.toLowerCase())
      || (t.templateCode ?? '').toLowerCase().includes(search.toLowerCase())
    const matchCategory = categoryFilter === 'all' || (t.category ?? '').toUpperCase() === categoryFilter
    return matchSearch && matchCategory
  })

  // ── Actions ───────────────────────────────────────────────────────────────
  const handlePublish   = async (id: string) => { try { await templateApi.publish(id);    await load() } catch { /* API interceptor displays the error. */ } }
  const handleArchive   = async (id: string) => { try { await templateApi.archive(id);    await load() } catch { /* API interceptor displays the error. */ } }
  const handleSetDefault = async (id: string) => { try { await templateApi.setDefault(id); await load() } catch { /* API interceptor displays the error. */ } }
  const handleDuplicate = async (id: string) => { try { await templateApi.duplicate(id);  await load() } catch { /* API interceptor displays the error. */ } }
  const handleDelete    = async (id: string) => {
    if (!confirm('Xóa mẫu nhãn này? Hành động không thể hoàn tác.')) return
    try { await templateApi.delete(id); await load() } catch { /* API interceptor displays the error. */ }
  }
  const handleExport = async (t: LabelTemplate) => {
    const res = await templateApi.exportTemplate(t.id)
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url; a.download = `${t.name.replace(/\s+/g, '_')}_v${t.version}.json`
    a.click(); window.URL.revokeObjectURL(url)
  }
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const text = await file.text()
    try { await templateApi.importTemplate(JSON.parse(text)); await load() }
    catch (err: any) { alert(`Import failed: ${err.message}`) }
    finally { if (importRef.current) importRef.current.value = '' }
  }

  const handleSaveAssignments = async () => {
    setAssignSaving(true)
    try {
      for (const printer of printers) {
        const code = printer.printerCode ?? printer.PrinterCode
        const selectedId = assignSelections[code]
        const current = assignments.find(a => (a.printerCode ?? (a as any).PrinterCode) === code)
        if (selectedId && selectedId !== 'none') {
          if (!current || current.templateId !== selectedId) await templateApi.assignTemplate(code, selectedId)
        } else if (current) {
          await templateApi.removeAssignment(code)
        }
      }
      await load(); setAssignOpen(false)
    } catch (e: any) { alert(`Save failed: ${e.message}`) }
    finally { setAssignSaving(false) }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const published = templates.filter(t => t.status === 'published').length
  const drafts    = templates.filter(t => t.status === 'draft').length
  const archived  = templates.filter(t => t.status === 'archived').length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6 bg-background min-h-full">

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText size={24} className="text-brand" />
          </div>
          <div>
            <h1 className="text-[32px] font-bold text-foreground leading-tight">Mẫu nhãn thiết kế</h1>
            <p className="text-[13px] text-muted-fg mt-1">
              Quản lý và cấu hình mẫu tem nhãn · Gán máy in tương thích
            </p>
          </div>
        </div>

        {/* Action buttons — clear hierarchy */}
        <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0">
          <Button id="tpl-history-btn" variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-2">
            <History size={16} /> Lịch sử in
          </Button>
          <Button id="tpl-assign-btn" variant="outline" size="sm" onClick={() => setAssignOpen(true)} className="gap-2">
            <Settings2 size={16} /> Phân bổ máy in
          </Button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button id="tpl-import-btn" variant="outline" size="sm" onClick={() => importRef.current?.click()} className="gap-2">
            <Upload size={16} /> Nhập file
          </Button>
          {/* Primary CTA */}
          <Button id="tpl-new-btn" size="sm" onClick={() => { setEditTarget(null); setEditorOpen(true) }} className="gap-2 shadow-sm">
            <Plus size={16} /> Thêm mẫu mới
          </Button>
        </div>
      </div>

      {/* ── Stats strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Tổng mẫu nhãn', value: templates.length, color: 'text-foreground', icon: FileText, iconBg: 'bg-surface-2', iconColor: 'text-muted-fg' },
          { label: 'Đang phát hành', value: published,        color: 'text-success',    icon: CheckCircle2, iconBg: 'bg-success/10', iconColor: 'text-success' },
          { label: 'Bản nháp',       value: drafts,           color: 'text-warning',    icon: Archive, iconBg: 'bg-warning/10', iconColor: 'text-warning' },
          { label: 'Lưu trữ',        value: archived,         color: 'text-muted-fg',   icon: Archive, iconBg: 'bg-surface-2', iconColor: 'text-muted-fg' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${s.iconBg}`}>
              <s.icon size={22} className={s.iconColor} />
            </div>
            <div>
              <p className="text-[13px] text-muted-fg font-medium leading-tight">{s.label}</p>
              <p className={`text-[28px] font-bold leading-tight tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Column Layout Tabs ────────────────────────────────────────────────── */}
      {(() => {
        const tabDefs: { key: '1UP' | '2UP' | '3UP'; label: string; emoji: string; desc: string }[] = [
          { key: '1UP', label: '1 Cột nhãn', emoji: '▭', desc: '1 nhãn / hàng' },
          { key: '2UP', label: '2 Cột nhãn', emoji: '▭▭', desc: '2 nhãn / hàng' },
          { key: '3UP', label: '3 Cột nhãn', emoji: '▭▭▭', desc: '3 nhãn / hàng' },
        ]
        // count all templates (ignoring status filter) per layout — use unfiltered set from loaded data
        const countFor = (lt: string) => templates.filter(t => (t.layoutType ?? '1UP') === lt).length

        return (
          <div className="flex gap-1 bg-surface-2 border border-border rounded-xl p-1.5 self-start">
            {tabDefs.map(tab => {
              const active = layoutTab === tab.key
              return (
                <button
                  key={tab.key}
                  id={`tpl-tab-${tab.key.toLowerCase()}`}
                  onClick={() => { setLayoutTab(tab.key); setSearch('') }}
                  className={`flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-[14px] font-semibold transition-all duration-200 cursor-pointer ${
                    active
                      ? tab.key === '2UP' ? 'bg-cyan-500 text-white shadow-sm'
                        : tab.key === '3UP' ? 'bg-violet-500 text-white shadow-sm'
                        : 'bg-brand text-white shadow-sm'
                      : 'text-muted-fg hover:text-foreground hover:bg-surface'
                  }`}
                >
                  <span className="font-mono text-[11px] opacity-70 tracking-tight">{tab.emoji}</span>
                  <span>{tab.label}</span>
                  <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-surface text-muted-fg'
                  }`}>
                    {countFor(tab.key)}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* ── Unified Toolbar ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-4 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none" />
          <Input
            id="tpl-search"
            value={search}
            onChange={e => { setSearch(e.target.value) }}
            placeholder="Tìm theo tên, mã mẫu, mô tả…"
            className="pl-10"
          />
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Category filter */}
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-muted-fg whitespace-nowrap">Nhóm:</span>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger id="tpl-category-filter" className="w-40 h-10 bg-surface border-border text-foreground focus:ring-brand text-[13px]">
              <SelectValue placeholder="Tất cả nhóm" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border text-foreground">
              <SelectItem value="all">Tất cả nhóm</SelectItem>
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-muted-fg whitespace-nowrap">Trạng thái:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="tpl-status-filter" className="w-44 h-10 bg-surface border-border text-foreground focus:ring-brand text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border text-foreground">
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="published">Đã phát hành</SelectItem>
              <SelectItem value="draft">Bản nháp</SelectItem>
              <SelectItem value="archived">Đã lưu trữ</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {(search || statusFilter !== 'all' || categoryFilter !== 'all') && (
            <span className="text-[13px] text-muted-fg whitespace-nowrap tabular-nums">
              {filtered.length} / {templates.length}
            </span>
          )}
          <button
            id="tpl-refresh-btn"
            onClick={load}
            disabled={loading}
            title="Làm mới danh sách"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-fg hover:text-foreground hover:bg-surface-2 hover:border-border-strong transition-all duration-150 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-brand' : ''} />
          </button>
        </div>
      </div>

      {/* ── Data Table ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] overflow-hidden">
        <TableEl>
          <TableHeader>
            <TableRow className="hover:bg-surface-2">
              <TableHead className="pl-6 w-[35%]">Tên mẫu nhãn</TableHead>
              <TableHead className="w-[12%]">Phân loại</TableHead>
              <TableHead className="w-[12%]">Kích thước</TableHead>
              <TableHead className="w-[7%]">DPI</TableHead>
              <TableHead className="w-[7%]">Phiên bản</TableHead>
              <TableHead className="w-[15%]">Trạng thái</TableHead>
              <TableHead className="w-[10%]">Cập nhật</TableHead>
              <TableHead className="pr-4 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>

            {/* Loading skeleton */}
            {loading && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="text-center py-20">
                  <div className="flex items-center justify-center gap-3 text-muted-fg text-[15px]">
                    <RefreshCw size={20} className="animate-spin text-brand" />
                    Đang tải danh sách mẫu nhãn…
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-20">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
                      <FileText size={30} className="text-muted-fg" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-foreground text-[16px]">
                        {search ? 'Không tìm thấy kết quả' : 'Chưa có mẫu nhãn nào'}
                      </p>
                      <p className="text-muted-fg text-[13px] mt-1">
                        {search
                          ? `Không có mẫu nhãn nào khớp với "${search}"`
                          : 'Bấm "Thêm mẫu mới" để tạo mẫu nhãn đầu tiên.'}
                      </p>
                    </div>
                    {!search && (
                      <Button size="sm" onClick={() => { setEditTarget(null); setEditorOpen(true) }} className="gap-2">
                        <Plus size={16} /> Thêm mẫu mới
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Data rows */}
            {!loading && filtered.map(t => (
              <TableRow key={t.id}>
                {/* Template name + code + description */}
                <TableCell className="pl-6">
                  <p className="font-semibold text-foreground text-[15px] leading-tight">{t.name}</p>
                  {t.templateCode && (
                    <code className="text-[12px] text-muted-fg bg-surface-2 border border-border px-1.5 py-0.5 rounded mt-1 inline-block">
                      {t.templateCode}
                    </code>
                  )}
                  {t.description && (
                    <p className="text-muted-fg text-[13px] mt-0.5 truncate max-w-xs">{t.description}</p>
                  )}
                </TableCell>

                <TableCell><CategoryBadge category={t.category} /></TableCell>

                <TableCell>
                  <span className="font-mono text-[15px] text-foreground tabular-nums">
                    {t.labelWidth}×{t.labelHeight}<span className="text-muted-fg text-[12px] ml-1">mm</span>
                  </span>
                </TableCell>

                <TableCell>
                  <span className="font-mono text-[15px] text-muted-fg tabular-nums">{t.dpi}</span>
                </TableCell>

                <TableCell>
                  <span className="font-mono text-[15px] text-muted-fg tabular-nums">v{t.version}</span>
                </TableCell>

                <TableCell><TemplateBadge status={t.status} isDefault={t.isDefault} /></TableCell>

                <TableCell>
                  <span className="text-[13px] text-muted-fg">
                    {new Date(t.updatedAt).toLocaleDateString('vi-VN')}
                  </span>
                </TableCell>

                {/* Actions — grouped, all with tooltips, destructive separated */}
                <TableCell className="pr-4">
                  <div className="flex items-center gap-0.5 justify-end">
                    {/* View & Edit */}
                    <IconBtn id={`tpl-preview-${t.id}`} onClick={() => { setPreviewTarget(t); setPreviewOpen(true) }} title="Xem trước mẫu nhãn">
                      <Eye size={16} />
                    </IconBtn>
                    <IconBtn id={`tpl-edit-${t.id}`} onClick={() => { setEditTarget(t); setEditorOpen(true) }} title="Chỉnh sửa" brand>
                      <Edit2 size={16} />
                    </IconBtn>
                    <IconBtn id={`tpl-dup-${t.id}`} onClick={() => handleDuplicate(t.id)} title="Nhân bản">
                      <Copy size={16} />
                    </IconBtn>

                    {/* Visual separator */}
                    <span className="w-px h-5 bg-border mx-1" />

                    {/* Status transitions */}
                    {t.status !== 'published' && (
                      <IconBtn id={`tpl-publish-${t.id}`} onClick={() => handlePublish(t.id)} title="Phát hành" success>
                        <CheckCircle2 size={16} />
                      </IconBtn>
                    )}
                    {!t.isDefault && t.status === 'published' && (
                      <IconBtn id={`tpl-setdefault-${t.id}`} onClick={() => handleSetDefault(t.id)} title="Đặt làm mặc định">
                        <Star size={16} />
                      </IconBtn>
                    )}
                    {t.status !== 'archived' && (
                      <IconBtn id={`tpl-archive-${t.id}`} onClick={() => handleArchive(t.id)} title="Lưu trữ">
                        <Archive size={16} />
                      </IconBtn>
                    )}
                    <IconBtn id={`tpl-export-${t.id}`} onClick={() => handleExport(t)} title="Xuất file JSON">
                      <Download size={16} />
                    </IconBtn>

                    {/* Destructive — separated at end */}
                    {!t.isDefault && (
                      <>
                        <span className="w-px h-5 bg-border mx-1" />
                        <IconBtn id={`tpl-delete-${t.id}`} onClick={() => handleDelete(t.id)} title="Xóa mẫu nhãn" danger>
                          <Trash2 size={16} />
                        </IconBtn>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableEl>
      </div>

      {/* ── All Dialogs ─────────────────────────────────────────────────────── */}
      <TemplateEditorDialog
        open={editorOpen}
        template={editTarget}
        printers={printers}
        layoutType={layoutTab}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load() }}
      />
      <TemplatePreviewDialog
        open={previewOpen}
        template={previewTarget}
        onClose={() => setPreviewOpen(false)}
      />
      <PrintHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* Printer Assignment Dialog */}
      <Dialog open={assignOpen} onOpenChange={v => !v && setAssignOpen(false)}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground [box-shadow:var(--shadow-lg)]">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-[22px] font-semibold flex items-center gap-2">
              <Settings2 size={20} className="text-brand" />
              Phân bổ mẫu nhãn in
            </DialogTitle>
            <DialogDescription className="text-[13px] text-muted-fg">
              Gán mẫu nhãn in cụ thể cho từng thiết bị máy in. Bỏ trống để dùng mẫu mặc định hệ thống.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {printers.map(p => {
              const code = p.printerCode ?? p.PrinterCode
              return (
                <div key={code} className="flex items-center gap-4 bg-surface-2 border border-border rounded-xl p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-foreground truncate">
                      {p.displayName ?? p.DisplayName}
                    </p>
                    <p className="text-[12px] text-muted-fg font-mono mt-0.5">{code}</p>
                  </div>
                  <Select
                    value={assignSelections[code] ?? 'none'}
                    onValueChange={v => setAssignSelections(prev => ({ ...prev, [code]: v }))}
                  >
                    <SelectTrigger id={`assign-${code}`} className="w-56 h-10 text-[13px] bg-surface border-border text-foreground focus:ring-brand">
                      <SelectValue placeholder="Mặc định hệ thống" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-foreground">
                      <SelectItem value="none">— Mặc định hệ thống —</SelectItem>
                      {templates.filter(t => t.status === 'published').map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>

          <DialogFooter className="gap-3 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Hủy</Button>
            <Button id="assign-save-btn" onClick={handleSaveAssignments} disabled={assignSaving}>
              {assignSaving ? <RefreshCw size={14} className="animate-spin" /> : null}
              Lưu phân bổ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default LabelTemplatesTab
