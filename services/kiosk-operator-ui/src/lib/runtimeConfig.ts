declare global {
  interface Window {
    __KIOSK_CONFIG__?: Partial<KioskRuntimeConfig>;
  }
}

export interface KioskRuntimeConfig {
  gatewayUrl: string;
  websocketUrl: string;
  demoCredentialsEnabled: boolean;
  demoUsername: string;
  demoPassword: string;
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export function getKioskRuntimeConfig(): KioskRuntimeConfig {
  const config = window.__KIOSK_CONFIG__ || {};
  return {
    gatewayUrl: trimTrailingSlash(config.gatewayUrl || ''),
    websocketUrl: config.websocketUrl || '',
    demoCredentialsEnabled: config.demoCredentialsEnabled === true,
    demoUsername: config.demoCredentialsEnabled === true ? config.demoUsername || '' : '',
    demoPassword: config.demoCredentialsEnabled === true ? config.demoPassword || '' : '',
  };
}

export function gatewayUrl(path: string) {
  const { gatewayUrl: baseUrl } = getKioskRuntimeConfig();
  if (!baseUrl) throw new Error('KIOSK_GATEWAY_URL_NOT_CONFIGURED');
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function websocketUrl(terminalId: string) {
  const { websocketUrl: baseUrl } = getKioskRuntimeConfig();
  if (!baseUrl) throw new Error('KIOSK_WEBSOCKET_URL_NOT_CONFIGURED');
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}terminal_id=${encodeURIComponent(terminalId)}`;
}
