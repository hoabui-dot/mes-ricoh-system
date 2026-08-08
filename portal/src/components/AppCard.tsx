import type { AppDefinition } from '../config/apps.ts';
import { Boxes, Factory, ShieldCheck, ArrowUpRight, Monitor } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';

interface AppCardProps {
  app: AppDefinition;
  index: number;
  onClick: () => void;
}

export default function AppCard({ app, index, onClick }: AppCardProps) {
  const { t } = useI18n();
  const isComingSoon = app.status === 'coming-soon';
  const Icon = app.id === 'mes' ? Factory : app.id === 'wms' ? Boxes : app.id === 'kiosk' ? Monitor : ShieldCheck;

  return (
    <button
      type="button"
      className={`app-card ${isComingSoon ? 'app-card--disabled' : ''}`}
      role="listitem"
      style={{
        animationDelay: `${index * 80}ms`,
        '--card-color': app.color,
        '--card-color-to': app.colorTo,
      } as React.CSSProperties}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      tabIndex={isComingSoon ? -1 : 0}
      aria-label={`${t('portal.app.open')}: ${t(`portal.app.${app.id}.name`)}`}
      aria-disabled={isComingSoon}
    >
      <div className="app-card-glow" aria-hidden="true" />

      {/* Header */}
      <div className="app-card-header">
        <div className="app-card-icon"><Icon aria-hidden="true" /></div>
        <div className="app-card-badge" aria-label={`System: ${app.acronym}`}>
          {app.acronym}
        </div>
        {isComingSoon && (
          <div className="app-card-soon-badge">{t('portal.app.available')}</div>
        )}
      </div>

      {/* Content */}
      <div className="app-card-content">
        <h2 className="app-card-name">{t(`portal.app.${app.id}.name`)}</h2>
        <p className="app-card-desc">{t(`portal.app.${app.id}.description`)}</p>
      </div>

      {/* Footer */}
      <div className="app-card-footer">
        {isComingSoon ? (
          <span className="app-card-coming-text">Phase 2+</span>
        ) : (
          <span className="app-card-open-text">
            {t('portal.app.open')}
            <ArrowUpRight aria-hidden="true" />
          </span>
        )}
      </div>
    </button>
  );
}
