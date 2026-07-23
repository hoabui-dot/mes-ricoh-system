import type Keycloak from 'keycloak-js';
import { I18nProvider } from '@mom-platform/i18n-ui-shared';
import PortalPage from './pages/PortalPage.tsx';
import { portalI18n } from './i18n.ts';

interface AppProps {
  keycloak: Keycloak;
}

export default function App({ keycloak }: AppProps) {
  const locale = (keycloak.tokenParsed as Record<string, unknown> | undefined)?.['locale'] as string | undefined;
  return (
    <I18nProvider i18n={portalI18n} initialLocale={locale}>
      <PortalPage keycloak={keycloak} />
    </I18nProvider>
  );
}
