'use client';

import { Button, Card, Space, Table, Tag, message } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';

interface HealthRow {
  id: string;
  repoName: string | null;
  score: number;
  metrics: Record<string, unknown> | null;
}

interface DriftRow {
  id: string;
  repoName: string | null;
  description: string;
  status: string;
  driftType: string;
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export default function HealthPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [scores, setScores] = useState<HealthRow[]>([]);
  const [drifts, setDrifts] = useState<DriftRow[]>([]);

  const load = async () => {
    const data = await gql<{ healthScores: HealthRow[]; archDrifts: DriftRow[] }>(`
      query {
        healthScores { id repoName score metrics }
        archDrifts(status: "open") { id repoName description status driftType }
      }
    `);
    setScores(data.healthScores);
    setDrifts(data.archDrifts);
  };

  useEffect(() => {
    fetchCurrentUser()
      .then(async (current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        await load();
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const resolveDrift = async (id: string, status: string) => {
    try {
      await gql(`mutation($id: ID!, $status: String!) { resolveArchDrift(id: $id, status: $status) { id status } }`, { id, status });
      message.success(status === 'resolved' ? '已标记为已处理' : '已忽略');
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败');
    }
  };

  return (
    <AppShell appTitle="监控平台" accentColor="#06b6d4">
      <PageHeader
        title="健康度与架构合规"
        description={user ? `查看者：${user.displayName}` : ''}
        extra={
          <Space>
            <Button href="/">看板首页</Button>
            <Button onClick={() => { logout(); router.replace('/login'); }}>退出</Button>
          </Space>
        }
      />
      <Card title="代码健康度" style={{ marginBottom: 16 }}>
        <Table
          rowKey="id"
          dataSource={scores}
          columns={[
            { title: '项目', dataIndex: 'repoName' },
            {
              title: '评分',
              dataIndex: 'score',
              render: (v: number) => <Tag color={v < 60 ? 'red' : 'green'}>{v}</Tag>,
            },
            {
              title: '指标',
              render: (_, row) => row.metrics ? JSON.stringify(row.metrics) : '-',
            },
          ]}
        />
      </Card>
      <Card title="架构漂移（未处理）">
        <Table
          rowKey="id"
          dataSource={drifts}
          columns={[
            { title: '项目', dataIndex: 'repoName' },
            { title: '类型', dataIndex: 'driftType' },
            { title: '漂移描述', dataIndex: 'description' },
            { title: '状态', dataIndex: 'status' },
            {
              title: '操作',
              render: (_, row) => (
                <Space>
                  <Button size="small" onClick={() => resolveDrift(row.id, 'resolved')}>处理</Button>
                  <Button size="small" onClick={() => resolveDrift(row.id, 'ignored')}>忽略</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </AppShell>
  );
}
