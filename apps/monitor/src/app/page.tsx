'use client';

import { Button, Card, Col, Row, Space, Statistic, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export default function MonitorHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState({ repos: 0, risk: 0, failed: 0 });

  useEffect(() => {
    fetchCurrentUser()
      .then(async (current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        const data = await gql<{
          healthScores: Array<{ score: number }>;
          indexJobs: Array<{ status: string }>;
          repos: Array<{ id: string }>;
        }>(`query {
          healthScores { score }
          indexJobs { status }
          repos { id }
        }`);
        setStats({
          repos: data.repos.length,
          risk: data.healthScores.filter((s) => s.score < 60).length,
          failed: data.indexJobs.filter((j) => j.status === 'failed').length,
        });
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  return (
    <AppShell appTitle="监控平台" accentColor="#6366f1">
      <PageHeader
        title="全局治理看板"
        description={user ? `已登录：${user.displayName}` : '加载中…'}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="纳管项目" value={stats.repos} suffix="个" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="风险项目" value={stats.risk} suffix="个" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="索引失败" value={stats.failed} suffix="个" />
          </Card>
        </Col>
        <Col span={24}>
          <Card
            title="看板模块"
            extra={
              <Space>
                {user ? <Tag color="purple">{user.role}</Tag> : null}
                <Button size="small" onClick={() => { logout(); router.replace('/login'); }}>
                  退出
                </Button>
              </Space>
            }
          >
            <Space wrap>
              <Button href="/health">健康度与合规</Button>
              <Button href="/index-status">索引状态</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </AppShell>
  );
}
