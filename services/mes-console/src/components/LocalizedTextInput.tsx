import React, { useState } from 'react';
import { SUPPORTED_LOCALES, languageNames, type LocalizedText, type SupportedLocale, useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Input } from './ui';

interface LocalizedTextInputProps {
  label: string;
  value: Partial<LocalizedText>;
  onChange: (value: Partial<LocalizedText>) => void;
  required?: boolean;
}

export const LocalizedTextInput: React.FC<LocalizedTextInputProps> = ({ label, value, onChange, required }) => {
  const { t } = useI18n();
  const [activeLocale, setActiveLocale] = useState<SupportedLocale>('vi');

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
      <Input
        required={required && activeLocale === 'vi'}
        value={value[activeLocale] ?? ''}
        onChange={(event) => onChange({ ...value, [activeLocale]: event.target.value })}
        placeholder={`${languageNames[activeLocale]} ${label}`}
      />
      {required && !value.vi && <div className="text-xs text-amber-300">VI {t('common.name')} required</div>}
    </div>
  );
};
