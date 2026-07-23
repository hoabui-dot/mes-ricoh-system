import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import keycloak from '../lib/keycloak';

interface AuthUser {
  userId: string;
  username: string;
  email: string;
  roles: string[];
  token: string;
}

interface AuthContextType {
  authenticated: boolean;
  user: AuthUser | null;
  canMutate: boolean;
  hasRole: (role: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  user: null,
  canMutate: false,
  hasRole: () => false,
  logout: () => {},
});

let keycloakInitPromise: Promise<boolean> | null = null;

function initKeycloakOnce() {
  if (!keycloakInitPromise) {
    keycloakInitPromise = keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false });
  }
  return keycloakInitPromise;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let mounted = true;
    let refreshTimer: number | undefined;
    initKeycloakOnce()
      .then((auth) => {
        if (!mounted) return;
        setAuthenticated(auth);
        const parsed = keycloak.tokenParsed as Record<string, any> | undefined;
        const roles = parsed?.realm_access?.roles ?? [];
        if (auth) {
          setUser({
            userId: parsed?.sub ?? 'anonymous',
            username: parsed?.preferred_username ?? 'user',
            email: parsed?.email ?? '',
            roles,
            token: keycloak.token ?? '',
          });
          refreshTimer = window.setInterval(() => {
            keycloak.updateToken(60).catch(() => console.error('[Auth] Token refresh failed'));
          }, 30000);
        }
      })
      .catch((error) => console.error('[Auth] Keycloak init error', error));
    return () => {
      mounted = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, []);

  const value = useMemo<AuthContextType>(() => {
    const hasRole = (role: string) => user?.roles.includes(role) ?? false;
    const canMutate = ['WAREHOUSE_STAFF', 'PLANT_MANAGER', 'EXECUTIVE'].some(hasRole);
    return {
      authenticated,
      user,
      canMutate,
      hasRole,
      logout: () => keycloak.logout({ redirectUri: window.location.origin }),
    };
  }, [authenticated, user]);

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--navy-950)] text-slate-200">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-action border-t-transparent" />
          <p className="text-sm font-semibold">Keycloak OIDC</p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
