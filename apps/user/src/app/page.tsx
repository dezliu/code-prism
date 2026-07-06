'use client';

import { Card, Col, Row, Tag } from 'antd';
import { AppShell, PageHeader } from '@lingprism/ui';
import { GraphCanvas } from '@lingprism/graph-viz';
import { API_BASE_URL, GRAPHQL_ENDPOINT } from '@lingprism/graphql';

export default function HomePage() {
  return (
    <AppShell appTitle="用户平台" accentColor="#f97316">
      <PageHeader
        title="智能问答与知识探索"
        description="自然语言提问、架构图浏览、代码检索 — Batch 0 脚手架"
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="对话区（待 Batch 3 SSE 实现）">
            <p>GraphQL: {GRAPHQL_ENDPOINT}</p>
            <p>SSE: {API_BASE_URL}/api/chat/stream</p>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="快捷入口">
            <Tag color="orange">智能问答</Tag>
            <Tag>架构图</Tag>
            <Tag>代码检索</Tag>
          </Card>
        </Col>
        <Col span={24}>
          <GraphCanvas />
        </Col>
      </Row>
    </AppShell>
  );
}
