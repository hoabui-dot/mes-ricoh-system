import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import keycloak from './keycloak.ts';
import './index.css';

// Initialize Keycloak with PKCE flow before rendering
keycloak
  .init({
    onLoad: 'login-required',
    pkceMethod: 'S256',
    checkLoginIframe: false,
  })
  .then((authenticated) => {
    if (!authenticated) {
      console.warn('[Portal] Not authenticated — Keycloak should have redirected');
      return;
    }

    // Token auto-refresh: refresh 60s before expiry
    setInterval(() => {
      keycloak.updateToken(60).catch(() => {
        console.error('[Portal] Token refresh failed — logging out');
        void keycloak.logout();
      });
    }, 30_000);

    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App keycloak={keycloak} />
      </React.StrictMode>,
    );
  })
  .catch((err) => {
    console.error('[Portal] Keycloak init failed:', err);
    document.getElementById('root')!.innerHTML = `
      <div style="display:flex;height:100vh;align-items:center;justify-content:center;font-family:Inter,sans-serif;color:#ef4444;">
        <div style="text-align:center">
          <h1>⚠️ Authentication Service Unavailable</h1>
          <p>Cannot connect to Keycloak. Please contact your system administrator.</p>
          <p style="font-size:12px;color:#6b7280">${String(err)}</p>
        </div>
      </div>
    `;
  });
