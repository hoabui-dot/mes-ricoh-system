import { LogOut } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { useAuth } from '../../context/AuthContext';
import { Button, SelectBase } from '../ui';
export function Topbar() { const { t, locale, setLocale } = useI18n(); const { user, logout } = useAuth(); return <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-5"><div className="text-sm font-semibold text-muted-foreground">{user?.username}</div><div className="flex items-center gap-3"><SelectBase aria-label="Language" value={locale} onValueChange={(value) => setLocale(value as any)} className="h-9 w-20" options={[{ value: 'vi', label: 'VI' }, { value: 'en', label: 'EN' }, { value: 'ja', label: 'JA' }, { value: 'ko', label: 'KO' }]} /><Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" />{t('common.logout')}</Button></div></header>; }
