'use client';

import type { AppId } from './app-urls';
import { getAppUrls } from './app-urls';

interface AppNavProps {
  current: AppId;
  className?: string;
}

export function AppNav({ current, className = 'lp-topbar-nav' }: AppNavProps) {
  const urls = getAppUrls(current);

  return (
    <nav className={className}>
      <a href={urls.admin} className={current === 'admin' ? 'active' : undefined}>
        管理后台
      </a>
      <a href={urls.user} className={current === 'user' ? 'active' : undefined}>
        用户平台
      </a>
      <a href={urls.monitor} className={current === 'monitor' ? 'active' : undefined}>
        监控中心
      </a>
    </nav>
  );
}
