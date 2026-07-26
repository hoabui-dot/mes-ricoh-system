import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Users, HardHat, Factory, GitBranch,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, Activity, Zap, Cpu, Server, Clipboard
} from 'lucide-react'
import { PageHeader, SectionHeader, Spinner } from '@/components/common'
import { RealtimeDot, ConnectionBadge } from '@/components/industrial/StatusComponents'
import { apiGet } from '@/services/api-client'
import type { DashboardSnapshot } from '@/types/domain'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

function useDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'snapshot'],
    queryFn: () => apiGet<DashboardSnapshot>('/projection/dashboard'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

function useSSEDashboard(onUpdate: (data: DashboardSnapshot) => void) {
  const [connected, setConnected] = React.useState(false)

  React.useEffect(() => {
    const token = localStorage.getItem('mes_access_token')
    if (!token) return

    const es = new EventSource(`/api/v1/projection/stream?token=${token}`)

    es.onopen = () => setConnected(true)

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as DashboardSnapshot
        onUpdate(data)
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      setConnected(false)
    }
  }, [onUpdate])

  return { connected }
}

const mockChartData = [
  { time: '08:00', compliance: 95, rate: 240 },
  { time: '09:00', compliance: 97, rate: 280 },
  { time: '10:00', compliance: 94, rate: 260 },
  { time: '11:00', compliance: 98, rate: 310 },
  { time: '12:00', compliance: 99, rate: 290 },
  { time: '13:00', compliance: 96, rate: 300 },
]

export function DashboardPage() {
  const { t } = useTranslation()
  const { data: res, isLoading } = useDashboard()
  const [liveData, setLiveData] = React.useState<DashboardSnapshot | null>(null)

  const handleSSEUpdate = React.useCallback((data: DashboardSnapshot) => {
    setLiveData(data)
  }, [])

  const { connected } = useSSEDashboard(handleSSEUpdate)
  const snapshot = liveData ?? res?.data

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Command Center Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: 'var(--color-text-primary)' }}>
            {t('dashboard.title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            {t('dashboard.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ConnectionBadge connected={connected} />
        </div>
      </div>

      {/* Zone 1: Industrial KPI Metric Dashboard */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 16,
      }}>
        {/* Workers Status */}
        <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22C55E' }}>
            <Users size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>
              {t('dashboard.kpi.workersOnline')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{snapshot?.workers_online ?? 0}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6' }}>
            <HardHat size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>
              {t('dashboard.kpi.workersAvailable')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{snapshot?.workers_available ?? 0}</div>
          </div>
        </div>

        {/* Orders status */}
        <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(249,115,22,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F97316' }}>
            <Factory size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>
              {t('dashboard.kpi.productionOrders')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{snapshot?.production_orders?.total ?? 0}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A855F7' }}>
            <GitBranch size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>
              {t('dashboard.kpi.activeAssignments')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{snapshot?.assignment_stats?.total ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Primary Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Left Side: Zone 2 - Production Monitoring */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('dashboard.zones.productionMonitoring')}
              </h3>
              <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
                <span>Running: {snapshot?.production_orders?.in_progress ?? 0}</span>
                <span>•</span>
                <span>Delayed: {snapshot?.production_orders?.delayed ?? 0}</span>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="mes-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Workers</th>
                    <th>Available</th>
                    <th>Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot?.department_distribution?.map((dept) => (
                    <tr key={dept.department_id}>
                      <td style={{ fontWeight: 600 }}>{dept.department_name}</td>
                      <td>{dept.worker_count}</td>
                      <td style={{ color: '#22C55E' }}>{dept.available}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 80, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${dept.utilization_rate}%`,
                              background: dept.utilization_rate > 90 ? '#EF4444' : dept.utilization_rate > 70 ? '#F59E0B' : '#22C55E',
                              borderRadius: 3
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{dept.utilization_rate.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!snapshot?.department_distribution || snapshot.department_distribution.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '20px 0' }}>
                        {t('common.noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Current Shift */}
          {snapshot?.current_shift && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                  Current Shift Operations
                </h4>
                <span className="badge badge-success">Active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Clock size={16} style={{ color: 'var(--color-brand-orange)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{snapshot.current_shift.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {snapshot.current_shift.start_time} - {snapshot.current_shift.end_time}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {snapshot.current_shift.assigned_workers} / {snapshot.current_shift.total_capacity}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Workers Assigned</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Zone 3 & 4 - Factory Topology & Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Topology Node Summary */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>
              {t('dashboard.zones.factoryTopology')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Server size={14} style={{ color: 'var(--color-brand-orange)' }} /> Plant Alpha
                </span>
                <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>96% Healthy</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 12, borderLeft: '1px solid var(--color-border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>Assembly Area</span>
                  <span style={{ color: '#10B981' }}>Online</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>Packaging Area</span>
                  <span style={{ color: '#F59E0B' }}>Warning</span>
                </div>
              </div>
            </div>
          </div>

          {/* Realtime Events timeline */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>
              {t('dashboard.zones.realtimeEvents')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ color: '#22C55E', fontWeight: 600 }}>06:00</span>
                <div>
                  <div style={{ fontWeight: 500 }}>Shift Started</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Morning Shift A initialized</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ color: '#3B82F6', fontWeight: 600 }}>08:15</span>
                <div>
                  <div style={{ fontWeight: 500 }}>Worker Assigned</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Operator assigned to Station A1</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ color: '#F59E0B', fontWeight: 600 }}>09:30</span>
                <div>
                  <div style={{ fontWeight: 500 }}>High Temperature</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Station B2 reported warning limit</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zone 5: Analytics Charts */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 700, textTransform: 'uppercase' }}>
          {t('dashboard.zones.analytics')}
        </h3>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <AreaChart data={mockChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" stroke="var(--color-text-muted)" fontSize={11} />
              <YAxis stroke="var(--color-text-muted)" fontSize={11} />
              <Tooltip />
              <Area type="monotone" dataKey="rate" name="Production Rate" stroke="var(--color-brand-orange)" fill="rgba(249,115,22,0.08)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {isLoading && !snapshot && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <Spinner size={32} />
        </div>
      )}
    </div>
  )
}
