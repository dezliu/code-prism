'use client';

import { Layout, Typography } from 'antd';
import type { ReactNode } from 'react';
import { APP_NAME } from '@lingprism/shared';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

export interface AppShellProps {
  appTitle: string;
  children: ReactNode;
  accentColor?: string;
}

export function AppShell({ appTitle, children, accentColor = '#1677ff' }: AppShellProps) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: '#001529',
        }}
      >
        <Title level={4} style={{ color: '#fff', margin: 0 }}>
          {APP_NAME}
        </Title>
        <Text style={{ color: accentColor, fontWeight: 600 }}>{appTitle}</Text>
      </Header>
      <Content style={{ padding: 24 }}>{children}</Content>
      <Footer style={{ textAlign: 'center' }}>
        灵镜 (LingPrism) · 企业知识与代码智能平台
      </Footer>
    </Layout>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <Title level={2}>{title}</Title>
      {description ? <Text type="secondary">{description}</Text> : null}
    </div>
  );
}

export { AppShell as default };
export { LoginForm } from './LoginForm';
export type { LoginFormProps, LoginFormValues } from './LoginForm';
