export type KioskCommandAction = 'start' | 'complete' | 'fail' | 'abort' | 'retry';

const attemptStorageKey = (terminalId: string, woId: string, operationId: string, action: KioskCommandAction) =>
  `kiosk-command-attempt:${terminalId}:${woId}:${operationId}:${action}`;

export function stableAttemptKey(terminalId: string, woId: string, operationId: string, action: KioskCommandAction) {
  const storageKey = attemptStorageKey(terminalId, woId, operationId, action);
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const id = crypto.randomUUID();
  const created = `kiosk-${action}-${id}`;
  sessionStorage.setItem(storageKey, created);
  return created;
}

export function clearAttemptKey(terminalId: string, woId: string, operationId: string, action: KioskCommandAction) {
  sessionStorage.removeItem(attemptStorageKey(terminalId, woId, operationId, action));
}

export function authenticatedCommandHeaders(idempotencyKey: string) {
  const token = localStorage.getItem('kiosk_access_token');
  if (!token) throw new Error('KIOSK_AUTH_SESSION_REQUIRED');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'Idempotency-Key': idempotencyKey,
    'X-Trace-ID': idempotencyKey,
  };
}

export async function commandError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
  return body.error || body.message || `HTTP_${response.status}`;
}
