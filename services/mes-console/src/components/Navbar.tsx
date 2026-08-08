import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Menu, User, Shield, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SUPPORTED_LOCALES, languageNames, useI18n, type SupportedLocale } from '@mom-platform/i18n-ui-shared';
import { Button } from './ui';

const localeLabels: Record<SupportedLocale, string> = {
  vi: 'VI',
  en: 'EN',
  ja: 'JA',
  ko: 'KO',
};

export const Navbar: React.FC<{ onMenuToggle?: () => void }> = ({ onMenuToggle }) => {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('mes-console-theme') as 'dark' | 'light') || 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('mes-light', theme === 'light');
    localStorage.setItem('mes-console-theme', theme);
  }, [theme]);

  return (
    <header className="flex min-h-16 items-center justify-between gap-2 border-b border-border bg-primary px-3 py-2 shadow-[0_12px_32px_rgba(2,6,23,0.28)] sm:px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button onClick={onMenuToggle} variant="ghost" size="icon" className="shrink-0 md:hidden" title={t('common.menu')} aria-label={t('common.menu')}><Menu className="h-5 w-5" /></Button>
        <div className="w-9 h-9 bg-action rounded-md flex items-center justify-center font-black text-action-foreground shadow-lg shadow-orange-600/25">
          W
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-primary-foreground sm:text-base"><span className="sm:hidden">MES</span><span className="hidden sm:inline">S-Factory — MES Console</span></h1>
          <p className="hidden text-xs text-primary-foreground/75 sm:block">{t('navbar.subtitle')}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 lg:gap-4">
        <div className="flex items-center gap-2 text-xs text-primary-foreground/80">
          <span className="hidden lg:inline">{t('navbar.language')}</span>
          <div className="inline-flex rounded-md border border-primary-foreground/25 bg-primary/40 p-1" role="group" aria-label={t('navbar.language')}>
            {SUPPORTED_LOCALES.map((item) => (
              <Button
                key={item}
                variant={locale === item ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLocale(item)}
                title={languageNames[item]}
                aria-pressed={locale === item}
                className="min-w-8 px-1 text-[10px] sm:min-w-9 sm:px-2 sm:text-[11px]"
              >
                {localeLabels[item]}
              </Button>
            ))}
          </div>
        </div>
        <Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} variant="ghost" size="icon" className="hidden sm:inline-flex" title={theme === 'dark' ? t('navbar.lightMode') : t('navbar.darkMode')} aria-label={theme === 'dark' ? t('navbar.lightMode') : t('navbar.darkMode')}>
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <div className="hidden items-center space-x-3 rounded-md border border-primary-foreground/20 bg-primary/35 px-3 py-1.5 lg:flex">
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
