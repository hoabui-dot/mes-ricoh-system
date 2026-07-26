import React from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader, StatisticCard } from '@/components/common'
import { BarChart3, TrendingUp, Cpu, Calendar } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

const data = [
  { name: 'Mon', target: 200, actual: 198 },
  { name: 'Tue', target: 200, actual: 205 },
  { name: 'Wed', target: 200, actual: 185 },
  { name: 'Thu', target: 200, actual: 210 },
  { name: 'Fri', target: 200, actual: 215 },
  { name: 'Sat', target: 120, actual: 124 },
]

export function AnalyticsPage() {
  const { t } = useTranslation()

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.analytics')}
        description="Analyze historical performance, capacity, and production metrics"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatisticCard label="Weekly Efficiency" value="96.4%" icon={<TrendingUp size={16} />} color="#10B981" />
        <StatisticCard label="Average Production/Hr" value="284 units" icon={<Cpu size={16} />} color="#3B82F6" />
        <StatisticCard label="Target Compliance" value="98.5%" icon={<Calendar size={16} />} color="#10B981" />
        <StatisticCard label="Planned Idle Time" value="4.2 hrs" icon={<BarChart3 size={16} />} color="#F59E0B" />
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700 }}>Weekly Target vs Actual Production Output</h3>
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={11} />
              <YAxis stroke="var(--color-text-muted)" fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="target" name="Target Output" fill="#475569" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual Output" fill="#F97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
