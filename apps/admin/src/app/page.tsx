'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Menu, Row, Space, Tag, message } from 'antd';
import {
  AlertOutlined,
  ApiOutlined,
  BookOutlined,
  DatabaseOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import { AppShell, PageHeader } from '@lingprism/ui';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';

const menuItems = [
  { key: 'repos', icon: <DatabaseOutlined />, label: '代码源管理' },
  { key: 'knowledge', icon: <BookOutlined />, label: '知识库' },
  { key: 'architecture', icon: <PartitionOutlined />, label: '架构图' },
  { key: 'templates', icon: <ApiOutlined />, label: '问答模板' },
  { key: 'alerts', icon: <AlertOutlined />, label: '预警配置' },
];

const MENU_ROUTES: Record<string, string> = {
  repos: '/repos',
};

export default function AdminHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const handleMenuSelect = (info: { key: string }) => {
    const route = MENU_ROUTES[info.key];
    if (route) {
      router.push(route);
      return;
    }
    message.info('该模块将在 Phase 1 实现');
  };

  return (
    <AppShell appTitle="管理后台" accentColor="#1677ff">
      <PageHeader
        title="数据与知识治理"
        description={user ? `已登录：${user.displayName}` : '加载中…'}
      />
      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card>
            <Menu
              mode="inline"
              items={menuItems}
              defaultSelectedKeys={['repos']}
              onSelect={handleMenuSelect}
            />
          </Card>
        </Col>
        <Col xs={24} md={18}>
          <Card
            title="工作台"
            extra={
              <Space>
                {user ? <Tag color="blue">{user.role}</Tag> : null}
                <Button size="small" onClick={handleLogout}>
                  退出
                </Button>
              </Space>
            }
          >
            <p>请从左侧选择管理模块。业务功能将在 Phase 1 实现。</p>
          </Card>
        </Col>
      </Row>
    </AppShell>
  );
}
