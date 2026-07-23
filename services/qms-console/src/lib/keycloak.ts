import Keycloak from 'keycloak-js';

const defaultUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:18080` : 'http://100.68.50.41:18080';
export default new Keycloak({ url: import.meta.env.VITE_KEYCLOAK_URL || defaultUrl, realm: 'wonsealtech', clientId: 'qms-client' });
