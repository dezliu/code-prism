'use client';

import { Button, Card, Table, Tag, message } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';

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

export default function HealthPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [scores, setScores] = useState<Array<{ repoName: string | null; score: number }>>([]);
  const [drifts, setDrifts] = useState<Array<{ repoName: string | null; description: string; status: string }>>([]);

  useEffect(() => {
    fetchCurrentUser()
      .then(async (current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        const data = await gql<{
          healthScores: typeof scores;
          archDrifts: typeof drifts;
        }>(`query {
          healthScores { repoName score }
          archDrifts(status: "open") { repoName description status }
        }`);
        setScores(data.healthScores);
        setDrifts(data.archDrifts);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  return (
    <AppShell appTitle="监控平台" accentColor="#06b6d4">
      <PageHeader
        title="健康度与架构合规"
        description={user ? `查看者：${user.displayName}` : ''}
        extra={<Button onClick={() => { logout(); router.replace('/login'); }}>退出</Button>}
      />
      <Card title="代码健康度" style={{ marginBottom: 16 }}>
        <Table
          rowKey={(r) => `${r.repoName}-${r.score}`}
          dataSource={scores}
          columns={[
            { title: '项目', dataIndex: 'repoName' },
            {
              title: '评分',
              dataIndex: 'score',
              render: (v: number) => <Tag color={v < 60 ? 'red' : 'green'}>{v}</Tag>,
            },
          ]}
        />
      </Card>
      <Card title="架构漂移（未处理）">
        <Table
          rowKey={(r) => r.description}
          dataSource={drifts}
          columns={[
            { title: '项目', dataIndex: 'repoName' },
            { title: '漂移描述', dataIndex: 'description' },
            { title: '状态', dataIndex: 'status' },
          ]}
        />
      </Card>
    </AppShell>
  );
}
