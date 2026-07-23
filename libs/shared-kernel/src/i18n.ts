import { z } from 'zod';

export type SupportedLocale = 'vi' | 'en' | 'ja' | 'ko';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['vi', 'en', 'ja', 'ko'];
export const DEFAULT_LOCALE: SupportedLocale = 'vi';

export type LocalizedText = Partial<Record<SupportedLocale, string>> & { vi: string };

export const localizedTextSchema = z
  .object({
    vi: z.string().trim().min(1),
    en: z.string().trim().min(1).optional(),
    ja: z.string().trim().min(1).optional(),
    ko: z.string().trim().min(1).optional(),
  })
  .strict();

export function isSupportedLocale(value: string): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function resolveLocalizedText(
  value: LocalizedText,
  requestedLocale: SupportedLocale,
  fallback: SupportedLocale = DEFAULT_LOCALE,
): string {
  const requested = value[requestedLocale];
  if (requested) return requested;

  const fallbackValue = value[fallback];
  if (fallbackValue) return fallbackValue;

  const firstAvailable = Object.values(value).find((text) => text);
  return firstAvailable ?? '';
}
