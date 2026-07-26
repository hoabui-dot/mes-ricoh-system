import React from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/common'
import { Activity, ShieldAlert, Cpu, Server } from 'lucide-react'

interface NodeProps {
  name: string
  status: 'online' | 'offline' | 'warning' | 'critical'
  details: string
  workers: number
}

const TopologyNode: React.FC<NodeProps> = ({ name, status, details, workers }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'online': return '#10B981'
      case 'warning': return '#F59E0B'
      case 'critical': return '#EF4444'
      default: return '#6B7280'
    }
  }

  return (
    <div className="card" style={{ padding: 16, borderLeft: `4px solid ${getStatusColor()}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{name}</h4>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: getStatusColor(),
          boxShadow: `0 0 8px ${getStatusColor()}`
        }} />
      </div>
      <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{details}</p>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-secondary)' }}>
        <span>{workers} workers</span>
        <span style={{ textTransform: 'capitalize' }}>{status}</span>
      </div>
    </div>
  )
}

export function FactoryPage() {
  const { t } = useTranslation()

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.factory')}
        description="Visual manufacturing topology and equipment hierarchy status"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 24, minHeight: '60vh' }}>
        {/* Hierarchy Tree */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700 }}>Hierarchy Navigation</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-brand-orange)' }}>
              <Server size={16} /> Plant Alpha
            </div>
            <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={14} /> Assembly Area
              </div>
              <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <div style={{ color: '#10B981' }}>Line A (Running)</div>
                <div style={{ color: '#10B981' }}>Line B (Running)</div>
              </div>
              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={14} /> Packaging Area
              </div>
              <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <div style={{ color: '#F59E0B' }}>Line C (Warning)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Nodes Grid */}
        <div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ padding: '12px 20px', flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Activity style={{ color: '#10B981' }} />
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Online Equipment</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>24 / 26 Nodes</div>
              </div>
            </div>
            <div className="card" style={{ padding: '12px 20px', flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShieldAlert style={{ color: '#EF4444' }} />
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Critical Alarms</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>0 Alarms</div>
              </div>
            </div>
          </div>

          <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700 }}>Active Station Status</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            <TopologyNode name="Station A1 - Marking" status="online" details="Job: Marking Order #1002" workers={3} />
            <TopologyNode name="Station A2 - Printing" status="online" details="Job: Printing Lot #44" workers={2} />
            <TopologyNode name="Station A3 - Inspection" status="online" details="Job: Verification Check" workers={1} />
            <TopologyNode name="Station B1 - Assembly" status="online" details="Job: Main Assembly" workers={4} />
            <TopologyNode name="Station B2 - Testing" status="warning" details="High sensor temperature detected" workers={2} />
            <TopologyNode name="Station C1 - Packing" status="offline" details="No active job allocated" workers={0} />
          </div>
        </div>
      </div>
    </div>
  )
}
