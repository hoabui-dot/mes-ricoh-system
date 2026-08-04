import React from 'react';
import { Languages } from 'lucide-react';
import { SUPPORTED_LOCALES, languageNames, useI18n, type SupportedLocale } from '@mom-platform/i18n-ui-shared';

export const LanguageSelect: React.FC = () => {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="relative flex min-h-12 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 focus-within:border-indigo-400">
      <Languages className="h-5 w-5 text-slate-400" aria-hidden="true" />
      <span className="sr-only">{t('kiosk.language')}</span>
      <select
        aria-label={t('kiosk.language')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as SupportedLocale)}
        className="min-h-11 bg-transparent pr-2 outline-none"
      >
        {SUPPORTED_LOCALES.map((item) => (
          <option key={item} value={item} className="bg-slate-900">
            {languageNames[item]}
          </option>
        ))}
      </select>
    </label>
  );
};
