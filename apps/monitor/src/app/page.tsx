'use client';

import { Card, Col, Row, Statistic } from 'antd';
import { AppShell, PageHeader } from '@lingprism/ui';

export default function MonitorHomePage() {
  return (
    <AppShell appTitle="监控平台" accentColor="#6366f1">
      <PageHeader title="全局治理看板" description="Batch 0 脚手架 — 监控平台空壳" />
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="纳管项目" value={0} suffix="个" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="风险项目" value={0} suffix="个" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="索引失败" value={0} suffix="个" />
          </Card>
        </Col>
        <Col span={24}>
          <Card title="看板模块">
            <p>健康度 · 架构合规 · 知识库质量 · MCP 监控 · 索引状态 — Phase 1 实现</p>
          </Card>
        </Col>
      </Row>
    </AppShell>
  );
}
