import React from 'react';
import { Copy } from 'lucide-react';
import { SUPPORTED_LOCALES, languageNames, type SupportedLocale, useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Input } from './ui';

export type LocalizedValues = { vi: string; en: string; ja: string; ko: string };

export const emptyLocalized = (): LocalizedValues => ({ vi: '', en: '', ja: '', ko: '' });

export function LocalizedTextFields({ label, value, onChange, required = false, multiline = false }: { label: string; value: LocalizedValues; onChange: (value: LocalizedValues) => void; required?: boolean; multiline?: boolean }) {
  const { t } = useI18n();
  const [activeLocale, setActiveLocale] = React.useState<SupportedLocale>('vi');
  const applyForAll = () => {
    const source = value[activeLocale].trim();
    if (!source) return;
    onChange({ vi: source, en: source, ja: source, ko: source });
  };
  return <fieldset className="space-y-3 rounded-md border border-border bg-surface-subtle p-4"><legend className="px-1 text-sm font-semibold text-foreground">{label}{required ? ' *' : ''}</legend><div className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-1">{SUPPORTED_LOCALES.map((locale) => <Button type="button" key={locale} variant={activeLocale === locale ? 'default' : 'ghost'} size="sm" onClick={() => setActiveLocale(locale)} className="min-w-12 px-2 py-1 text-[11px] uppercase" title={languageNames[locale]}>{locale}</Button>)}</div><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{languageNames[activeLocale]}</span><Button type="button" size="sm" variant="ghost" disabled={!value[activeLocale].trim()} onClick={applyForAll} title={t('common.applyForAll')}><Copy className="h-3 w-3" />{t('common.applyForAll')}</Button></div>{multiline ? <textarea required={required && activeLocale === 'vi'} value={value[activeLocale]} onChange={(event) => onChange({ ...value, [activeLocale]: event.target.value })} rows={3} className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-action" /> : <Input required={required && activeLocale === 'vi'} value={value[activeLocale]} onChange={(event) => onChange({ ...value, [activeLocale]: event.target.value })} />}{required && !value.vi.trim() && <div className="text-xs text-amber-300">VI {t('common.name')} required</div>}</fieldset>;
}
