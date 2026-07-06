'use client';

import { Button, Card, Col, Row, Space, Statistic, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';

export default function MonitorHomePage() {
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

  return (
    <AppShell appTitle="监控平台" accentColor="#6366f1">
      <PageHeader
        title="全局治理看板"
        description={user ? `已登录：${user.displayName}` : '加载中…'}
      />
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
          <Card
            title="看板模块"
            extra={
              <Space>
                {user ? <Tag color="purple">{user.role}</Tag> : null}
                <Button size="small" onClick={handleLogout}>
                  退出
                </Button>
              </Space>
            }
          >
            <p>健康度 · 架构合规 · 知识库质量 · MCP 监控 · 索引状态 — Phase 1 实现</p>
          </Card>
        </Col>
      </Row>
    </AppShell>
  );
}
