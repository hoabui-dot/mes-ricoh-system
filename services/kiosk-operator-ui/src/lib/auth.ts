import { clearKioskCache } from './db';

const LOCAL_AUTH_KEYS = ['kiosk_access_token', 'kiosk_operator_id', 'kiosk_terminal_id', 'kiosk_terminal_session_id'];

function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(normalized)) as { exp?: number };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function hasAuthenticatedTerminalSession(terminalId: string) {
  const token = localStorage.getItem('kiosk_access_token');
  const storedTerminal = localStorage.getItem('kiosk_terminal_id');
  const operatorId = localStorage.getItem('kiosk_operator_id');
  const expiresAt = token ? tokenExpiresAt(token) : null;
  return Boolean(token && operatorId && storedTerminal === terminalId && expiresAt && expiresAt > Date.now());
}

export function bearerHeaders() {
  const token = localStorage.getItem('kiosk_access_token');
  if (!token) throw new Error('KIOSK_AUTH_SESSION_REQUIRED');
  return { Authorization: `Bearer ${token}` };
}

export async function clearKioskBrowserSession() {
  for (const key of LOCAL_AUTH_KEYS) localStorage.removeItem(key);
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith('kiosk-command-attempt:') || key?.startsWith('kiosk-active-')) {
      sessionStorage.removeItem(key);
    }
  }
  await clearKioskCache();
}
