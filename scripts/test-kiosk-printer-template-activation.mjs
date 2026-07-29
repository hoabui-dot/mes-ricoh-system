#!/usr/bin/env node

const baseUrl = (process.env.KIOSK_URL || 'http://localhost:5007').replace(/\/$/, '')
const username = process.env.KIOSK_USERNAME || 'admin'
const password = process.env.KIOSK_PASSWORD || 'admin123'
const requestedPrinter = process.env.PRINTER_CODE?.trim().toLowerCase()
const requestedTemplate = process.env.TEMPLATE_ID?.trim()

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  let body = text
  try { body = text ? JSON.parse(text) : null } catch { /* keep text for diagnostics */ }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> HTTP ${response.status}: ${typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body)}`)
  return body
}

const value = (row, ...keys) => keys.map(key => row?.[key]).find(item => item !== undefined && item !== null)
const statusOf = row => String(value(row, 'Status', 'status') || '').toLowerCase()
const codeOf = row => String(value(row, 'PrinterCode', 'printerCode') || '')
const activeOf = row => value(row, 'IsActiveForWork', 'isActiveForWork') === true
const templateOf = row => value(row, 'ActiveTemplateId', 'activeTemplateId')

const login = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password }),
})
const token = login.token
if (!token) throw new Error('Login response did not contain a token')
const auth = { authorization: `Bearer ${token}` }

const [printers, templates] = await Promise.all([
  request('/api/printers', { headers: auth }),
  request('/api/label-templates?status=published', { headers: auth }),
])
const printerRows = Array.isArray(printers) ? printers : []
const templateRows = Array.isArray(templates) ? templates : []
const printer = printerRows.find(row => requestedPrinter
  ? codeOf(row).toLowerCase() === requestedPrinter
  : ['online', 'idle'].includes(statusOf(row)))
if (!printer) throw new Error(`No online printer found${requestedPrinter ? ` for ${requestedPrinter}` : ''}`)
if (!['online', 'idle'].includes(statusOf(printer))) throw new Error(`Printer ${codeOf(printer)} is not online: ${statusOf(printer)}`)

const template = templateRows.find(row => requestedTemplate
  ? String(value(row, 'Id', 'id')) === requestedTemplate
  : String(value(row, 'Status', 'status')).toLowerCase() === 'published')
if (!template) throw new Error('No published label template found')
const printerCode = codeOf(printer)
const templateId = String(value(template, 'Id', 'id'))

const activation = await request(`/api/printers/${encodeURIComponent(printerCode)}/activate`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ templateId, activatedBy: 'api-verification-script' }),
})
const after = await request('/api/printers', { headers: auth })
const saved = (Array.isArray(after) ? after : []).find(row => codeOf(row).toLowerCase() === printerCode.toLowerCase())
if (!saved || !activeOf(saved) || String(templateOf(saved)) !== templateId) {
  throw new Error(`Activation was not reflected by /api/printers: ${JSON.stringify(saved)}`)
}

console.log(JSON.stringify({
  success: true,
  source: 'Kiosk API data used by the unified printer card',
  printer: { code: printerCode, status: value(saved, 'Status', 'status'), activeForWork: activeOf(saved) },
  template: { id: templateId, name: value(template, 'Name', 'name'), status: value(template, 'Status', 'status') },
  activation,
}, null, 2))
