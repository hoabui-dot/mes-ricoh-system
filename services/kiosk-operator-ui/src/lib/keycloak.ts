import Keycloak from 'keycloak-js';
import { getKioskRuntimeConfig } from './runtimeConfig';

let keycloakInstance: Keycloak | null = null;
let initPromise: Promise<boolean> | null = null;

export function initKioskSSO() {
  if (!initPromise) {
    const config = getKioskRuntimeConfig();
    keycloakInstance = new Keycloak({
      url: config.keycloakUrl,
      realm: 'wonsealtech',
      clientId: 'mes-client',
    });
    initPromise = keycloakInstance.init({
      onLoad: 'login-required',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    });
  }
  return initPromise;
}

export function getKioskSSOToken() {
  return keycloakInstance?.token || '';
}

export async function refreshKioskSSOToken() {
  if (!keycloakInstance) return '';
  await keycloakInstance.updateToken(60);
  return keycloakInstance.token || '';
}
