import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, Shield, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SUPPORTED_LOCALES, languageNames, useI18n, type SupportedLocale } from '@mom-platform/i18n-ui-shared';
import { Button } from './ui';

const localeLabels: Record<SupportedLocale, string> = {
  vi: 'VI',
  en: 'EN',
  ja: 'JA',
  ko: 'KO',
};

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('mes-console-theme') as 'dark' | 'light') || 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('mes-light', theme === 'light');
    localStorage.setItem('mes-console-theme', theme);
  }, [theme]);

  return (
    <header className="h-16 bg-primary border-b border-border px-6 flex items-center justify-between sticky top-0 z-40 shadow-[0_12px_32px_rgba(2,6,23,0.28)]">
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 bg-action rounded-md flex items-center justify-center font-black text-action-foreground shadow-lg shadow-orange-600/25">
          W
        </div>
        <div>
          <h1 className="text-base font-bold text-primary-foreground">S-Factory — MES Console</h1>
          <p className="text-xs text-primary-foreground/75">{t('navbar.subtitle')}</p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center gap-2 text-xs text-primary-foreground/80">
          <span>{t('navbar.language')}</span>
          <div className="inline-flex rounded-md border border-primary-foreground/25 bg-primary/40 p-1" role="group" aria-label={t('navbar.language')}>
            {SUPPORTED_LOCALES.map((item) => (
              <Button
                key={item}
                variant={locale === item ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLocale(item)}
                title={languageNames[item]}
                aria-pressed={locale === item}
                className="min-w-9 px-2 text-[11px]"
              >
                {localeLabels[item]}
              </Button>
            ))}
          </div>
        </div>
        <Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} variant="ghost" size="icon" title={theme === 'dark' ? t('navbar.lightMode') : t('navbar.darkMode')} aria-label={theme === 'dark' ? t('navbar.lightMode') : t('navbar.darkMode')}>
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <div className="flex items-center space-x-3 rounded-md border border-primary-foreground/20 bg-primary/35 px-3 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary-foreground/20 bg-primary text-action">
            <User className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-primary-foreground">{user?.username}</div>
            <div className="flex items-center space-x-1 font-mono text-[10px] text-action">
              <Shield className="w-3 h-3" />
              <span>{user?.roles[0] || 'OPERATOR'}</span>
            </div>
          </div>
        </div>

        <Button
          onClick={logout}
          variant="ghost"
          size="icon"
          className="text-slate-300 hover:border-rose-800 hover:bg-rose-950/60 hover:text-rose-300"
          title={t('navbar.logout')}
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
};
