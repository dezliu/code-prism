'use client';

import { Card, Col, Menu, Row } from 'antd';
import {
  AlertOutlined,
  ApiOutlined,
  BookOutlined,
  DatabaseOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import { AppShell, PageHeader } from '@lingprism/ui';

const menuItems = [
  { key: 'repos', icon: <DatabaseOutlined />, label: '代码源管理' },
  { key: 'knowledge', icon: <BookOutlined />, label: '知识库' },
  { key: 'architecture', icon: <PartitionOutlined />, label: '架构图' },
  { key: 'templates', icon: <ApiOutlined />, label: '问答模板' },
  { key: 'alerts', icon: <AlertOutlined />, label: '预警配置' },
];

export default function AdminHomePage() {
  return (
    <AppShell appTitle="管理后台" accentColor="#1677ff">
      <PageHeader title="数据与知识治理" description="Batch 0 脚手架 — 管理后台空壳" />
      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card>
            <Menu mode="inline" items={menuItems} defaultSelectedKeys={['repos']} />
          </Card>
        </Col>
        <Col xs={24} md={18}>
          <Card title="工作台">
            <p>请从左侧选择管理模块。业务功能将在 Phase 1 实现。</p>
          </Card>
        </Col>
      </Row>
    </AppShell>
  );
}
