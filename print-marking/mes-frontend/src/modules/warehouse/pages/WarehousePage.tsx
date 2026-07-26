import React from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader, StatisticCard } from '@/components/common'
import { Layers, FileText, Share2, Clipboard } from 'lucide-react'

export function WarehousePage() {
  const { t } = useTranslation()

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.warehouse')}
        description="Monitor stock availability, material inventory, and finished goods release"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatisticCard label="Material SKU Count" value="142" icon={<Layers size={16} />} color="#3B82F6" />
        <StatisticCard label="Total Items in Stock" value="84,204" icon={<Clipboard size={16} />} color="#3B82F6" />
        <StatisticCard label="Reserved Materials" value="12,482" icon={<FileText size={16} />} color="#F59E0B" />
        <StatisticCard label="Shipped Today" value="4,100" icon={<Share2 size={16} />} color="#10B981" />
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700 }}>Critical Low Stock Alerts</h3>
        <table className="mes-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Material Name</th>
              <th>Minimum Limit</th>
              <th>Available Stock</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontFamily: 'var(--font-mono)' }}>MAT-AL-04</td>
              <td>Aluminum Plates Type A</td>
              <td>500 units</td>
              <td style={{ color: '#EF4444', fontWeight: 600 }}>120 units</td>
              <td><span className="badge badge-danger">Reorder Required</span></td>
            </tr>
            <tr>
              <td style={{ fontFamily: 'var(--font-mono)' }}>LBL-PR-12</td>
              <td>Thermal Print Labels 4x6</td>
              <td>1,200 units</td>
              <td style={{ color: '#F59E0B', fontWeight: 600 }}>850 units</td>
              <td><span className="badge badge-warning">Low Stock Warning</span></td>
            </tr>
            <tr>
              <td style={{ fontFamily: 'var(--font-mono)' }}>INK-BL-01</td>
              <td>Industrial Black Ink 1L</td>
              <td>50 bottles</td>
              <td style={{ color: '#F59E0B', fontWeight: 600 }}>42 bottles</td>
              <td><span className="badge badge-warning">Low Stock Warning</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
