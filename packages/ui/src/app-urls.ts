export type AppId = 'user' | 'admin' | 'monitor';

export interface AppUrls {
  user: string;
  admin: string;
  monitor: string;
}

function withPort(protocol: string, hostname: string, port: string): string {
  const portSuffix = port ? `:${port}` : '';
  return `${protocol}//${hostname}${portSuffix}`;
}

/** Resolve cross-app navigation URLs for dev (3000/3001/3002) and Docker subdomains. */
export function getAppUrls(current?: AppId): AppUrls {
  if (typeof window === 'undefined') {
    return {
      user: 'http://localhost:3000',
      admin: 'http://localhost:3001',
      monitor: 'http://localhost:3002',
    };
  }

  const { protocol, hostname, port } = window.location;

  if (hostname.endsWith('.localhost')) {
    const suffix = hostname.slice(hostname.indexOf('.'));
    return {
      user: withPort(protocol, `user${suffix}`, port),
      admin: withPort(protocol, `admin${suffix}`, port),
      monitor: withPort(protocol, `monitor${suffix}`, port),
    };
  }

  if (port === '3000' || port === '3001' || port === '3002') {
    return {
      user: withPort(protocol, hostname, '3000'),
      admin: withPort(protocol, hostname, '3001'),
      monitor: withPort(protocol, hostname, '3002'),
    };
  }

  const base = withPort(protocol, hostname, port);
  return {
    user: current === 'user' ? base : `${base}`,
    admin: current === 'admin' ? base : `${base}`,
    monitor: current === 'monitor' ? base : `${base}`,
  };
}
