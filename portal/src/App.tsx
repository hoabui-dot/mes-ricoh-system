import type Keycloak from 'keycloak-js';
import PortalPage from './pages/PortalPage.tsx';

interface AppProps {
  keycloak: Keycloak;
}

export default function App({ keycloak }: AppProps) {
  return <PortalPage keycloak={keycloak} />;
}
