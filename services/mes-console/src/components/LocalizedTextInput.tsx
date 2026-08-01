import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { SUPPORTED_LOCALES, languageNames, type LocalizedText, type SupportedLocale, useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Input } from './ui';

interface LocalizedTextInputProps {
  label: string;
  value: Partial<LocalizedText>;
  onChange: (value: Partial<LocalizedText>) => void;
  required?: boolean;
  'data-testid'?: string;
}

export const LocalizedTextInput: React.FC<LocalizedTextInputProps> = ({ label, value, onChange, required, 'data-testid': testId }) => {
  const { t } = useI18n();
  const [activeLocale, setActiveLocale] = useState<SupportedLocale>('vi');
  const applyForAll = () => {
    const source = String(value[activeLocale] ?? '').trim();
    if (source) onChange({ vi: source, en: source, ja: source, ko: source });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-semibold uppercase text-slate-300">
          {label}{required ? ' *' : ''}
        </label>
        <div className="inline-flex rounded-md border border-border bg-slate-950 p-1">
          {SUPPORTED_LOCALES.map((locale) => (
            <Button
              type="button"
              key={locale}
              variant={activeLocale === locale ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveLocale(locale)}
              className="px-2 py-1 text-[11px] uppercase"
              title={languageNames[locale]}
            >
              {locale}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-400">{languageNames[activeLocale]}</span><Button type="button" size="sm" variant="ghost" disabled={!String(value[activeLocale] ?? '').trim()} onClick={applyForAll} title={t('common.applyForAll')}><Copy className="h-3 w-3" />{t('common.applyForAll')}</Button></div><Input
        required={required && activeLocale === 'vi'}
        value={value[activeLocale] ?? ''}
        data-testid={testId}
        onChange={(event) => onChange({ ...value, [activeLocale]: event.target.value })}
      />
      {required && !value.vi && <div className="text-xs text-amber-300">VI {t('common.name')} required</div>}
    </div>
  );
};
