import React from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader, StatisticCard } from '@/components/common'
import { CheckCircle2, AlertOctagon, TrendingUp, Percent } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

const data = [
  { name: '06:00', rate: 98.2 },
  { name: '08:00', rate: 99.1 },
  { name: '10:00', rate: 97.5 },
  { name: '12:00', rate: 98.8 },
  { name: '14:00', rate: 99.3 },
  { name: '16:00', rate: 98.7 },
]

export function QualityPage() {
  const { t } = useTranslation()

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.quality')}
        description="Inspect yield rates, defect logs, and real-time pass-fail metrics"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatisticCard label="Average Yield" value="98.7%" icon={<Percent size={16} />} color="#10B981" />
        <StatisticCard label="Passed Items" value="1,482" icon={<CheckCircle2 size={16} />} color="#10B981" />
        <StatisticCard label="Defected Items" value="19" icon={<AlertOctagon size={16} />} color="#EF4444" />
        <StatisticCard label="Defect Rate" value="1.28%" icon={<TrendingUp size={16} />} color="#F59E0B" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700 }}>Quality Pass Rate Trend</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={11} />
                <YAxis domain={[95, 100]} stroke="var(--color-text-muted)" fontSize={11} />
                <Tooltip />
                <Area type="monotone" dataKey="rate" stroke="#10B981" fill="rgba(16,185,129,0.1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700 }}>Top Defect Types</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span>Dimension Out of Specs</span>
                <span style={{ fontWeight: 600 }}>8 cases (42%)</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '42%', background: '#EF4444' }} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span>Surface Scratch</span>
                <span style={{ fontWeight: 600 }}>6 cases (31%)</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '31%', background: '#F59E0B' }} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span>Label Misalignment</span>
                <span style={{ fontWeight: 600 }}>5 cases (27%)</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '27%', background: '#3B82F6' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
