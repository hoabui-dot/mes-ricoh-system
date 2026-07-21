import Keycloak from 'keycloak-js';

const defaultKeycloakUrl = `${window.location.protocol}//${window.location.hostname}:18080`;

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || defaultKeycloakUrl,
  realm: 'wonsealtech',
  clientId: 'portal-client',
});

export default keycloak;
