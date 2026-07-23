import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import keycloak from '../lib/keycloak';

type User = { userId: string; username: string; roles: string[]; token: string };
type AuthValue = { authenticated: boolean; user: User | null; hasRole: (role: string) => boolean; logout: () => void };
const AuthContext = createContext<AuthValue>({ authenticated: false, user: null, hasRole: () => false, logout: () => undefined });
let initPromise: Promise<boolean> | null = null;
const initOnce = () => { if (!initPromise) initPromise = keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false }); return initPromise; };
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false); const [user, setUser] = useState<User | null>(null);
  useEffect(() => { let mounted = true; initOnce().then((auth) => { if (!mounted) return; setAuthenticated(auth); const p = keycloak.tokenParsed as Record<string, any> | undefined; if (auth) setUser({ userId: p?.sub ?? '', username: p?.preferred_username ?? '', roles: p?.realm_access?.roles ?? [], token: keycloak.token ?? '' }); }).catch((e) => console.error('[QMS Auth]', e)); return () => { mounted = false; }; }, []);
  const value = useMemo(() => ({ authenticated, user, hasRole: (role: string) => user?.roles.includes(role) ?? false, logout: () => keycloak.logout({ redirectUri: window.location.origin }) }), [authenticated, user]);
  if (!authenticated) return <div className="flex min-h-screen items-center justify-center bg-[var(--navy-950)] text-slate-200"><div className="h-10 w-10 animate-spin rounded-full border-4 border-action border-t-transparent" /></div>;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
