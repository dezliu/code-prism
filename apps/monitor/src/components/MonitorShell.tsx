'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AppNav, TopbarBrand } from '@lingprism/ui';

interface MonitorShellProps {
  children: ReactNode;
}

export function MonitorShell({ children }: MonitorShellProps) {
  const [clock, setClock] = useState('--:--:--');

  useEffect(() => {
    const update = () => {
      setClock(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="monitor-app">
      <header className="monitor-topbar">
        <TopbarBrand href="/" iconClassName="monitor-brand-icon" />
        <div className="monitor-topbar-center">
          <span className="monitor-live-dot" />
          <span>实时监控 · 数据延迟 &lt; 5min</span>
        </div>
        <AppNav current="monitor" className="monitor-topbar-nav" />
        <span className="monitor-topbar-time">{clock}</span>
      </header>

      <main className="monitor-main">{children}</main>

      <footer className="monitor-footer lp-footer">© 2026 NL Hermes</footer>
    </div>
  );
}
