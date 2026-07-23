import { useEffect } from 'react';
import type Keycloak from 'keycloak-js';
import { APPS, ROLE_DISPLAY, type AppDefinition } from '../config/apps.ts';
import AppCard from '../components/AppCard.tsx';
import UserBadge from '../components/UserBadge.tsx';
import '../styles/portal.css';
import { SUPPORTED_LOCALES, languageNames, useI18n, type SupportedLocale } from '@mom-platform/i18n-ui-shared';
import { getVisibleApps, resolvePortalApps } from '../lib/appResolution.ts';

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

export default function PortalPage({ keycloak }: PortalPageProps) {
  const { locale, setLocale, t } = useI18n();
  const roles = getUserRoles(keycloak);
  const visibleApps = getVisibleApps(roles, APPS);
  const appDecision = resolvePortalApps(visibleApps);
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

  useEffect(() => {
    if (appDecision.kind !== 'redirect') return;
    window.location.assign(appDecision.app.url);
  }, [appDecision]);

  if (appDecision.kind === 'redirect') {
    return (
      <div className="portal-root">
        <main className="portal-main">
          <div className="portal-empty" role="status">
            <h2>{t('portal.redirecting')}</h2>
          </div>
        </main>
      </div>
    );
  }

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
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as SupportedLocale)}
            aria-label={t('navbar.language')}
            style={{ marginLeft: '1rem' }}
          >
            {SUPPORTED_LOCALES.map((item) => <option key={item} value={item}>{languageNames[item]}</option>)}
          </select>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="portal-main">
        <div className="portal-welcome">
          <h1 className="portal-title">
            {t('portal.hello', { username })}
          </h1>
          <p className="portal-subtitle">
            {t('portal.choose')}
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
          {appDecision.apps.map((app, index) => (
            <AppCard
              key={app.id}
              app={app}
              index={index}
              onClick={() => handleAppClick(app)}
            />
          ))}
        </div>

        {appDecision.kind === 'none' && (
          <div className="portal-empty" role="alert">
            <span style={{ fontSize: '3rem' }}>🔒</span>
            <h2>{t('portal.noAccess')}</h2>
            <p>{t('portal.noAccessBody')}</p>
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
            {t('portal.operational')}
          </div>
        </footer>
      </main>
    </div>
  );
}
