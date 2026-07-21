import Keycloak from 'keycloak-js';

const host = typeof window !== 'undefined' ? window.location.hostname : '100.68.50.41';
const defaultKeycloakUrl = `http://${host}:18080`;

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || defaultKeycloakUrl,
  realm: 'wonsealtech',
  clientId: 'mes-client',
});

export default keycloak;
