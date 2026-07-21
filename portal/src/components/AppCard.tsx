import type { AppDefinition } from '../config/apps.ts';

interface AppCardProps {
  app: AppDefinition;
  index: number;
  onClick: () => void;
}

export default function AppCard({ app, index, onClick }: AppCardProps) {
  const isComingSoon = app.status === 'coming-soon';

  return (
    <div
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
      aria-label={`Open ${app.name}`}
      aria-disabled={isComingSoon}
    >
      {/* Glow effect */}
      <div className="app-card-glow" aria-hidden="true" />

      {/* Header */}
      <div className="app-card-header">
        <div className="app-card-icon">{app.icon}</div>
        <div className="app-card-badge" aria-label={`System: ${app.acronym}`}>
          {app.acronym}
        </div>
        {isComingSoon && (
          <div className="app-card-soon-badge">Sắp ra mắt</div>
        )}
      </div>

      {/* Content */}
      <div className="app-card-content">
        <h2 className="app-card-name">{app.name}</h2>
        <p className="app-card-desc">{app.description}</p>
      </div>

      {/* Footer */}
      <div className="app-card-footer">
        {isComingSoon ? (
          <span className="app-card-coming-text">Phase 2+</span>
        ) : (
          <span className="app-card-open-text">
            Mở hệ thống
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
