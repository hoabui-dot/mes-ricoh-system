import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, AlertTriangle, CheckCircle2, CircleOff, Database, Printer, RefreshCw, Wifi } from 'lucide-react'
import './styles.css'

type Json = any
const get = async (path: string): Promise<Json> => { const r = await fetch(path); if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json() }
const label = (value: unknown) => typeof value === 'string' && value ? value : 'Unknown'
const defaultSummary = {
  status: 'Starting', timestamp: null,
  printerAdapter: { status: 'Not connected', responseTimeMs: null, baseUrl: 'Waiting for adapter' },
  kafka: { status: 'Not connected', bootstrapServers: 'Waiting for broker', clientId: 'Not configured' },
  cups: { status: 'Not checked', queue: 'Waiting for adapter', driverStatus: 'Waiting for probe' },
  printers: { total: 0, online: 0, offline: 0, error: 0 }
}

function State({ value }: { value: string }) {
  const cls = value.toLowerCase().replace(/\s+/g, '-')
  return <span className={`state state-${cls}`}>{value}</span>
}

export default function App() {
  const [summary, setSummary] = useState<Json | null>(null)
  const [printers, setPrinters] = useState<Json[]>([])
  const [queues, setQueues] = useState<Json[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [updated, setUpdated] = useState<Date | null>(null)
  const refresh = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([get('/api/monitoring/summary'), get('/api/monitoring/printers'), get('/api/monitoring/kafka/queues')])
    const [summaryResult, printersResult, queuesResult] = results
    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value)
    if (printersResult.status === 'fulfilled') setPrinters(Array.isArray(printersResult.value) ? printersResult.value : [])
    if (queuesResult.status === 'fulfilled') setQueues(Array.isArray(queuesResult.value) ? queuesResult.value : [])
    setError(results.some((result) => result.status === 'rejected') ? 'Live monitoring data is temporarily unavailable. Showing defaults.' : '')
    setUpdated(new Date())
    setLoading(false)
  }, [])
  useEffect(() => { refresh(); const id = window.setInterval(refresh, 5000); return () => window.clearInterval(id) }, [refresh])
  const view = summary ?? defaultSummary
  const counts = view.printers
  return <main className="shell">
    <header className="header"><div><p className="eyebrow">PRINT STATION / OPERATIONS</p><h1>Printer Adapter Monitoring</h1><p className="muted">Read-only runtime view for adapter, broker, CUPS, and physical printers.</p></div><button className="refresh" onClick={refresh}><RefreshCw size={16}/> Refresh</button></header>
    {(error || loading) && <div className={`notice ${error ? 'error' : 'info'}`}><AlertTriangle size={18}/> {error || 'Connecting to monitoring services...'}</div>}
    <section className="cards">
      <article className="card"><div className="card-title"><Activity size={18}/> Overall</div><State value={label(view.status)}/><strong>{view.timestamp ? new Date(view.timestamp).toLocaleTimeString() : 'Waiting'}</strong><small>5 second refresh</small></article>
      <article className="card"><div className="card-title"><Printer size={18}/> Printer Adapter</div><State value={label(view.printerAdapter.status)}/><strong>{view.printerAdapter.responseTimeMs ?? '—'} ms</strong><small>{view.printerAdapter.baseUrl}</small></article>
      <article className="card"><div className="card-title"><Wifi size={18}/> Kafka</div><State value={label(view.kafka.status)}/><strong>{view.kafka.bootstrapServers ?? '—'}</strong><small>{view.kafka.clientId ?? '—'}</small></article>
      <article className="card"><div className="card-title"><Database size={18}/> CUPS</div><State value={label(view.cups.status)}/><strong>{view.cups.queue}</strong><small>{view.cups.driverStatus}</small></article>
    </section>
    <section className="topology"><div className="node"><Wifi/><b>Kafka</b><State value={label(view.kafka.status)}/></div><div className="connector"/><div className="node"><Activity/><b>Printer Adapter</b><State value={label(view.printerAdapter.status)}/></div><div className="connector"/><div className="node"><Printer/><b>CUPS / TCP</b><State value={label(view.cups.status)}/></div></section>
    <section className="section"><div className="section-heading"><div><h2>Registered Printers</h2><p className="muted">{counts.total} total / {counts.online} online / {counts.offline} offline / {counts.error} error</p></div><span className="updated">{updated ? `Updated ${updated.toLocaleTimeString()}` : 'Loading...'}</span></div><div className="table-wrap"><table><thead><tr><th>Printer</th><th>Driver</th><th>Endpoint / Queue</th><th>Status</th><th>Production</th><th>Heartbeat</th></tr></thead><tbody>{printers.map((p) => <tr key={p.printerCode}><td><b>{p.printerCode}</b><small>{p.displayName}</small></td><td>{p.driverType}</td><td><small>{p.driverType === 'cups' ? p.cupsQueueName : `${p.ipAddress}:${p.port}`}</small></td><td><State value={label(p.status)}/></td><td>{p.isActiveForWork ? <span className="good"><CheckCircle2 size={15}/> Active</span> : <span className="muted"><CircleOff size={15}/> Not active</span>}</td><td>{p.lastHeartbeatAt ? new Date(p.lastHeartbeatAt).toLocaleString() : 'Missing'}</td></tr>)}</tbody></table>{printers.length === 0 && <div className="empty">No registered printer data available.</div>}</div></section>
    <section className="section"><div className="section-heading"><div><h2>Kafka transport</h2><p className="muted">Read-only transport health comes from the Printer Adapter. Kafka is not queried through RabbitMQ Management API endpoints.</p></div></div><div className="queue-grid">{queues.map((q) => <div className="queue" key={q.bootstrapServers ?? 'kafka'}><b>{q.bootstrapServers ?? 'Kafka'}</b><span>Client: {q.clientId ?? '—'}</span><span>Group: {q.consumerGroup ?? '—'}</span><span>Status: {q.status ?? 'Unavailable'}</span></div>)}{queues.length === 0 && <div className="empty">Kafka topology unavailable.</div>}</div></section>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
