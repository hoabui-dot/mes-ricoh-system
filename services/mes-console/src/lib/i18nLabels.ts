export function translatedEnum(
  t: (key: string, params?: Record<string, string | number | undefined>) => string,
  prefix: string,
  value?: string | null,
): string {
  if (!value) return '-';
  const normalized = normalizeStatusCode(value);
  const key = `${prefix}.${normalized}`;
  const label = t(key);
  return label === key ? value : label;
}

export function normalizeStatusCode(value?: string | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
