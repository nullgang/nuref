export interface ProxyConfig {
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export function getProxyUrl(proxy: ProxyConfig): string {
  const auth = proxy.username ? `${proxy.username}:${proxy.password}@` : '';
  return `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
}

export function getProxyEnv(proxy: ProxyConfig): Record<string, string> {
  const url = getProxyUrl(proxy);
  return {
    HTTP_PROXY: url,
    HTTPS_PROXY: url,
    http_proxy: url,
    https_proxy: url,
    NO_PROXY: '',
    no_proxy: '',
  };
}

export function isProxyAvailable(): boolean {
  try {
    return typeof globalThis.fetch === 'function';
  } catch {
    return false;
  }
}
