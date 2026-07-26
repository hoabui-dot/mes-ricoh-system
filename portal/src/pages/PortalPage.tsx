import { useEffect, useState } from 'react';
import type Keycloak from 'keycloak-js';
import { APPS, ROLE_DISPLAY, type AppDefinition } from '../config/apps.ts';
import AppCard from '../components/AppCard.tsx';
import UserBadge from '../components/UserBadge.tsx';
import '../styles/portal.css';
import { SUPPORTED_LOCALES, languageNames, useI18n } from '@mom-platform/i18n-ui-shared';
import { getVisibleApps, resolvePortalApps } from '../lib/appResolution.ts';
import { Languages, Moon, ShieldAlert, Sun } from 'lucide-react';

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
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('mom-portal-theme') as 'dark' | 'light') || 'dark');
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

  useEffect(() => {
    localStorage.setItem('mom-portal-theme', theme);
  }, [theme]);

  if (appDecision.kind === 'redirect') {
    return (
      <div className={`portal-root portal-theme-${theme}`}>
        <main className="portal-main">
          <div className="portal-empty" role="status">
            <h2>{t('portal.redirecting')}</h2>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`portal-root portal-theme-${theme}`}>
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
            <div className="portal-brand-logo" aria-label="S-Factory logo">
              <span>W</span>
            </div>
            <div>
              <div className="portal-brand-name">S-Factory</div>
              <div className="portal-brand-sub">MOM Platform</div>
            </div>
          </div>
          <div className="portal-header-actions">
            <div className="portal-language-control" aria-label={t('portal.language')}>
              <Languages aria-hidden="true" />
              {SUPPORTED_LOCALES.map((item) => (
                <button key={item} type="button" className={locale === item ? 'is-active' : ''} onClick={() => setLocale(item)} title={languageNames[item]} aria-pressed={locale === item}>{item.toUpperCase()}</button>
              ))}
            </div>
            <button type="button" className="portal-icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? t('portal.theme.light') : t('portal.theme.dark')} title={theme === 'dark' ? t('portal.theme.light') : t('portal.theme.dark')}>
              {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
            <UserBadge username={username} email={email} roleDisplay={roleDisplay} onLogout={handleLogout} />
          </div>
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
            <ShieldAlert className="portal-empty-icon" aria-hidden="true" />
            <h2>{t('portal.noAccess')}</h2>
            <p>{t('portal.noAccessBody')}</p>
          </div>
        )}

        {/* ── Platform Info Footer ── */}
        <footer className="portal-footer">
          <div className="portal-footer-info">
            <span>{t('portal.footer.version')}</span>
            <span className="portal-footer-sep">·</span>
            <span>{t('portal.footer.phase')}</span>
            <span className="portal-footer-sep">·</span>
            <span>{t('portal.footer.site')}</span>
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
