import Keycloak from 'keycloak-js';

const defaultKeycloakUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:18080` : 'http://100.68.50.41:18080';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || defaultKeycloakUrl,
  realm: 'wonsealtech',
  clientId: 'mes-client',
});

export default keycloak;
