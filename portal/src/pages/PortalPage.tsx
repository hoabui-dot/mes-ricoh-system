import type Keycloak from 'keycloak-js';
import { APPS, ROLE_DISPLAY, type AppDefinition } from '../config/apps.ts';
import AppCard from '../components/AppCard.tsx';
import UserBadge from '../components/UserBadge.tsx';
import '../styles/portal.css';

interface PortalPageProps {
  keycloak: Keycloak;
}

function getUserRoles(keycloak: Keycloak): string[] {
  try {
    const parsed = keycloak.tokenParsed as Record<string, unknown> | undefined;
    const realmAccess = parsed?.['realm_access'] as { roles?: string[] } | undefined;
    return realmAccess?.roles ?? [];
  } catch {
    return [];
  }
}

function getVisibleApps(roles: string[]): AppDefinition[] {
  return APPS.filter((app) =>
    app.allowedRoles.some((role) => roles.includes(role)),
  );
}

export default function PortalPage({ keycloak }: PortalPageProps) {
  const roles = getUserRoles(keycloak);
  const visibleApps = getVisibleApps(roles);
  const username =
    (keycloak.tokenParsed as Record<string, unknown> | undefined)?.['preferred_username'] as string | undefined ??
    'User';
  const email =
    (keycloak.tokenParsed as Record<string, unknown> | undefined)?.['email'] as string | undefined ?? '';
  const primaryRole = roles[0] ?? 'OPERATOR';
  const roleDisplay = ROLE_DISPLAY[primaryRole] ?? primaryRole;

  const handleLogout = () => {
    void keycloak.logout({
      redirectUri: window.location.origin,
    });
  };

  const handleAppClick = (app: AppDefinition) => {
    if (app.status === 'coming-soon') return;
    // SSO: redirect to cluster URL — Keycloak SSO session handles re-auth silently
    window.open(app.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="portal-root">
      {/* ── Background ── */}
      <div className="portal-bg" aria-hidden="true">
        <div className="portal-bg-orb portal-bg-orb-1" />
        <div className="portal-bg-orb portal-bg-orb-2" />
        <div className="portal-bg-orb portal-bg-orb-3" />
      </div>

      {/* ── Header ── */}
      <header className="portal-header">
        <div className="portal-header-inner">
          <div className="portal-brand">
            <div className="portal-brand-logo" aria-label="Won Seal Tech logo">
              <span>W</span>
            </div>
            <div>
              <div className="portal-brand-name">Won Seal Tech</div>
              <div className="portal-brand-sub">MOM Platform</div>
            </div>
          </div>
          <UserBadge
            username={username}
            email={email}
            roleDisplay={roleDisplay}
            onLogout={handleLogout}
          />
        </div>
      </header>

      {/* ── Main ── */}
      <main className="portal-main">
        <div className="portal-welcome">
          <h1 className="portal-title">
            Xin chào, <span className="portal-title-name">{username}</span>
          </h1>
          <p className="portal-subtitle">
            Chọn hệ thống bạn muốn làm việc hôm nay
          </p>
          <div className="portal-role-badge">
            <span className="portal-role-dot" />
            {roleDisplay}
          </div>
        </div>

        {/* ── App Grid ── */}
        <div
          className="portal-app-grid"
          role="list"
          aria-label="Available applications"
        >
          {visibleApps.map((app, index) => (
            <AppCard
              key={app.id}
              app={app}
              index={index}
              onClick={() => handleAppClick(app)}
            />
          ))}
        </div>

        {visibleApps.length === 0 && (
          <div className="portal-empty" role="alert">
            <span style={{ fontSize: '3rem' }}>🔒</span>
            <h2>Không có quyền truy cập</h2>
            <p>Tài khoản của bạn chưa được cấp quyền vào hệ thống nào. Liên hệ quản trị viên.</p>
          </div>
        )}

        {/* ── Platform Info Footer ── */}
        <footer className="portal-footer">
          <div className="portal-footer-info">
            <span>MOM Platform v1.0.0</span>
            <span className="portal-footer-sep">·</span>
            <span>Phase 0 — Platform Foundation</span>
            <span className="portal-footer-sep">·</span>
            <span>Kizuna 3, Long An</span>
          </div>
          <div className="portal-footer-status">
            <span className="portal-status-dot" />
            All systems operational
          </div>
        </footer>
      </main>
    </div>
  );
}
