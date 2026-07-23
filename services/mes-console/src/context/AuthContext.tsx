import React, { createContext, useContext, useEffect, useState } from 'react';
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
  hasRole: (role: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  user: null,
  hasRole: () => false,
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

let keycloakInitPromise: Promise<boolean> | null = null;

function initKeycloakOnce() {
  if (!keycloakInitPromise) {
    keycloakInitPromise = keycloak.init({
      onLoad: 'login-required',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    });
  }
  return keycloakInitPromise;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let mounted = true;
    let refreshTimer: number | undefined;

    initKeycloakOnce()
      .then((auth) => {
        if (!mounted) return;
        setAuthenticated(auth);
        if (auth) {
          const parsed = keycloak.tokenParsed as any;
          const realmAccess = parsed?.realm_access?.roles || [];
          const userObj: AuthUser = {
            userId: parsed?.sub || 'anonymous',
            username: parsed?.preferred_username || 'user',
            email: parsed?.email || '',
            roles: realmAccess,
            token: keycloak.token || '',
          };
          setUser(userObj);

          // Token auto refresh
          refreshTimer = window.setInterval(() => {
            keycloak.updateToken(60).catch(() => {
              console.error('[Auth] Token refresh failed');
            });
          }, 30000);
        }
      })
      .catch((err) => {
        console.error('[Auth] Keycloak init error:', err);
      });

    return () => {
      mounted = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, []);

  const hasRole = (role: string) => {
    if (!user) return false;
    return user.roles.includes(role);
  };

  const logout = () => {
    keycloak.logout({ redirectUri: window.location.origin });
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-action border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-400">Đang kết nối Keycloak OIDC...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ authenticated, user, hasRole, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
