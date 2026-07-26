import React from 'react'
import { useTranslation } from 'react-i18next'
import { Construction } from 'lucide-react'

interface PlaceholderPageProps {
  module: string
  page: string
}

export function PlaceholderPage({ module, page }: PlaceholderPageProps) {
  const { t } = useTranslation()

  return (
    <div className="fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 16 }}>
      <div style={{
        width: 56, height: 56, borderRadius: 12,
        background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#F97316',
      }}>
        <Construction size={24} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
          {t(`nav.${page.toLowerCase()}`, page)}
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
          {t(`nav.${module.toLowerCase()}`, module)} {t('common.loading')}
        </p>
      </div>
    </div>
  )
}
