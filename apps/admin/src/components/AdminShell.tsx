'use client';

import type { ReactNode } from 'react';
import { AppNav, TopbarBrand } from '@lingprism/ui';
import type { AuthUser } from '@lingprism/graphql';
import { MODULE_LABELS, type AdminModule } from '../lib/modules';

const NAV_SECTIONS: Array<{
  label: string;
  items: Array<{ key: AdminModule; icon: string; label: string }>;
}> = [
  {
    label: '数据治理',
    items: [
      { key: 'repos', icon: '⎇', label: '代码源管理' },
      { key: 'knowledge', icon: '📄', label: '知识库管理' },
    ],
  },
  {
    label: '架构与模板',
    items: [
      { key: 'architecture', icon: '◇', label: '架构图管理' },
      { key: 'templates', icon: '⌘', label: '模板管理' },
    ],
  },
  {
    label: '运维',
    items: [
      { key: 'alerts', icon: '⚡', label: '监控预警配置' },
    ],
  },
];

const MODULE_DESCRIPTIONS: Record<AdminModule, string> = {
  repos: '配置企业 Git 仓库连接，验证连通性并管理索引状态',
  knowledge: '上传维护团队知识文档，关联仓库并发布',
  architecture: '查看系统草稿、编辑修正并发布官方架构图',
  templates: '配置智能问答模板，定义标准化输出格式',
  alerts: '配置健康度阈值与架构漂移预警规则',
};

interface AdminShellProps {
  user: AuthUser | null;
  activeModule: AdminModule | null;
  onModuleSelect: (key: AdminModule) => void;
  onBack: () => void;
  onLogout: () => void;
  children: ReactNode;
}

function userInitial(user: AuthUser | null): string {
  if (!user) return '?';
  const name = user.displayName?.trim();
  if (name) return name.slice(0, 1);
  return user.email.slice(0, 1).toUpperCase();
}

export function AdminShell({
  user,
  activeModule,
  onModuleSelect,
  onBack,
  onLogout,
  children,
}: AdminShellProps) {
  const pageTitle = activeModule ? MODULE_LABELS[activeModule] : '工作台';
  const pageDesc = activeModule
    ? MODULE_DESCRIPTIONS[activeModule]
    : '请从左侧选择管理模块，进行代码源、知识库、架构图与预警配置。';

  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <TopbarBrand href="/" iconClassName="admin-brand-icon" />
        <AppNav current="admin" className="admin-topbar-nav" />
        <div className="admin-topbar-right">
          <span>{user ? `管理员 · ${user.displayName}` : '加载中…'}</span>
          <div className="admin-avatar">{userInitial(user)}</div>
          <button type="button" className="admin-btn admin-btn-ghost admin-btn-sm" onClick={onLogout}>
            退出
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="admin-sidebar-label">{section.label}</div>
              {section.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`admin-nav-item${activeModule === item.key ? ' active' : ''}`}
                  onClick={() => onModuleSelect(item.key)}
                >
                  <span className="admin-nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main className="admin-main">
          <div className="admin-page-header">
            <h1>{pageTitle}</h1>
            <p>{pageDesc}</p>
            {activeModule ? (
              <button
                type="button"
                className="admin-btn admin-btn-ghost admin-btn-sm"
                style={{ marginTop: 8 }}
                onClick={onBack}
              >
                ← 返回工作台
              </button>
            ) : null}
          </div>
          {children}
        </main>
      </div>

      <footer className="admin-footer lp-footer">© 2026 NL Hermes</footer>
    </div>
  );
}
