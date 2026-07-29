import { useCallback, useEffect, useMemo, useState } from 'react'
import { templateApi } from '@/api/client'
import { LabelPreview } from '@/components/LabelPreview'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { RefreshCw, FileText, Eye, Pencil, Upload, Printer, Link2, Save } from 'lucide-react'

type Template = {
  id: string; name: string; description?: string; note?: string; status: string
  dpi: number; labelWidth: number; labelHeight: number; version: number
  isDefault?: boolean; isActive?: boolean; layoutType?: string; sheetColumns?: number
  sheetRows?: number; gapMm?: number; templateCode?: string; category?: string
  templateJson?: unknown
}
type Printer = { printerCode?: string; displayName?: string; status?: string; isReady?: boolean }
const field = (row: any, camel: string, pascal: string) => row?.[camel] ?? row?.[pascal]
const value = (v: unknown, fallback = '') => typeof v === 'string' || typeof v === 'number' ? String(v) : fallback
const jsonText = (v: unknown) => typeof v === 'string' ? v : JSON.stringify(v ?? {}, null, 2)
const demoData = { item_code: 'ITEM-DEMO-001', item_name: 'Sản phẩm demo', item_description: 'Nhãn kiểm thử', lot_number: 'LOT-20260727', quantity: '2', work_order: 'WO-DEMO-0001' }

export function LabelTemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [printers, setPrinters] = useState<Printer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Template | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'preview' | 'activate' | 'print' | null>(null)
  const [form, setForm] = useState<Partial<Template> & { templateJson: string }>({ templateJson: '' })
  const [zpl, setZpl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [printerCode, setPrinterCode] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [templatesResponse, printersResponse] = await Promise.all([templateApi.list(), templateApi.getPrintersReady()])
      setTemplates((templatesResponse.data ?? []).map((row: any) => ({
        ...row,
        id: value(field(row, 'id', 'Id')),
        name: value(field(row, 'name', 'Name'), 'Unnamed template'),
        status: value(field(row, 'status', 'Status'), 'unknown'),
        dpi: Number(field(row, 'dpi', 'Dpi') ?? 0),
        labelWidth: Number(field(row, 'labelWidth', 'LabelWidth') ?? 0),
        labelHeight: Number(field(row, 'labelHeight', 'LabelHeight') ?? 0),
        version: Number(field(row, 'version', 'Version') ?? 0),
        layoutType: value(field(row, 'layoutType', 'LayoutType'), '1UP'),
        sheetColumns: Number(field(row, 'sheetColumns', 'SheetColumns') ?? 1),
        sheetRows: Number(field(row, 'sheetRows', 'SheetRows') ?? 1),
        gapMm: Number(field(row, 'gapMm', 'GapMm') ?? 0),
      })))
      setPrinters((printersResponse.data ?? []).map((row: any) => ({
        ...row, printerCode: value(field(row, 'printerCode', 'PrinterCode')), displayName: value(field(row, 'displayName', 'DisplayName')),
        status: value(field(row, 'status', 'Status')), isReady: field(row, 'isReady', 'IsReady') === true
      })))
    } catch (err: any) { setError(err?.response?.data?.detail || err?.message || 'Không thể tải mẫu nhãn') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const open = async (template: Template, nextMode: typeof mode) => {
    setActionError(null); setMessage(null); setSelected(template); setMode(nextMode)
    try {
      const response = await templateApi.getById(template.id)
      const detail: any = response.data
      const normalized: Template = {
        ...template,
        id: value(field(detail, 'id', 'Id'), template.id),
        name: value(field(detail, 'name', 'Name'), template.name),
        description: value(field(detail, 'description', 'Description'), template.description),
        note: value(field(detail, 'note', 'Note'), template.note),
        status: value(field(detail, 'status', 'Status'), template.status),
        dpi: Number(field(detail, 'dpi', 'Dpi') ?? template.dpi),
        labelWidth: Number(field(detail, 'labelWidth', 'LabelWidth') ?? template.labelWidth),
        labelHeight: Number(field(detail, 'labelHeight', 'LabelHeight') ?? template.labelHeight),
        version: Number(field(detail, 'version', 'Version') ?? template.version),
        templateCode: value(field(detail, 'templateCode', 'TemplateCode'), template.templateCode),
        category: value(field(detail, 'category', 'Category'), template.category),
        templateJson: field(detail, 'templateJson', 'TemplateJson'),
        layoutType: value(field(detail, 'layoutType', 'LayoutType'), template.layoutType || '1UP'),
        sheetColumns: Number(field(detail, 'sheetColumns', 'SheetColumns') ?? template.sheetColumns ?? 1),
        sheetRows: Number(field(detail, 'sheetRows', 'SheetRows') ?? template.sheetRows ?? 1),
        gapMm: Number(field(detail, 'gapMm', 'GapMm') ?? template.gapMm ?? 0),
      }
      setSelected(normalized)
      setForm({ ...normalized, templateJson: jsonText(normalized.templateJson) })
      if (nextMode === 'preview') {
        const rendered = await templateApi.renderStored(template.id, demoData)
        setZpl(rendered.data.zpl || '')
      }
    } catch (err: any) { setActionError(err?.response?.data?.detail || err?.message || 'Không thể tải chi tiết mẫu nhãn') }
  }
  const close = () => { if (!busy) { setMode(null); setSelected(null); setZpl(''); setActionError(null) } }
  const run = async (action: () => Promise<unknown>, success: string, closeOnSuccess = false) => {
    setBusy(true); setActionError(null); setMessage(null)
    try {
      await action()
      setMessage(success)
      await load()
      if (closeOnSuccess) {
        setMode(null)
        setSelected(null)
        setZpl('')
        setActionError(null)
      }
    }
    catch (err: any) { setActionError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Thao tác thất bại') }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!selected) return
    try { JSON.parse(form.templateJson) } catch { setActionError('Template JSON không hợp lệ'); return }
    await run(() => templateApi.update(selected.id, {
      name: value(form.name, selected.name), description: value(form.description), note: value(form.note),
      dpi: Number(form.dpi), labelWidth: Number(form.labelWidth), labelHeight: Number(form.labelHeight),
      templateJson: form.templateJson, templateCode: value(form.templateCode), category: value(form.category),
      layoutType: value(form.layoutType, selected.layoutType || '1UP'), sheetColumns: Number(form.sheetColumns || 1),
      sheetRows: Number(form.sheetRows || 1), gapMm: Number(form.gapMm || 0)
    }), 'Đã lưu phiên bản mới của mẫu nhãn', true)
  }
  const publish = () => selected && run(() => templateApi.publish(selected.id), 'Đã publish mẫu nhãn')
  const activate = () => selected && printerCode && run(() => templateApi.activatePrinter(printerCode, selected.id, 'kiosk'), 'Đã kích hoạt mẫu cho máy in')
  const printTest = () => selected && printerCode && run(() => templateApi.printTest(selected.id, { printerCode, data: demoData, correlationId: `kiosk-template-${Date.now()}` }), 'Đã gửi lệnh in test')

  const layoutLabel = (t: Template) => `${t.layoutType || '1UP'} · ${t.sheetColumns || 1}×${t.sheetRows || 1}${t.gapMm ? ` · gap ${t.gapMm} mm` : ''}`
  const dialogTitle = useMemo(() => ({ view: 'Chi tiết mẫu nhãn', edit: 'Chỉnh sửa mẫu nhãn', preview: 'Xem trước mẫu nhãn', activate: 'Kích hoạt mẫu cho máy in', print: 'In thử mẫu nhãn' }[mode || 'view']), [mode])
  const editingTemplate = useMemo(() => ({
    ...selected,
    ...form,
    templateJson: form.templateJson,
    labelWidth: Number(form.labelWidth || selected?.labelWidth || 50),
    labelHeight: Number(form.labelHeight || selected?.labelHeight || 30),
    dpi: Number(form.dpi || selected?.dpi || 203),
    sheetColumns: Number(form.sheetColumns || selected?.sheetColumns || 1),
    sheetRows: Number(form.sheetRows || selected?.sheetRows || 1),
    gapMm: Number(form.gapMm || selected?.gapMm || 0),
  }), [form, selected])

  return <Card>
    <CardHeader className="flex flex-row items-center justify-between gap-4">
      <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Mẫu nhãn</CardTitle>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> Làm mới</Button>
    </CardHeader>
    <CardContent>
      {loading && <p className="text-sm text-muted-foreground">Đang tải mẫu nhãn...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && templates.length === 0 && <p className="text-sm text-muted-foreground">Chưa có mẫu nhãn.</p>}
      {!loading && !error && templates.length > 0 && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map(t => <div key={t.id} className="rounded-md border bg-card p-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-foreground">{t.name}</h3><p className="mt-1 min-h-10 text-sm text-muted-foreground">{t.description || 'Chưa có mô tả'}</p></div><span className="rounded border px-2 py-1 text-xs uppercase text-muted-foreground">{t.status}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground"><span>Kích thước: <b className="text-foreground">{t.labelWidth} × {t.labelHeight} mm</b></span><span>DPI: <b className="text-foreground">{t.dpi}</b></span><span>Bố cục: <b className="text-foreground">{layoutLabel(t)}</b></span><span>Phiên bản: <b className="text-foreground">v{t.version}</b></span></div>
          <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void open(t, 'view')}><Eye className="mr-1 h-3.5 w-3.5" /> Chi tiết</Button><Button size="sm" variant="outline" onClick={() => void open(t, 'preview')}><Eye className="mr-1 h-3.5 w-3.5" /> Preview</Button><Button size="sm" variant="outline" onClick={() => void open(t, 'edit')}><Pencil className="mr-1 h-3.5 w-3.5" /> Sửa</Button>{t.status.toLowerCase() !== 'published' && <Button size="sm" onClick={() => { setSelected(t); void run(() => templateApi.publish(t.id), 'Đã publish mẫu nhãn') }}><Upload className="mr-1 h-3.5 w-3.5" /> Publish</Button>}<Button size="sm" variant="outline" onClick={() => void open(t, 'activate')}><Link2 className="mr-1 h-3.5 w-3.5" /> Kích hoạt</Button><Button size="sm" variant="outline" onClick={() => void open(t, 'print')}><Printer className="mr-1 h-3.5 w-3.5" /> In thử</Button></div>
        </div>)}
      </div>}
      {message && <p className="mt-4 text-sm text-emerald-600">{message}</p>}
    </CardContent>

    <Dialog open={mode !== null} onOpenChange={value => !value && close()}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{dialogTitle}</DialogTitle><DialogDescription>{selected?.name} · {selected?.templateCode || 'no code'} · v{selected?.version}</DialogDescription></DialogHeader>
      {actionError && <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{actionError}</div>}
      {(mode === 'view' || mode === 'preview') && selected && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"><div><LabelPreview template={selected} data={demoData} width={Math.min(640, (selected.labelWidth / (selected.labelHeight || 30)) * 220)} /><div className="mt-3 rounded border bg-muted/30 p-3 text-xs"><b>Renderer output</b><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap">{zpl || 'Đang render...'}</pre></div></div><div className="space-y-2 text-sm"><p><b>Mô tả:</b> {selected.description || 'Chưa có mô tả'}</p><p><b>Kích thước:</b> {selected.labelWidth} × {selected.labelHeight} mm</p><p><b>Độ phân giải:</b> {selected.dpi} DPI</p><p><b>Bố cục:</b> {layoutLabel(selected)}</p><p><b>Trạng thái:</b> {selected.status}</p><p><b>Default:</b> {selected.isDefault ? 'Có' : 'Không'}</p><Button className="mt-3 w-full" variant="outline" onClick={() => void open(selected, 'edit')}><Pencil className="mr-2 h-4 w-4" /> Chỉnh sửa</Button></div></div>}
      {mode === 'edit' && <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm font-semibold">Template properties</p>
          <label className="block text-sm">Tên<input className="mt-1 w-full rounded border bg-background p-2" value={value(form.name)} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block text-sm">Mã<input className="mt-1 w-full rounded border bg-background p-2" value={value(form.templateCode)} onChange={e => setForm({ ...form, templateCode: e.target.value })} /></label>
          <label className="block text-sm">Mô tả<input className="mt-1 w-full rounded border bg-background p-2" value={value(form.description)} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-sm">Rộng (mm)<Input type="number" value={Number(form.labelWidth || 0)} onChange={e => setForm({ ...form, labelWidth: Number(e.target.value) })} /></label>
            <label className="text-sm">Cao (mm)<Input type="number" value={Number(form.labelHeight || 0)} onChange={e => setForm({ ...form, labelHeight: Number(e.target.value) })} /></label>
            <label className="text-sm">DPI<Input type="number" value={Number(form.dpi || 203)} onChange={e => setForm({ ...form, dpi: Number(e.target.value) })} /></label>
          </div>
          <label className="block text-sm">Bố cục<select className="mt-1 h-10 w-full rounded border bg-background px-2" value={value(form.layoutType, '1UP')} onChange={e => setForm({ ...form, layoutType: e.target.value, sheetColumns: e.target.value === '2UP' ? 2 : 1 })}><option value="1UP">1UP</option><option value="2UP">2UP</option></select></label>
          <label className="block text-sm">Template JSON<textarea className="mt-1 min-h-80 w-full rounded border bg-background p-2 font-mono text-xs" value={form.templateJson} onChange={e => setForm({ ...form, templateJson: e.target.value })} /></label>
        </div>
        <div className="rounded-md border bg-muted/20 p-3"><div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">Live preview</p><p className="text-xs text-muted-foreground">{Number(form.labelWidth || 0)} × {Number(form.labelHeight || 0)} mm · {Number(form.dpi || 203)} DPI</p></div><Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form })}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh</Button></div><div className="overflow-auto rounded border bg-slate-100 p-4"><LabelPreview template={editingTemplate} data={demoData} width={Math.min(520, Math.max(260, Number(form.labelWidth || 50) * 8))} /></div></div>
      </div>}
      {(mode === 'activate' || mode === 'print') && <div className="space-y-3"><p className="text-sm text-muted-foreground">Chỉ chọn máy in sẵn sàng. Kiosk gửi yêu cầu qua Kafka management boundary tới Printer Adapter.</p><select className="h-10 w-full rounded border bg-background px-2" value={printerCode} onChange={e => setPrinterCode(e.target.value)}><option value="">Chọn máy in</option>{printers.map(p => <option key={p.printerCode} value={p.printerCode}>{p.displayName || p.printerCode} · {p.status}</option>)}</select>{printers.length === 0 && <p className="text-sm text-amber-600">Không có máy in Online/sẵn sàng.</p>}</div>}
      <DialogFooter><Button variant="outline" onClick={close} disabled={busy}>Đóng</Button>{mode === 'edit' && <Button onClick={() => void save()} disabled={busy}><Save className="mr-2 h-4 w-4" /> Lưu phiên bản</Button>}{mode === 'view' && selected?.status.toLowerCase() !== 'published' && <Button onClick={() => void publish()} disabled={busy}><Upload className="mr-2 h-4 w-4" /> Publish</Button>}{mode === 'activate' && <Button onClick={() => void activate()} disabled={busy || !printerCode}><Link2 className="mr-2 h-4 w-4" /> Kích hoạt</Button>}{mode === 'print' && <Button onClick={() => void printTest()} disabled={busy || !printerCode}><Printer className="mr-2 h-4 w-4" /> In test</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </Card>
}
