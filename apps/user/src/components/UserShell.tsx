'use client';

import type { ReactNode } from 'react';
import { AppNav, TopbarBrand } from '@lingprism/ui';
import type { AuthUser } from '@lingprism/graphql';

interface UserShellProps {
  user: AuthUser | null;
  sidebar?: ReactNode;
  children: ReactNode;
}

function userInitial(user: AuthUser | null): string {
  if (!user) return '?';
  const name = user.displayName?.trim();
  if (name) return name.slice(0, 1);
  return user.email.slice(0, 1).toUpperCase();
}

export function UserShell({ user, sidebar, children }: UserShellProps) {
  return (
    <div className="user-app">
      <header className="user-topbar">
        <TopbarBrand href="/" iconClassName="user-brand-icon" />
        <div className="user-search-box">
          <span className="user-search-icon" aria-hidden>⌕</span>
          <input type="search" placeholder="搜索项目、文档或代码…" className="user-search-input" />
        </div>
        <AppNav current="user" className="user-topbar-nav" />
        <div className="user-area">
          <div className="user-avatar" title={user?.displayName ?? user?.email ?? ''}>
            {userInitial(user)}
          </div>
        </div>
      </header>

      <div className="user-layout">
        {sidebar}
        <main className="user-main">{children}</main>
      </div>

      <footer className="user-footer lp-footer">© 2026 NL Hermes</footer>
    </div>
  );
}
