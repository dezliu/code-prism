'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Card, Col, Menu, Row, Space, Tag } from 'antd';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';
import {
  AlertOutlined,
  ApiOutlined,
  BookOutlined,
  DatabaseOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import { AppShell, PageHeader } from '@lingprism/ui';
import type { AuthUser } from '@lingprism/graphql';
import { MODULE_LABELS, type AdminModule } from '../lib/modules';

const menuItems: MenuProps['items'] = [
  { key: 'repos', icon: <DatabaseOutlined />, label: '代码源管理' },
  { key: 'knowledge', icon: <BookOutlined />, label: '知识库' },
  { key: 'architecture', icon: <PartitionOutlined />, label: '架构图' },
  { key: 'templates', icon: <ApiOutlined />, label: '问答模板' },
  { key: 'alerts', icon: <AlertOutlined />, label: '预警配置' },
];

interface AdminShellProps {
  user: AuthUser | null;
  activeModule: AdminModule | null;
  onModuleSelect: (key: AdminModule) => void;
  onBack: () => void;
  onLogout: () => void;
  children: ReactNode;
}

export function AdminShell({
  user,
  activeModule,
  onModuleSelect,
  onBack,
  onLogout,
  children,
}: AdminShellProps) {
  const contentTitle = activeModule ? MODULE_LABELS[activeModule] : '工作台';

  return (
    <AppShell appTitle="管理后台" accentColor="#1677ff">
      <PageHeader
        title="数据与知识治理"
        description={user ? `已登录：${user.displayName}` : '加载中…'}
        extra={
          <Space>
            {user ? <Tag color="blue">{user.role}</Tag> : null}
            <Button size="small" onClick={onLogout}>
              退出
            </Button>
          </Space>
        }
      />
      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card>
            <Menu
              mode="inline"
              items={menuItems}
              selectedKeys={activeModule ? [activeModule] : []}
              onSelect={(info) => onModuleSelect(info.key as AdminModule)}
            />
          </Card>
        </Col>
        <Col xs={24} md={18}>
          <Card
            title={
              <Space>
                {activeModule ? (
                  <Button
                    type="text"
                    size="small"
                    icon={<ArrowLeftOutlined />}
                    onClick={onBack}
                  >
                    返回工作台
                  </Button>
                ) : null}
                <span>{contentTitle}</span>
              </Space>
            }
          >
            {children}
          </Card>
        </Col>
      </Row>
    </AppShell>
  );
}
